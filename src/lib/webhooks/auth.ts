import { randomBytes, createHash } from 'crypto';

const KEY_PREFIX = 'oa_';

export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString('base64url');
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyKey(key: string, storedHash: string): boolean {
  return hashKey(key) === storedHash;
}

export function getKeyPrefix(key: string): string {
  return key.slice(0, 11); // 'oa_' + 8 chars
}
