import { describe, it, expect } from 'vitest';
import { generateApiKey, hashKey, verifyKey } from '../auth';

describe('Webhook Auth', () => {
  it('generateApiKey - oa_ 접두사를 가진다', () => {
    const key = generateApiKey();
    expect(key.startsWith('oa_')).toBe(true);
  });

  it('generateApiKey - 충분한 길이를 가진다 (40+)', () => {
    const key = generateApiKey();
    expect(key.length).toBeGreaterThanOrEqual(40);
  });

  it('generateApiKey - 매번 다른 키를 생성한다', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it('hashKey - 동일한 키는 동일한 해시를 반환한다', () => {
    const key = 'oa_testkey123';
    const hash1 = hashKey(key);
    const hash2 = hashKey(key);
    expect(hash1).toBe(hash2);
  });

  it('hashKey - 다른 키는 다른 해시를 반환한다', () => {
    const hash1 = hashKey('oa_key1');
    const hash2 = hashKey('oa_key2');
    expect(hash1).not.toBe(hash2);
  });

  it('verifyKey - 올바른 키를 검증하고 틀린 키를 거부한다', () => {
    const key = generateApiKey();
    const hash = hashKey(key);
    expect(verifyKey(key, hash)).toBe(true);
    expect(verifyKey('oa_wrongkey', hash)).toBe(false);
  });
});
