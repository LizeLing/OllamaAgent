import { describe, it, expect } from 'vitest';
import { ToolCallTracker } from '../tool-call-tracker';

describe('ToolCallTracker', () => {
  it('returns execute on first call', () => {
    const tracker = new ToolCallTracker();
    const result = tracker.check('read_file', { path: '/tmp/a.txt' });
    expect(result).toEqual({ action: 'execute' });
  });

  it('returns inject with cached output on second identical call', () => {
    const tracker = new ToolCallTracker();
    tracker.check('read_file', { path: '/tmp/a.txt' });
    tracker.record('read_file', { path: '/tmp/a.txt' }, 'file contents here');

    const result = tracker.check('read_file', { path: '/tmp/a.txt' });
    expect(result).toEqual({ action: 'inject', cachedOutput: 'file contents here' });
  });

  it('returns abort with cached output on third and subsequent identical calls', () => {
    const tracker = new ToolCallTracker();

    tracker.check('read_file', { path: '/tmp/a.txt' });
    tracker.record('read_file', { path: '/tmp/a.txt' }, 'file contents');

    tracker.check('read_file', { path: '/tmp/a.txt' });
    // no record needed for inject/abort path

    const result = tracker.check('read_file', { path: '/tmp/a.txt' });
    expect(result).toEqual({ action: 'abort', cachedOutput: 'file contents' });

    // 4th call should also abort
    const result4 = tracker.check('read_file', { path: '/tmp/a.txt' });
    expect(result4).toEqual({ action: 'abort', cachedOutput: 'file contents' });
  });

  it('tracks different inputs separately', () => {
    const tracker = new ToolCallTracker();

    const r1 = tracker.check('read_file', { path: '/tmp/a.txt' });
    expect(r1).toEqual({ action: 'execute' });
    tracker.record('read_file', { path: '/tmp/a.txt' }, 'aaa');

    const r2 = tracker.check('read_file', { path: '/tmp/b.txt' });
    expect(r2).toEqual({ action: 'execute' });
    tracker.record('read_file', { path: '/tmp/b.txt' }, 'bbb');

    const r3 = tracker.check('write_file', { path: '/tmp/a.txt', content: 'x' });
    expect(r3).toEqual({ action: 'execute' });
  });

  it('truncates cached output to 500 characters', () => {
    const tracker = new ToolCallTracker();
    const longOutput = 'x'.repeat(1000);

    tracker.check('read_file', { path: '/tmp/a.txt' });
    tracker.record('read_file', { path: '/tmp/a.txt' }, longOutput);

    const result = tracker.check('read_file', { path: '/tmp/a.txt' });
    expect(result.action).toBe('inject');
    if (result.action === 'inject') {
      expect(result.cachedOutput.length).toBe(500);
      expect(result.cachedOutput).toBe('x'.repeat(500));
    }
  });

  it('detects A->B->A->B->A->B alternating pattern', () => {
    const tracker = new ToolCallTracker();

    const calls = [
      { name: 'read_file', args: { path: '/a' } },
      { name: 'write_file', args: { path: '/b' } },
      { name: 'read_file', args: { path: '/a' } },
      { name: 'write_file', args: { path: '/b' } },
      { name: 'read_file', args: { path: '/a' } },
      { name: 'write_file', args: { path: '/b' } },
    ];

    for (const call of calls) {
      tracker.check(call.name, call.args);
      tracker.record(call.name, call.args, 'output');
    }

    expect(tracker.detectRepeatingPattern()).toBe(true);
  });

  it('returns false when no repeating pattern exists', () => {
    const tracker = new ToolCallTracker();

    const calls = [
      { name: 'read_file', args: { path: '/a' } },
      { name: 'write_file', args: { path: '/b' } },
      { name: 'list_dir', args: { path: '/c' } },
      { name: 'search', args: { query: 'test' } },
      { name: 'delete_file', args: { path: '/d' } },
      { name: 'create_file', args: { path: '/e' } },
    ];

    for (const call of calls) {
      tracker.check(call.name, call.args);
      tracker.record(call.name, call.args, 'output');
    }

    expect(tracker.detectRepeatingPattern()).toBe(false);
  });

  it('resets all state', () => {
    const tracker = new ToolCallTracker();

    tracker.check('read_file', { path: '/tmp/a.txt' });
    tracker.record('read_file', { path: '/tmp/a.txt' }, 'cached');

    // Before reset: second call should inject
    const before = tracker.check('read_file', { path: '/tmp/a.txt' });
    expect(before.action).toBe('inject');

    tracker.reset();

    // After reset: should be treated as first call
    const after = tracker.check('read_file', { path: '/tmp/a.txt' });
    expect(after).toEqual({ action: 'execute' });

    // Pattern history should also be cleared
    expect(tracker.detectRepeatingPattern()).toBe(false);
  });
});
