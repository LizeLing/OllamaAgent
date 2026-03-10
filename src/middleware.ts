import { NextRequest, NextResponse } from 'next/server';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:;",
};

// API 키 인증 (환경변수 API_KEY가 설정된 경우에만 활성화)
const API_KEY = process.env.API_KEY || '';

// 인증 제외 경로 (health check 등)
const AUTH_EXEMPT_PATHS = ['/api/health'];

function checkApiAuth(request: NextRequest): NextResponse | null {
  if (!API_KEY) return null; // API_KEY 미설정 시 인증 비활성화 (로컬 개발용)
  if (AUTH_EXEMPT_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return null;

  const authHeader = request.headers.get('authorization');
  const queryKey = request.nextUrl.searchParams.get('api_key');
  const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryKey;

  if (providedKey !== API_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing API key' },
      { status: 401, headers: Object.fromEntries(Object.entries(SECURITY_HEADERS)) }
    );
  }

  return null;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 보안 헤더 추가
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // API 경로에 대해 powered-by 헤더 제거
  response.headers.delete('X-Powered-By');

  // API 경로 보안 검사
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // CORS: 같은 origin만 허용 (기본 브라우저 정책 강화)
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    // CORS: origin의 호스트 부분만 정확히 비교
    if (origin && host) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = '';
      }
      if (originHost !== host) {
        return NextResponse.json(
          { error: 'CORS not allowed' },
          { status: 403, headers: Object.fromEntries(Object.entries(SECURITY_HEADERS)) }
        );
      }
    }

    // API 키 인증 검사
    const authResult = checkApiAuth(request);
    if (authResult) return authResult;
  }

  return response;
}

export const config = {
  matcher: [
    // API 및 페이지 경로 (정적 파일 제외)
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
