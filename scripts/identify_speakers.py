#!/usr/bin/env python3
"""
说话人识别 — 对转写后的音频分段进行说话人匹配
由 Node.js 后端调用

输入: 音频文件 + whisper 分段结果 + 已注册声纹
输出: 每个分段的对应成员信息

依赖: 与 enroll_voiceprint.py 相同的声纹提取库

用法:
  python identify_speakers.py \
    --audio /path/to/meeting.wav \
    --segments '[{"start":0,"end":5.2,"text":"大家好"},...]' \
    --voiceprints '[{"memberId":"xxx","name":"张三","embedding":[...]},...]'
"""

import argparse
import json
import sys
import os
import subprocess
import tempfile
import numpy as np


def cosine_similarity(a, b):
    """计算余弦相似度"""
    a = np.array(a)
    b = np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)


def extract_audio_segment(input_audio, start, end, output_path):
    """
    用 ffmpeg 从音频中切出指定时间段的片段
    """
    duration = end - start
    if duration < 0.5:
        # 太短的片段增加一些上下文
        start = max(0, start - 0.5)
        duration = min(end - start + 1.0, 30)

    cmd = [
        "ffmpeg", "-y", "-v", "quiet",
        "-ss", str(start),
        "-t", str(duration),
        "-i", input_audio,
        "-ac", "1",           # 单声道
        "-ar", "16000",       # 16kHz
        "-sample_fmt", "s16", # 16位
        output_path
    ]
    try:
        subprocess.run(cmd, check=True, timeout=30)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 1000
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return False


def check_ffmpeg():
    """检查 ffmpeg 是否可用"""
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return False


def load_extractor(engine="speechbrain"):
    """
    加载声纹提取器，优先 speechbrain，回退 resemblyzer
    """
    errors = []
    models_dir = os.path.join(os.path.dirname(__file__), "..", "models", "speechbrain_ecapa")

    if engine == "speechbrain" or engine == "auto":
        try:
            from speechbrain.inference.speaker import EncoderClassifier
            classifier = EncoderClassifier.from_hparams(
                source="speechbrain/spkrec-ecapa-voxceleb",
                savedir=models_dir,
                run_opts={"device": "cpu"}
            )

            def extract(audio_path):
                signal = classifier.load_audio(audio_path)
                emb = classifier.encode_batch(signal)
                return emb.squeeze().cpu().detach().numpy().tolist()

            return extract, "speechbrain"
        except Exception as e:
            errors.append(f"speechbrain: {e}")

    try:
        import librosa
        from resemblyzer import VoiceEncoder

        encoder = VoiceEncoder()

        def extract(audio_path):
            wav, sr = librosa.load(audio_path, sr=16000)
            return encoder.embed_utterance(wav).tolist()

        return extract, "resemblyzer"
    except Exception as e:
        errors.append(f"resemblyzer: {e}")

    raise RuntimeError("没有可用的声纹提取引擎。错误: " + "; ".join(errors))


def main():
    parser = argparse.ArgumentParser(description="说话人识别")
    parser.add_argument("--audio", required=True, help="会议音频路径")
    parser.add_argument("--segments", required=True, help="Whisper 分段 JSON 字符串")
    parser.add_argument("--voiceprints", required=True, help="已注册声纹 JSON 字符串")
    parser.add_argument("--engine", default="auto", choices=["auto", "speechbrain", "resemblyzer"])
    parser.add_argument("--threshold", type=float, default=0.5,
                        help="置信度阈值，低于此值不匹配 (默认 0.5)")
    args = parser.parse_args()

    # 检查 ffmpeg
    if not check_ffmpeg():
        print(json.dumps(
            {"success": False, "error": "ffmpeg 未安装。请使用系统包管理器安装 ffmpeg。"},
            ensure_ascii=False
        ))
        sys.exit(1)

    # 解析输入
    try:
        segments = json.loads(args.segments)
        voiceprints = json.loads(args.voiceprints)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"JSON 解析失败: {e}"}, ensure_ascii=False))
        sys.exit(1)

    if not voiceprints:
        # 没有声纹 → 全部返回 unknown
        result = {
            "success": True,
            "segments": [{**s, "speakerId": None, "speakerName": None, "confidence": 0} for s in segments],
            "note": "没有已注册声纹，无法识别说话人"
        }
        print(json.dumps(result, ensure_ascii=False))
        return

    if not os.path.exists(args.audio):
        print(json.dumps({"success": False, "error": f"音频不存在: {args.audio}"}, ensure_ascii=False))
        sys.exit(1)

    # 加载提取器
    try:
        extract_fn, engine = load_extractor(args.engine)
    except RuntimeError as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    # 处理每个分段
    results = []
    tmp_dir = tempfile.mkdtemp(prefix="vprint_")

    try:
        for i, seg in enumerate(segments):
            start = seg.get("start", 0)
            end = seg.get("end", start + 5)
            chunk_path = os.path.join(tmp_dir, f"seg_{i}.wav")

            if not extract_audio_segment(args.audio, start, end, chunk_path):
                results.append({**seg, "speakerId": None, "speakerName": None, "confidence": 0})
                continue

            try:
                emb = extract_fn(chunk_path)
            except Exception:
                results.append({**seg, "speakerId": None, "speakerName": None, "confidence": 0})
                continue

            # 与所有声纹比对
            best = None
            best_score = -1
            for vp in voiceprints:
                score = cosine_similarity(emb, vp["embedding"])
                if score > best_score:
                    best_score = score
                    best = vp

            if best and best_score >= args.threshold:
                results.append({
                    **seg,
                    "speakerId": best["memberId"],
                    "speakerName": best.get("memberName", ""),
                    "confidence": round(float(best_score), 4)
                })
            else:
                results.append({
                    **seg,
                    "speakerId": None,
                    "speakerName": None,
                    "confidence": round(float(best_score) if best_score > -1 else 0, 4)
                })

    finally:
        # 清理临时文件
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)

    # 统计
    matched = sum(1 for s in results if s.get("speakerId"))
    print(json.dumps({
        "success": True,
        "segments": results,
        "engine": engine,
        "summary": {
            "total": len(results),
            "matched": matched,
            "unmatched": len(results) - matched
        }
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
