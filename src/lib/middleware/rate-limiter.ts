interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillPerSecond: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup old buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > 300000) {
      buckets.delete(key);
    }
  }
}, 300000);

export function checkRateLimit(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: config.maxTokens - 1, lastRefill: now };
    buckets.set(key, bucket);
    return true;
  }

  // Refill tokens
  const elapsed = (now - bucket.lastRefill) / 1000;
  const tokensToAdd = elapsed * config.refillPerSecond;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

export const RATE_LIMITS = {
  chat: { maxTokens: 30, refillPerSecond: 0.5 } as RateLimitConfig,
  upload: { maxTokens: 10, refillPerSecond: 0.17 } as RateLimitConfig,
  api: { maxTokens: 60, refillPerSecond: 1 } as RateLimitConfig,
  webhook: { maxTokens: 10, refillPerSecond: 0.17 } as RateLimitConfig,
};
