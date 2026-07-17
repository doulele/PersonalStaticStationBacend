#!/usr/bin/env python3
"""
声纹注册脚本 — 从音频样本中提取说话人特征向量 (ECAPA-TDNN embedding)
由 Node.js 后端调用，输入音频文件路径，输出 embedding JSON

依赖安装:
  pip install speechbrain torch torchaudio
  # 或使用轻量方案:
  pip install resemblyzer

用法:
  python enroll_voiceprint.py --audio /path/to/sample.wav [--output /path/to/output.json]
"""

import argparse
import json
import sys
import os


# ===== 方案A: speechbrain ECAPA-TDNN =====
def extract_embedding_speechbrain(audio_path):
    """
    使用 speechbrain 的预训练 ECAPA-TDNN 模型提取声纹特征向量
    模型首次使用时会自动下载 (~200MB)
    """
    try:
        from speechbrain.inference.speaker import EncoderClassifier
    except ImportError:
        raise ImportError(
            "speechbrain 未安装。请执行:\n"
            "pip install speechbrain\n"
            "依赖较多（torch 等），安装可能较慢。"
        )

    classifier = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir=os.path.join(os.path.dirname(__file__), "..", "models", "speechbrain_ecapa"),
        run_opts={"device": "cpu"}
    )

    signal = classifier.load_audio(audio_path)
    embedding = classifier.encode_batch(signal)

    # 转换为 Python list
    emb_list = embedding.squeeze().cpu().detach().numpy().tolist()
    return emb_list


# ===== 方案B: Resemblyzer (轻量方案) =====
def extract_embedding_resemblyzer(audio_path):
    """
    使用 Resemblyzer 提取声纹特征向量 (轻量依赖，推荐作为备选)
    pip install resemblyzer
    """
    try:
        import librosa
        from resemblyzer import VoiceEncoder
    except ImportError:
        raise ImportError(
            "resemblyzer 未安装。请执行:\n"
            "pip install resemblyzer\n"
            "这是轻量方案，依赖较少。"
        )

    encoder = VoiceEncoder()
    # 加载音频 (16kHz)
    wav, sr = librosa.load(audio_path, sr=16000)

    # 取音频中间 10 秒（最稳定的部分）
    if len(wav) > sr * 15:
        start = sr * 2  # 跳过前2秒
        wav = wav[start:start + sr * 10]

    embedding = encoder.embed_utterance(wav)
    return embedding.tolist()


def main():
    parser = argparse.ArgumentParser(description="声纹注册 — 提取说话人特征向量")
    parser.add_argument("--audio", required=True, help="音频文件路径 (wav/mp3/m4a)")
    parser.add_argument("--output", default="", help="输出 JSON 文件路径（可选）")
    parser.add_argument("--engine", default="speechbrain",
                        choices=["speechbrain", "resemblyzer"],
                        help="使用哪个模型提取特征")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(json.dumps({"success": False, "error": f"音频文件不存在: {args.audio}"}),
              ensure_ascii=False)
        sys.exit(1)

    try:
        if args.engine == "speechbrain":
            embedding = extract_embedding_speechbrain(args.audio)
        else:
            embedding = extract_embedding_resemblyzer(args.audio)
    except ImportError as e:
        # speechbrain 失败了，尝试 resemblyzer 作为回退
        if args.engine == "speechbrain":
            try:
                print("speechbrain 不可用，尝试使用 resemblyzer...", file=sys.stderr)
                embedding = extract_embedding_resemblyzer(args.audio)
            except ImportError:
                print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
                sys.exit(1)
        else:
            print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
            sys.exit(1)
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    result = {
        "success": True,
        "embedding": embedding,
        "embeddingDim": len(embedding),
        "engine": args.engine
    }

    if args.output:
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
        print(f"已保存到 {args.output}", file=sys.stderr)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
