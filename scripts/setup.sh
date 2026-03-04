#!/bin/bash
# OllamaAgent Setup Script

set -e

echo "=== OllamaAgent Setup ==="

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed"
  exit 1
fi
echo "Node.js: $(node -v)"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
  echo "Error: pnpm is not installed"
  exit 1
fi
echo "pnpm: $(pnpm -v)"

# Install dependencies
echo ""
echo "Installing dependencies..."
pnpm install

# Create data directories
echo ""
echo "Creating data directories..."
mkdir -p data/memory/vectors data/uploads data/generated

# Check Ollama
echo ""
echo "Checking Ollama..."
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "Ollama: Running"
else
  echo "Warning: Ollama is not running on localhost:11434"
fi

# Check Docker
echo ""
echo "Checking Docker..."
if docker info > /dev/null 2>&1; then
  echo "Docker: Available"
  # Pull commonly used images
  echo "Pulling execution images..."
  docker pull python:3.12-slim 2>/dev/null || true
  docker pull node:22-slim 2>/dev/null || true
  docker pull alpine:latest 2>/dev/null || true
else
  echo "Warning: Docker is not available (code execution will be disabled)"
fi

# Check Python for voice
echo ""
echo "Checking Python voice dependencies..."
if command -v python3 &> /dev/null; then
  echo "Python3: $(python3 --version)"
  python3 -c "import faster_whisper" 2>/dev/null && echo "faster-whisper: Installed" || echo "Warning: faster-whisper not installed (STT disabled)"
  python3 -c "import edge_tts" 2>/dev/null && echo "edge-tts: Installed" || echo "Warning: edge-tts not installed (TTS disabled)"
else
  echo "Warning: Python3 not found (voice features disabled)"
fi

echo ""
echo "=== Setup Complete ==="
echo "Run 'pnpm dev' to start the development server"
