import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

interface Voice {
  name: string;
  locale: string;
  gender: string;
}

export async function GET() {
  try {
    const voices = await listEdgeTtsVoices();
    return NextResponse.json({ voices });
  } catch {
    return NextResponse.json({ voices: getFallbackVoices() });
  }
}

function listEdgeTtsVoices(): Promise<Voice[]> {
  return new Promise((resolve) => {
    const proc = spawn('edge-tts', ['--list-voices'], { timeout: 10000 });
    let stdout = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });

    proc.on('close', () => {
      const voices: Voice[] = [];
      const lines = stdout.split('\n');
      let current: Partial<Voice> = {};

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Name: ')) {
          current.name = trimmed.slice(6);
        } else if (trimmed.startsWith('Gender: ')) {
          current.gender = trimmed.slice(8);
        } else if (trimmed === '' && current.name) {
          const locale = current.name.split('-').slice(0, 2).join('-');
          voices.push({
            name: current.name,
            locale,
            gender: current.gender || 'Unknown',
          });
          current = {};
        }
      }

      if (voices.length === 0) {
        resolve(getFallbackVoices());
      } else {
        resolve(voices);
      }
    });

    proc.on('error', () => {
      resolve(getFallbackVoices());
    });
  });
}

function getFallbackVoices(): Voice[] {
  return [
    { name: 'ko-KR-SunHiNeural', locale: 'ko-KR', gender: 'Female' },
    { name: 'ko-KR-InJoonNeural', locale: 'ko-KR', gender: 'Male' },
    { name: 'ko-KR-HyunsuNeural', locale: 'ko-KR', gender: 'Male' },
    { name: 'en-US-JennyNeural', locale: 'en-US', gender: 'Female' },
    { name: 'en-US-GuyNeural', locale: 'en-US', gender: 'Male' },
    { name: 'en-US-AriaNeural', locale: 'en-US', gender: 'Female' },
    { name: 'en-GB-SoniaNeural', locale: 'en-GB', gender: 'Female' },
    { name: 'ja-JP-NanamiNeural', locale: 'ja-JP', gender: 'Female' },
    { name: 'ja-JP-KeitaNeural', locale: 'ja-JP', gender: 'Male' },
    { name: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-YunxiNeural', locale: 'zh-CN', gender: 'Male' },
  ];
}
