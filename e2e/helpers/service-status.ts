import fs from 'fs';
import path from 'path';

export function getServiceStatus() {
  try {
    const data = fs.readFileSync(path.join(__dirname, '..', '.service-status.json'), 'utf-8');
    return JSON.parse(data);
  } catch {
    return { ollama: false, docker: false, searxng: false };
  }
}
