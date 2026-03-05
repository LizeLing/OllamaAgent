/**
 * SSRF 방어를 위한 URL 검증.
 * 내부 네트워크, 사설 IP, 메타데이터 서비스 접근을 차단한다.
 */
export function validateUrlForSSRF(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

    // Block known internal hostnames
    const blockedHosts = ['localhost', '0.0.0.0', '::1', '::'];
    if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { valid: false, error: '내부 네트워크 URL에는 접근할 수 없습니다.' };
    }

    // Block IPv4-mapped IPv6
    if (hostname.startsWith('::ffff:')) {
      return { valid: false, error: '내부 네트워크 URL에는 접근할 수 없습니다.' };
    }

    // Block private/special IPv4 ranges
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a === 255
      ) {
        return { valid: false, error: '사설 IP 대역에는 접근할 수 없습니다.' };
      }
    }

    // Protocol check
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'HTTP/HTTPS 프로토콜만 허용됩니다.' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: '유효하지 않은 URL입니다.' };
  }
}
