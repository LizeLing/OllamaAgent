import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

const STT_SCRIPT = path.join(process.cwd(), 'scripts', 'stt-worker.py');

export async function POST(request: NextRequest) {
  if (!existsSync(STT_SCRIPT)) {
    return NextResponse.json(
      { error: 'STT 서비스를 사용할 수 없습니다. stt-worker.py가 설치되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const audio = formData.get('audio') as File;

    if (!audio) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Save temp file
    const tempPath = path.join(os.tmpdir(), `stt_${uuidv4()}.webm`);
    const bytes = await audio.arrayBuffer();
    await fs.writeFile(tempPath, Buffer.from(bytes));

    try {
      const { transcribeAudio } = await import('@/lib/voice/stt');
      const text = await transcribeAudio(tempPath);
      return NextResponse.json({ text });
    } finally {
      fs.unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'STT failed' },
      { status: 500 }
    );
  }
}
