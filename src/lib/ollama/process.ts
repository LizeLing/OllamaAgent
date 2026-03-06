import { execSync, spawn } from 'child_process';

export function killOllama(): void {
  execSync('pkill -f "ollama serve"', { stdio: 'ignore' });
}

export function startOllama(env: Record<string, string>): void {
  const child = spawn('ollama', ['serve'], {
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
