import { spawn } from 'child_process';
import path from 'path';

const STT_SCRIPT = path.join(process.cwd(), 'scripts', 'stt-worker.py');

export async function transcribeAudio(audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [STT_SCRIPT, audioPath], {
      timeout: 60000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`STT failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result.text);
        }
      } catch {
        reject(new Error(`Failed to parse STT output: ${stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start STT: ${err.message}`));
    });
  });
}
