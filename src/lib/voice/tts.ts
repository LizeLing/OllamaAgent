import { spawn } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

const TTS_SCRIPT = path.join(process.cwd(), 'scripts', 'tts-worker.py');

export async function synthesizeSpeech(
  text: string,
  voice: string = 'ko-KR-SunHiNeural'
): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `tts_${uuidv4()}.mp3`);

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [TTS_SCRIPT], {
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.stdin.write(JSON.stringify({ text, voice, output: outputPath }));
    proc.stdin.end();

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`TTS failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result.output);
        }
      } catch {
        reject(new Error(`Failed to parse TTS output: ${stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start TTS: ${err.message}`));
    });
  });
}
