import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { generate } from '@/lib/ollama/client';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const settings = await loadSettings();

    const response = await generate(settings.ollamaUrl, {
      model: settings.imageModel,
      prompt,
      stream: false,
    });

    let base64Image = '';
    if (response.image && response.image.length > 100) {
      base64Image = response.image;
    } else if (response.images && response.images.length > 0) {
      base64Image = response.images[0];
    } else if (response.response && response.response.length > 100) {
      base64Image = response.response;
    }

    if (!base64Image) {
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    // Save to disk
    const generatedDir = path.join(DATA_DIR, 'generated');
    await fs.mkdir(generatedDir, { recursive: true });
    const filename = `${uuidv4()}.png`;
    await fs.writeFile(
      path.join(generatedDir, filename),
      Buffer.from(base64Image, 'base64')
    );

    return NextResponse.json({ base64: base64Image, prompt, filename });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image generation failed' },
      { status: 500 }
    );
  }
}
