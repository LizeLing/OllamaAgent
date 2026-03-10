#!/usr/bin/env python3
"""
Z-Image Client for Claude Code Skill

Supports:
- generate: Text prompt -> image generation
- generate-json: JSON parameters -> image generation
- check: Server status and model verification

Usage:
    z_image_client.py generate --prompt <prompt> [--output <path>] [--format <file|base64>]
    z_image_client.py generate-json --json <json_string>
    z_image_client.py generate-json --file <json_file>
    z_image_client.py check

Requirements:
    - macOS only (z-image-turbo does not support Linux/Windows yet)
    - Ollama installed and running
    - z-image-turbo model pulled: ollama pull x/z-image-turbo
"""

import argparse
import base64
import json
import sys
import random
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
import urllib.request
import urllib.error


DEFAULT_HOST = "http://localhost:11434"
MODEL_NAME = "x/z-image-turbo"

# Default generation parameters
DEFAULT_PARAMS = {
    "width": 1024,
    "height": 1024,
    "seed": -1,
    "steps": 20,
    "format": "file",
    "output": None,
}


class ZImageClient:
    """Z-Image client for text-to-image generation via Ollama."""

    def __init__(self, host: str = DEFAULT_HOST):
        self.host = host.rstrip('/')

    def _request(self, endpoint: str, data: Optional[Dict] = None,
                 method: str = "POST", timeout: int = 600) -> Dict[str, Any]:
        """Make HTTP request to Ollama API."""
        url = f"{self.host}{endpoint}"

        if data:
            data_bytes = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=data_bytes, method=method)
            req.add_header('Content-Type', 'application/json')
        else:
            req = urllib.request.Request(url, method="GET")

        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.URLError as e:
            return {"error": f"Connection failed: {e.reason}"}
        except urllib.error.HTTPError as e:
            try:
                error_body = e.read().decode('utf-8')
                error_data = json.loads(error_body)
                return {"error": error_data.get("error", str(e))}
            except:
                return {"error": str(e)}
        except json.JSONDecodeError:
            return {"error": "Invalid JSON response"}

    def check_server(self) -> bool:
        """Check if Ollama server is running."""
        try:
            req = urllib.request.Request(self.host)
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status == 200
        except:
            return False

    def check_model(self) -> Dict[str, Any]:
        """Check if z-image-turbo model is available."""
        result = self._request("/api/tags", method="GET")
        if "error" in result:
            return result

        models = result.get("models", [])
        for m in models:
            name = m.get("name", "")
            if "z-image-turbo" in name:
                return {
                    "available": True,
                    "model": name,
                    "size_gb": m.get("size", 0) / (1024**3)
                }

        return {
            "available": False,
            "error": f"Model '{MODEL_NAME}' not found. Run: ollama pull {MODEL_NAME}"
        }

    def generate_image(
        self,
        prompt: str,
        negative_prompt: Optional[str] = None,
        width: int = 1024,
        height: int = 1024,
        seed: int = -1,
        steps: int = 20,
        output_format: str = "file",
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate image from text prompt using OpenAI-compatible API.

        Args:
            prompt: Text description of the image to generate
            negative_prompt: Elements to exclude from the image (optional)
            width: Image width (default: 1024)
            height: Image height (default: 1024)
            seed: Random seed (-1 for random)
            steps: Generation steps (more = better quality but slower)
            output_format: "file" to save to disk, "base64" to return encoded data
            output_path: File path for output (required if format is "file")

        Returns:
            Dict with success status and either file path or base64 data
        """
        # Process seed
        actual_seed = seed if seed >= 0 else random.randint(0, 2**32 - 1)

        # Build full prompt with negative prompt if provided
        full_prompt = prompt
        if negative_prompt:
            full_prompt = f"{prompt} --no {negative_prompt}"

        # Use OpenAI-compatible images API
        data = {
            "model": MODEL_NAME,
            "prompt": full_prompt,
            "size": f"{width}x{height}",
            "response_format": "b64_json",
            "n": 1,
        }

        # Note: seed and steps may need to be passed through options
        # The API support for these varies by implementation

        print(f"Generating image...", file=sys.stderr)
        print(f"  Prompt: {prompt[:50]}{'...' if len(prompt) > 50 else ''}", file=sys.stderr)
        print(f"  Size: {width}x{height}", file=sys.stderr)
        print(f"  Seed: {actual_seed}", file=sys.stderr)

        result = self._request("/v1/images/generations", data, timeout=600)

        if "error" in result:
            return result

        # Extract base64 image data
        try:
            image_data = result["data"][0]["b64_json"]
        except (KeyError, IndexError) as e:
            return {"error": f"Failed to extract image data: {e}"}

        # Handle output format
        if output_format == "base64":
            return {
                "success": True,
                "format": "base64",
                "data": image_data,
                "seed": actual_seed,
                "prompt": prompt,
            }

        # Save to file
        if not output_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = f"z_image_{timestamp}.png"

        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        try:
            image_bytes = base64.b64decode(image_data)
            output_file.write_bytes(image_bytes)
            return {
                "success": True,
                "format": "file",
                "path": str(output_file.absolute()),
                "seed": actual_seed,
                "prompt": prompt,
            }
        except Exception as e:
            return {"error": f"Failed to save image: {e}"}


def parse_json_params(json_str: str) -> Dict[str, Any]:
    """Parse JSON parameters string."""
    try:
        params = json.loads(json_str)
        return params
    except json.JSONDecodeError as e:
        return {"error": f"Invalid JSON: {e}"}


def load_json_file(file_path: str) -> Dict[str, Any]:
    """Load JSON parameters from file."""
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}"}

    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as e:
        return {"error": f"Invalid JSON in file: {e}"}
    except Exception as e:
        return {"error": f"Failed to read file: {e}"}


def main():
    parser = argparse.ArgumentParser(
        description="Z-Image Client - Text to Image Generation via Ollama"
    )
    parser.add_argument("--host", default=DEFAULT_HOST,
                       help="Ollama host URL")

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Check command
    subparsers.add_parser("check", help="Check server and model status")

    # Generate command (simple)
    gen_parser = subparsers.add_parser("generate",
                                       help="Generate image from text prompt")
    gen_parser.add_argument("--prompt", "-p", required=True,
                           help="Text prompt for image generation")
    gen_parser.add_argument("--negative", "-n",
                           help="Negative prompt (elements to exclude)")
    gen_parser.add_argument("--output", "-o",
                           help="Output file path")
    gen_parser.add_argument("--width", "-W", type=int, default=1024,
                           help="Image width (default: 1024)")
    gen_parser.add_argument("--height", "-H", type=int, default=1024,
                           help="Image height (default: 1024)")
    gen_parser.add_argument("--seed", "-s", type=int, default=-1,
                           help="Random seed (-1 for random)")
    gen_parser.add_argument("--steps", type=int, default=20,
                           help="Generation steps (default: 20)")
    gen_parser.add_argument("--format", "-f", choices=["file", "base64"],
                           default="file",
                           help="Output format (default: file)")

    # Generate-JSON command
    json_parser = subparsers.add_parser("generate-json",
                                        help="Generate image from JSON parameters")
    json_group = json_parser.add_mutually_exclusive_group(required=True)
    json_group.add_argument("--json", "-j",
                           help="JSON parameters string")
    json_group.add_argument("--file", "-f",
                           help="Path to JSON parameters file")

    args = parser.parse_args()
    client = ZImageClient(args.host)

    # Check command
    if args.command == "check":
        print("Checking Z-Image setup...")
        print()

        # Check server
        if client.check_server():
            print("[OK] Ollama server is running")
        else:
            print("[ERROR] Ollama server is not running")
            print("  Start with: ollama serve")
            sys.exit(1)

        # Check model
        model_status = client.check_model()
        if model_status.get("available"):
            print(f"[OK] Model available: {model_status['model']}")
            print(f"     Size: {model_status['size_gb']:.1f} GB")
        else:
            print(f"[ERROR] {model_status.get('error', 'Model not found')}")
            print(f"  Install with: ollama pull {MODEL_NAME}")
            sys.exit(1)

        print()
        print("Z-Image is ready for use!")
        return

    # Check server before generation
    if not client.check_server():
        print("Error: Ollama server is not running", file=sys.stderr)
        print("Please start Ollama: ollama serve", file=sys.stderr)
        sys.exit(1)

    # Generate command
    if args.command == "generate":
        result = client.generate_image(
            prompt=args.prompt,
            negative_prompt=args.negative,
            width=args.width,
            height=args.height,
            seed=args.seed,
            steps=args.steps,
            output_format=args.format,
            output_path=args.output,
        )

    # Generate-JSON command
    elif args.command == "generate-json":
        if args.json:
            params = parse_json_params(args.json)
        else:
            params = load_json_file(args.file)

        if "error" in params:
            print(f"Error: {params['error']}", file=sys.stderr)
            sys.exit(1)

        # Extract parameters with defaults
        result = client.generate_image(
            prompt=params.get("prompt", ""),
            negative_prompt=params.get("negative_prompt"),
            width=params.get("width", 1024),
            height=params.get("height", 1024),
            seed=params.get("seed", -1),
            steps=params.get("steps", 20),
            output_format=params.get("format", "file"),
            output_path=params.get("output"),
        )

    # Handle result
    if "error" in result:
        print(f"Error: {result['error']}", file=sys.stderr)
        sys.exit(1)

    print()
    print("Image generated successfully!")
    print(f"  Seed: {result['seed']}")

    if result["format"] == "file":
        print(f"  Saved to: {result['path']}")
    else:
        # Print truncated base64 for verification
        data = result["data"]
        print(f"  Base64 data: {data[:50]}...{data[-20:]}")
        print(f"  Data length: {len(data)} characters")

    # Output JSON result for programmatic use
    print()
    print("--- JSON Result ---")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
