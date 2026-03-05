import { describe, it, expect, beforeAll } from 'vitest';
import { checkDockerAvailable } from '@/test/helpers/service-checker';
import { CodeExecutorTool } from '../code-executor';

let dockerAvailable = false;

beforeAll(async () => {
  dockerAvailable = await checkDockerAvailable();
});

describe.skipIf(!dockerAvailable)('CodeExecutorTool Integration', () => {
  const tool = new CodeExecutorTool();

  beforeAll(async () => {
    dockerAvailable = await checkDockerAvailable();
  });

  it('executes Python code: print hello', async () => {
    const result = await tool.execute({
      language: 'python',
      code: 'print("Hello from Python")',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello from Python');
  }, 60000);

  it('executes JavaScript code: console.log', async () => {
    const result = await tool.execute({
      language: 'javascript',
      code: 'console.log("Hello from JS")',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello from JS');
  }, 60000);

  it('executes Bash code: echo command', async () => {
    const result = await tool.execute({
      language: 'bash',
      code: 'echo "Hello from Bash"',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello from Bash');
  }, 60000);

  it('handles Python computation', async () => {
    const result = await tool.execute({
      language: 'python',
      code: 'print(sum(range(1, 11)))',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('55');
  }, 60000);

  it('returns error for unsupported language', async () => {
    const result = await tool.execute({
      language: 'ruby',
      code: 'puts "hello"',
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unsupported language');
  });

  it('returns error for syntax error in code', async () => {
    const result = await tool.execute({
      language: 'python',
      code: 'this is not valid python!!!',
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Exit code');
  }, 60000);

  it('handles code with no output', async () => {
    const result = await tool.execute({
      language: 'python',
      code: 'x = 42',
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('(no output)');
  }, 60000);

  it('truncates large output', async () => {
    const result = await tool.execute({
      language: 'python',
      code: 'print("x" * 10000)',
    });

    expect(result.success).toBe(true);
    if (result.output.length > 5000) {
      expect(result.output).toContain('truncated');
    }
  }, 60000);

  it('network is disabled in container', async () => {
    const result = await tool.execute({
      language: 'python',
      code: `
import urllib.request
try:
    urllib.request.urlopen("http://google.com", timeout=3)
    print("NETWORK_AVAILABLE")
except:
    print("NETWORK_BLOCKED")
`,
    });

    expect(result.output).toContain('NETWORK_BLOCKED');
  }, 60000);

  it('returns error for missing arguments', async () => {
    const result = await tool.execute({ language: 'python' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('required');
  });
});
