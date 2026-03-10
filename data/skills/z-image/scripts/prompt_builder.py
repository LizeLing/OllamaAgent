#!/usr/bin/env python3
"""
Prompt Builder for Z-Image

Utilities for constructing and optimizing prompts for z-image-turbo model.

Features:
- Style presets for common image types
- Automatic negative prompt generation
- Prompt optimization and enhancement

Usage:
    prompt_builder.py build --prompt <prompt> [--style <style>] [--quality <quality>]
    prompt_builder.py styles
    prompt_builder.py json --prompt <prompt> [options]
"""

import argparse
import json
import sys
from typing import Dict, Any, Optional, List


# Style presets for different image types
STYLE_PRESETS = {
    "realistic": {
        "description": "Photorealistic images with natural lighting",
        "suffix": ", realistic, photorealistic, detailed, natural lighting, 8k",
        "negative": "cartoon, anime, illustration, painting, drawing, artificial",
    },
    "anime": {
        "description": "Anime/manga style illustrations",
        "suffix": ", anime style, manga, vibrant colors, detailed",
        "negative": "realistic, photograph, 3d render, ugly, deformed",
    },
    "digital-art": {
        "description": "Digital artwork and illustrations",
        "suffix": ", digital art, illustration, vibrant, detailed, trending on artstation",
        "negative": "photograph, realistic, blurry, low quality",
    },
    "oil-painting": {
        "description": "Classical oil painting style",
        "suffix": ", oil painting, classical art, brush strokes, canvas texture",
        "negative": "digital, photograph, modern, flat colors",
    },
    "watercolor": {
        "description": "Watercolor painting style",
        "suffix": ", watercolor painting, soft colors, artistic, flowing",
        "negative": "digital, photograph, sharp edges, bold colors",
    },
    "3d-render": {
        "description": "3D rendered images",
        "suffix": ", 3d render, octane render, ray tracing, volumetric lighting",
        "negative": "2d, flat, painting, drawing, sketch",
    },
    "sketch": {
        "description": "Pencil sketch or line art",
        "suffix": ", pencil sketch, line art, black and white, detailed linework",
        "negative": "color, photograph, painting, realistic",
    },
    "cinematic": {
        "description": "Movie-like cinematic shots",
        "suffix": ", cinematic, dramatic lighting, movie still, depth of field, film grain",
        "negative": "amateur, flat lighting, overexposed",
    },
    "portrait": {
        "description": "Portrait photography style",
        "suffix": ", portrait, detailed face, studio lighting, professional photography",
        "negative": "distorted face, bad anatomy, blurry",
    },
    "landscape": {
        "description": "Scenic landscape imagery",
        "suffix": ", landscape photography, scenic view, golden hour, panoramic",
        "negative": "indoor, close-up, portrait, urban",
    },
    "concept-art": {
        "description": "Concept art for games/films",
        "suffix": ", concept art, detailed environment, epic scale, professional",
        "negative": "amateur, sketch, unfinished",
    },
    "minimalist": {
        "description": "Clean minimalist design",
        "suffix": ", minimalist, clean design, simple, elegant, white space",
        "negative": "cluttered, busy, detailed, complex",
    },
}

# Quality modifiers
QUALITY_MODIFIERS = {
    "draft": {
        "suffix": "",
        "negative": "",
        "steps": 10,
    },
    "standard": {
        "suffix": ", high quality",
        "negative": "low quality, blurry",
        "steps": 20,
    },
    "high": {
        "suffix": ", masterpiece, best quality, highly detailed, sharp focus",
        "negative": "low quality, blurry, bad anatomy, deformed, ugly, amateur",
        "steps": 30,
    },
    "ultra": {
        "suffix": ", masterpiece, best quality, ultra detailed, 8k resolution, sharp focus, intricate details",
        "negative": "low quality, blurry, bad anatomy, deformed, ugly, amateur, poorly drawn, low resolution",
        "steps": 40,
    },
}

# Default negative prompts for general use
DEFAULT_NEGATIVE = "low quality, blurry, distorted, deformed, bad anatomy, watermark, signature, text"


def build_prompt(
    prompt: str,
    style: Optional[str] = None,
    quality: str = "standard",
    custom_negative: Optional[str] = None,
    add_default_negative: bool = True,
) -> Dict[str, Any]:
    """
    Build an optimized prompt with style and quality modifiers.

    Args:
        prompt: Base prompt text
        style: Style preset name (optional)
        quality: Quality level (draft/standard/high/ultra)
        custom_negative: Additional negative prompts
        add_default_negative: Whether to add default negative prompts

    Returns:
        Dict with 'prompt', 'negative_prompt', and 'steps' keys
    """
    enhanced_prompt = prompt.strip()
    negative_parts: List[str] = []

    # Apply style preset
    if style and style in STYLE_PRESETS:
        preset = STYLE_PRESETS[style]
        enhanced_prompt += preset["suffix"]
        if preset["negative"]:
            negative_parts.append(preset["negative"])

    # Apply quality modifier
    if quality in QUALITY_MODIFIERS:
        q = QUALITY_MODIFIERS[quality]
        enhanced_prompt += q["suffix"]
        if q["negative"]:
            negative_parts.append(q["negative"])
        steps = q["steps"]
    else:
        steps = 20

    # Add default negative
    if add_default_negative:
        negative_parts.append(DEFAULT_NEGATIVE)

    # Add custom negative
    if custom_negative:
        negative_parts.append(custom_negative)

    # Combine negative prompts (remove duplicates while preserving order)
    seen = set()
    unique_negatives = []
    for part in negative_parts:
        for item in part.split(", "):
            item = item.strip()
            if item and item.lower() not in seen:
                seen.add(item.lower())
                unique_negatives.append(item)

    negative_prompt = ", ".join(unique_negatives) if unique_negatives else None

    return {
        "prompt": enhanced_prompt,
        "negative_prompt": negative_prompt,
        "steps": steps,
    }


def build_json_params(
    prompt: str,
    style: Optional[str] = None,
    quality: str = "standard",
    width: int = 1024,
    height: int = 1024,
    seed: int = -1,
    output: Optional[str] = None,
    output_format: str = "file",
    custom_negative: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build complete JSON parameters for z_image_client.

    Returns:
        Dict ready to be passed to z_image_client.py generate-json
    """
    built = build_prompt(prompt, style, quality, custom_negative)

    params = {
        "prompt": built["prompt"],
        "width": width,
        "height": height,
        "seed": seed,
        "steps": built["steps"],
        "format": output_format,
    }

    if built["negative_prompt"]:
        params["negative_prompt"] = built["negative_prompt"]

    if output:
        params["output"] = output

    return params


def list_styles() -> None:
    """Print available style presets."""
    print("Available Style Presets:")
    print("=" * 60)
    for name, preset in STYLE_PRESETS.items():
        print(f"\n  {name}")
        print(f"    {preset['description']}")


def main():
    parser = argparse.ArgumentParser(
        description="Prompt Builder for Z-Image"
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Styles command
    subparsers.add_parser("styles", help="List available style presets")

    # Build command
    build_parser = subparsers.add_parser("build",
                                         help="Build optimized prompt")
    build_parser.add_argument("--prompt", "-p", required=True,
                             help="Base prompt text")
    build_parser.add_argument("--style", "-s",
                             choices=list(STYLE_PRESETS.keys()),
                             help="Style preset")
    build_parser.add_argument("--quality", "-q",
                             choices=list(QUALITY_MODIFIERS.keys()),
                             default="standard",
                             help="Quality level (default: standard)")
    build_parser.add_argument("--negative", "-n",
                             help="Additional negative prompts")
    build_parser.add_argument("--no-default-negative", action="store_true",
                             help="Don't add default negative prompts")

    # JSON command
    json_parser = subparsers.add_parser("json",
                                        help="Build complete JSON parameters")
    json_parser.add_argument("--prompt", "-p", required=True,
                            help="Base prompt text")
    json_parser.add_argument("--style", "-s",
                            choices=list(STYLE_PRESETS.keys()),
                            help="Style preset")
    json_parser.add_argument("--quality", "-q",
                            choices=list(QUALITY_MODIFIERS.keys()),
                            default="standard",
                            help="Quality level")
    json_parser.add_argument("--width", "-W", type=int, default=1024,
                            help="Image width")
    json_parser.add_argument("--height", "-H", type=int, default=1024,
                            help="Image height")
    json_parser.add_argument("--seed", type=int, default=-1,
                            help="Random seed")
    json_parser.add_argument("--output", "-o",
                            help="Output file path")
    json_parser.add_argument("--format", "-f",
                            choices=["file", "base64"], default="file",
                            help="Output format")
    json_parser.add_argument("--negative", "-n",
                            help="Additional negative prompts")

    args = parser.parse_args()

    if args.command == "styles":
        list_styles()
        print("\nQuality Levels:")
        print("=" * 60)
        for name, q in QUALITY_MODIFIERS.items():
            print(f"  {name}: {q['steps']} steps")
        return

    if args.command == "build":
        result = build_prompt(
            prompt=args.prompt,
            style=args.style,
            quality=args.quality,
            custom_negative=args.negative,
            add_default_negative=not args.no_default_negative,
        )

        print("Built Prompt:")
        print("-" * 40)
        print(result["prompt"])
        print()
        print("Negative Prompt:")
        print("-" * 40)
        print(result["negative_prompt"] or "(none)")
        print()
        print(f"Recommended Steps: {result['steps']}")

    elif args.command == "json":
        result = build_json_params(
            prompt=args.prompt,
            style=args.style,
            quality=args.quality,
            width=args.width,
            height=args.height,
            seed=args.seed,
            output=args.output,
            output_format=args.format,
            custom_negative=args.negative,
        )

        print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
