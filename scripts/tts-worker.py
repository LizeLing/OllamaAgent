#!/usr/bin/env python3
"""TTS Worker - edge-tts text-to-speech subprocess.

Reads JSON from stdin: {"text": "...", "voice": "...", "output": "path"}
Generates audio file and outputs JSON result to stdout.
"""

import sys
import json
import asyncio

async def synthesize(text: str, voice: str, output_path: str) -> dict:
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)
    return {"success": True, "output": output_path}

def main():
    try:
        input_data = json.loads(sys.stdin.readline())
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)

    text = input_data.get("text", "")
    voice = input_data.get("voice", "ko-KR-SunHiNeural")
    output_path = input_data.get("output", "/tmp/tts_output.mp3")

    if not text:
        print(json.dumps({"error": "No text provided"}))
        sys.exit(1)

    try:
        result = asyncio.run(synthesize(text, voice, output_path))
        print(json.dumps(result))
    except ImportError:
        print(json.dumps({"error": "edge-tts not installed. Run: pip install edge-tts"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
