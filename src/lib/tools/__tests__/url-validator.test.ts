import { describe, it, expect } from 'vitest';
import { validateUrlForSSRF } from '../url-validator';

describe('validateUrlForSSRF', () => {
  it('allows valid external URLs', () => {
    expect(validateUrlForSSRF('https://api.example.com/data').valid).toBe(true);
    expect(validateUrlForSSRF('http://example.com').valid).toBe(true);
  });

  it('blocks localhost', () => {
    expect(validateUrlForSSRF('http://localhost:3000').valid).toBe(false);
    expect(validateUrlForSSRF('http://0.0.0.0').valid).toBe(false);
  });

  it('blocks private IPv4 ranges', () => {
    expect(validateUrlForSSRF('http://10.0.0.1').valid).toBe(false);
    expect(validateUrlForSSRF('http://172.16.0.1').valid).toBe(false);
    expect(validateUrlForSSRF('http://192.168.1.1').valid).toBe(false);
    expect(validateUrlForSSRF('http://127.0.0.1').valid).toBe(false);
  });

  it('blocks link-local and metadata', () => {
    expect(validateUrlForSSRF('http://169.254.169.254').valid).toBe(false);
  });

  it('blocks .local and .internal domains', () => {
    expect(validateUrlForSSRF('http://myserver.local').valid).toBe(false);
    expect(validateUrlForSSRF('http://db.internal').valid).toBe(false);
  });

  it('blocks non-HTTP protocols', () => {
    expect(validateUrlForSSRF('ftp://example.com').valid).toBe(false);
    expect(validateUrlForSSRF('file:///etc/passwd').valid).toBe(false);
  });

  it('blocks IPv4-mapped IPv6', () => {
    expect(validateUrlForSSRF('http://[::ffff:127.0.0.1]').valid).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(validateUrlForSSRF('not-a-url').valid).toBe(false);
  });

  it('blocks broadcast address', () => {
    expect(validateUrlForSSRF('http://255.255.255.255').valid).toBe(false);
  });
});
