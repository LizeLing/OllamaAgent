export async function checkOllamaAvailable(
  baseUrl: string = 'http://localhost:11434'
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkDockerAvailable(): Promise<boolean> {
  try {
    const Dockerode = (await import('dockerode')).default;
    const docker = new Dockerode();
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

export async function checkSearXNGAvailable(
  baseUrl: string = 'http://localhost:8888'
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/healthz`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
