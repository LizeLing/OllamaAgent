import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPing = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockWait = vi.fn().mockResolvedValue({ StatusCode: 0 });
const mockLogs = vi.fn().mockResolvedValue(Buffer.from('hello'));
const mockKill = vi.fn().mockResolvedValue(undefined);
const mockCreateContainer = vi.fn().mockResolvedValue({
  start: mockStart,
  wait: mockWait,
  logs: mockLogs,
  kill: mockKill,
});

vi.mock('dockerode', () => {
  return {
    default: class MockDocker {
      ping = mockPing;
      createContainer = mockCreateContainer;
    },
  };
});

describe('CodeExecutorTool - Lazy Docker', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockPing.mockClear().mockResolvedValue(undefined);
    mockCreateContainer.mockClear().mockResolvedValue({
      start: mockStart,
      wait: mockWait,
      logs: mockLogs,
      kill: mockKill,
    });
    mockStart.mockClear();
    mockWait.mockClear().mockResolvedValue({ StatusCode: 0 });
    mockLogs.mockClear().mockResolvedValue(Buffer.from('hello'));

    // static 필드 초기화를 위해 모듈 재로드
    const mod = await import('../code-executor');
    // static 필드 리셋 (private이므로 any 캐스트)
    const Cls = mod.CodeExecutorTool as any;
    Cls.docker = null;
    Cls.dockerAvailable = null;
    Cls.lastCheckTime = 0;
  });

  it('모듈 로드 시점에 Docker 인스턴스를 생성하지 않는다', async () => {
    const { CodeExecutorTool } = await import('../code-executor');
    const tool = new CodeExecutorTool();
    expect(tool.definition.name).toBe('code_execute');
    // Docker의 ping이 호출되지 않아야 함 (아직 execute를 호출하지 않았으므로)
    expect(mockPing).not.toHaveBeenCalled();
    // static docker 필드가 null이어야 함 (lazy 초기화)
    expect((CodeExecutorTool as any).docker).toBeNull();
  });

  it('execute() 호출 시 Docker ping을 수행한다', async () => {
    const { CodeExecutorTool } = await import('../code-executor');
    const tool = new CodeExecutorTool();

    await tool.execute({ language: 'python', code: 'print("hi")' });

    expect(mockPing).toHaveBeenCalled();
  });

  it('30초 이내 재호출 시 ping을 건너뛴다', async () => {
    const { CodeExecutorTool } = await import('../code-executor');
    const tool = new CodeExecutorTool();

    await tool.execute({ language: 'python', code: 'print("1")' });
    expect(mockPing).toHaveBeenCalledTimes(1);

    await tool.execute({ language: 'python', code: 'print("2")' });
    // 30초 이내이므로 ping 재호출 없음
    expect(mockPing).toHaveBeenCalledTimes(1);
  });

  it('캐시 만료 후 ping을 다시 수행한다', async () => {
    vi.useFakeTimers();
    const { CodeExecutorTool } = await import('../code-executor');
    const tool = new CodeExecutorTool();

    await tool.execute({ language: 'python', code: 'print("1")' });
    expect(mockPing).toHaveBeenCalledTimes(1);

    // 30초 이상 경과
    vi.advanceTimersByTime(31_000);

    await tool.execute({ language: 'python', code: 'print("2")' });
    expect(mockPing).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('Docker 사용 불가 시 에러를 반환한다', async () => {
    mockPing.mockRejectedValue(new Error('Docker not running'));
    const { CodeExecutorTool } = await import('../code-executor');
    const tool = new CodeExecutorTool();

    const result = await tool.execute({ language: 'python', code: 'print("hi")' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Docker is not available');
  });
});
