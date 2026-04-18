import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

const TTS_SCRIPT = path.join(process.cwd(), 'scripts', 'tts-worker.py');

export async function POST(request: NextRequest) {
  if (!existsSync(TTS_SCRIPT)) {
    return NextResponse.json(
      { error: 'TTS 서비스를 사용할 수 없습니다. tts-worker.py가 설치되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const { synthesizeSpeech } = await import('@/lib/voice/tts');
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
