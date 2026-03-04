import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeech } from '@/lib/voice/tts';
import { loadSettings } from '@/lib/config/settings';
import fs from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const settings = await loadSettings();
    const audioPath = await synthesizeSpeech(text, settings.ttsVoice);

    try {
      const audioBuffer = await fs.readFile(audioPath);
      return new Response(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length.toString(),
        },
      });
    } finally {
      fs.unlink(audioPath).catch(() => {});
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'TTS failed' },
      { status: 500 }
    );
  }
}
