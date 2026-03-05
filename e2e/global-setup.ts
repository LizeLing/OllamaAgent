import fs from 'fs';
import path from 'path';

async function globalSetup() {
  const services = {
    ollama: false,
    docker: false,
    searxng: false,
  };

  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    services.ollama = res.ok;
  } catch {}

  try {
    const res = await fetch('http://localhost:8888/healthz', { signal: AbortSignal.timeout(3000) });
    services.searxng = res.ok;
  } catch {}

  fs.writeFileSync(
    path.join(__dirname, '.service-status.json'),
    JSON.stringify(services)
  );
}

export default globalSetup;
