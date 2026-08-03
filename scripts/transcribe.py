#!/usr/bin/env python3
"""faster-whisper 转写脚本，由 Node.js 后端调用"""

import argparse
import json
import sys
import os

def main():
    parser = argparse.ArgumentParser(description='Whisper 转写')
    parser.add_argument('--audio', required=True, help='音频文件路径')
    parser.add_argument('--language', default='zh', help='语言代码')
    parser.add_argument('--model', default='base', help='模型名称或路径')
    parser.add_argument('--hotwords', default='', help='热词，逗号分隔')
    parser.add_argument('--device', default='cpu', help='设备 cpu/cuda')
    parser.add_argument('--compute-type', default='int8', help='计算精度')
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(json.dumps({"error": f"音频文件不存在: {args.audio}"}), file=sys.stderr)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "faster-whisper 未安装，请执行: pip install faster-whisper"}),
              file=sys.stderr)
        sys.exit(1)

    # 模型路径：如果指定路径存在则使用，否则作为模型名称加载
    if os.path.exists(args.model):
        model_path = args.model
    elif args.model.startswith('/') or args.model.startswith('.') or '\\' in args.model:
        # 是本地路径但不存在 → 回退用 base 模型（首次自动下载）
        model_path = 'base'
    else:
        model_path = args.model  # 作为 HuggingFace 模型名，自动下载

    hotwords = args.hotwords
    hotword_list = [w.strip() for w in hotwords.split(',') if w.strip()] if hotwords else None

    model = WhisperModel(model_path, device=args.device, compute_type=args.compute_type)

    # 转写参数
    transcribe_opts = {
        "language": args.language if args.language != 'auto' else None,
        "beam_size": 5,
        "vad_filter": True,
    }
    if hotword_list:
        transcribe_opts["hotwords"] = " ".join(hotword_list)

    segments, info = model.transcribe(args.audio, **transcribe_opts)

    result = {
        "text": "",
        "segments": [],
        "language": info.language,
        "duration": info.duration,
    }

    texts = []
    for segment in segments:
        texts.append(segment.text.strip())
        result["segments"].append({
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "text": segment.text.strip()
        })

    result["text"] = "".join(texts)
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
