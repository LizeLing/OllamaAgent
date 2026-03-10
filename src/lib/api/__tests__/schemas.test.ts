import { describe, it, expect } from 'vitest';
import { isInternalUrl } from '../schemas';

describe('isInternalUrl', () => {
  it('localhost를 차단한다', () => {
    expect(isInternalUrl('http://localhost:8080')).toBe(true);
    expect(isInternalUrl('http://localhost')).toBe(true);
    expect(isInternalUrl('https://localhost:443')).toBe(true);
  });

  it('127.x.x.x 대역을 차단한다', () => {
    expect(isInternalUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isInternalUrl('http://127.0.0.1')).toBe(true);
    expect(isInternalUrl('http://127.255.255.255')).toBe(true);
  });

  it('10.x.x.x 사설 IP를 차단한다', () => {
    expect(isInternalUrl('http://10.0.0.1:8080')).toBe(true);
    expect(isInternalUrl('http://10.255.0.1')).toBe(true);
  });

  it('172.16-31.x.x 대역을 차단한다', () => {
    expect(isInternalUrl('http://172.16.0.1')).toBe(true);
    expect(isInternalUrl('http://172.31.255.255')).toBe(true);
    // 172.32.x.x는 허용
    expect(isInternalUrl('http://172.32.0.1')).toBe(false);
  });

  it('192.168.x.x 대역을 차단한다', () => {
    expect(isInternalUrl('http://192.168.0.1')).toBe(true);
    expect(isInternalUrl('http://192.168.1.100:3000')).toBe(true);
  });

  it('IPv6 loopback을 차단한다', () => {
    expect(isInternalUrl('http://[::1]:8080')).toBe(true);
  });

  it('0.0.0.0 대역을 차단한다', () => {
    expect(isInternalUrl('http://0.0.0.0')).toBe(true);
  });

  it('외부 URL은 허용한다', () => {
    expect(isInternalUrl('https://api.example.com')).toBe(false);
    expect(isInternalUrl('https://8.8.8.8')).toBe(false);
    expect(isInternalUrl('https://203.0.113.1:443')).toBe(false);
  });

  it('유효하지 않은 URL은 차단한다', () => {
    expect(isInternalUrl('not-a-url')).toBe(true);
    expect(isInternalUrl('')).toBe(true);
  });
});
