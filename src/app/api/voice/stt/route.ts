import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/voice/stt';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
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
