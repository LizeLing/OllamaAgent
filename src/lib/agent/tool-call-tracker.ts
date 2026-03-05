import crypto from 'crypto';

export type CheckResult =
  | { action: 'execute' }
  | { action: 'inject'; cachedOutput: string }
  | { action: 'abort'; cachedOutput: string };

const MAX_CACHED_OUTPUT_LENGTH = 500;

function computeHash(toolName: string, args: Record<string, unknown>): string {
  const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
  return crypto
    .createHash('sha256')
    .update(toolName + ':' + sortedArgs)
    .digest('hex');
}

interface CallEntry {
  count: number;
  cachedOutput: string;
}

export class ToolCallTracker {
  private calls: Map<string, CallEntry> = new Map();
  private history: string[] = [];

  check(toolName: string, args: Record<string, unknown>): CheckResult {
    const hash = computeHash(toolName, args);
    const entry = this.calls.get(hash);

    if (!entry) {
      this.calls.set(hash, { count: 1, cachedOutput: '' });
      this.history.push(hash);
      return { action: 'execute' };
    }

    entry.count += 1;
    this.history.push(hash);

    if (entry.count === 2) {
      return { action: 'inject', cachedOutput: entry.cachedOutput };
    }

    return { action: 'abort', cachedOutput: entry.cachedOutput };
  }

  record(toolName: string, args: Record<string, unknown>, output: string): void {
    const hash = computeHash(toolName, args);
    const entry = this.calls.get(hash);
    if (entry) {
      entry.cachedOutput = output.slice(0, MAX_CACHED_OUTPUT_LENGTH);
    }
  }

  detectRepeatingPattern(windowSize: number = 6): boolean {
    const recent = this.history.slice(-windowSize);

    // Check for repeating sequences of length 2 and 3
    for (const seqLen of [2, 3]) {
      if (recent.length < seqLen * 2) continue;

      // Check if the recent history consists of a repeating sequence of length seqLen
      const candidate = recent.slice(0, seqLen);
      let isRepeating = true;

      for (let i = 0; i < recent.length; i++) {
        if (recent[i] !== candidate[i % seqLen]) {
          isRepeating = false;
          break;
        }
      }

      if (isRepeating && recent.length >= seqLen * 2) {
        return true;
      }
    }

    return false;
  }

  reset(): void {
    this.calls.clear();
    this.history = [];
  }
}
