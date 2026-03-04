#!/usr/bin/env python3
"""STT Worker - Whisper speech-to-text subprocess.

Reads audio file path from stdin, outputs JSON transcription to stdout.
Tries faster-whisper first, falls back to mlx-whisper.
"""

import sys
import json
import os

def transcribe_faster_whisper(audio_path: str) -> dict:
    from faster_whisper import WhisperModel
    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio_path, language="ko")
    text = " ".join(segment.text for segment in segments)
    return {"text": text.strip(), "language": info.language}

def transcribe_mlx_whisper(audio_path: str) -> dict:
    import mlx_whisper
    result = mlx_whisper.transcribe(audio_path, language="ko")
    return {"text": result["text"].strip(), "language": "ko"}

def main():
    audio_path = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.readline().strip()

    if not audio_path or not os.path.exists(audio_path):
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)

    try:
        result = transcribe_faster_whisper(audio_path)
    except ImportError:
        try:
            result = transcribe_mlx_whisper(audio_path)
        except ImportError:
            result = {"error": "No whisper backend available. Install faster-whisper or mlx-whisper."}
            print(json.dumps(result))
            sys.exit(1)
    except Exception as e:
        result = {"error": str(e)}
        print(json.dumps(result))
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
