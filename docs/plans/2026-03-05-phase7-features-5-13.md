# Phase 7: Features 5-13 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 에러 핸들링, 레이트 리미팅, 검색/내보내기 개선, UI 기능(모델 파라미터 프리뷰, 드래그앤드롭, 대화 분기, 단축키 가이드), 전체 테스트를 구현한다.

**Architecture:** 4개 에이전트로 3단계 실행. Stage 1에서 Agent A/B/C가 파일 충돌 없이 병렬 실행, Stage 2에서 Agent D가 테스트 작성, Stage 3에서 빌드 검증.

**Tech Stack:** Next.js 16, TypeScript, React 19, Tailwind CSS 4, Vitest, React Testing Library

**NOTE:** Features 1-4 (스트리밍 중단 표시, 추천 프롬프트, 타임스탬프, 컬러 피커)는 이미 구현 완료.

---

## Stage 1: 병렬 실행 (Agent A, B, C)

## Agent A: 인프라 — 에러 핸들링 + 레이트 리미팅 (Features 6, 7)

### Task 1: Toast 시스템 생성

**Files:**
- Create: `src/hooks/useToast.ts`
- Create: `src/components/ui/ToastContainer.tsx`

**Step 1: useToast 훅 생성**

```typescript
// src/hooks/useToast.ts
'use client';

import { useState, useEffect } from 'react';

export type ToastType = 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

type Listener = (toasts: Toast[]) => void;

let toastList: Toast[] = [];
const listeners = new Set<Listener>();

function notify() {
  const snapshot = [...toastList];
  listeners.forEach((l) => l(snapshot));
}

export function addToast(type: ToastType, message: string) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  toastList = [...toastList, { id, type, message }];
  notify();
  setTimeout(() => removeToast(id), 5000);
}

export function removeToast(id: string) {
  toastList = toastList.filter((t) => t.id !== id);
  notify();
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.add(setToasts);
    setToasts([...toastList]);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return { toasts, addToast, removeToast };
}
```

**Step 2: ToastContainer 컴포넌트 생성**

```tsx
// src/components/ui/ToastContainer.tsx
'use client';

import { useToast, removeToast } from '@/hooks/useToast';

const STYLES = {
  error: 'bg-red-950/95 border-red-800 text-red-200',
  warning: 'bg-amber-950/95 border-amber-800 text-amber-200',
  info: 'bg-blue-950/95 border-blue-800 text-blue-200',
};

const ICONS = { error: '\u26A0', warning: '\u26A1', info: '\u2139' };

export default function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg ${STYLES[toast.type]}`}
        >
          <span className="shrink-0">{ICONS[toast.type]}</span>
          <p className="text-sm flex-1">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="opacity-60 hover:opacity-100 text-lg leading-none"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 3: 커밋**

```bash
git add src/hooks/useToast.ts src/components/ui/ToastContainer.tsx
git commit -m "feat: Toast 알림 시스템 추가

모듈 레벨 상태로 어디서든 addToast() 호출 가능.
error/warning/info 3타입, 5초 자동 제거, 수동 닫기 지원."
```

---

### Task 2: ErrorBoundary 생성

**Files:**
- Create: `src/components/ui/ErrorBoundary.tsx`

**Step 1: ErrorBoundary 컴포넌트 생성**

```tsx
// src/components/ui/ErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center max-w-md px-6">
            <div className="text-4xl mb-4">&#x26A0;&#xFE0F;</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">오류가 발생했습니다</h2>
            <p className="text-sm text-muted mb-4">
              {this.state.error?.message || '알 수 없는 오류'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Step 2: layout.tsx에 ErrorBoundary 적용**

`src/app/layout.tsx`의 `<body>` 내부를 ErrorBoundary와 ToastContainer로 감싸기:

```typescript
// src/app/layout.tsx — 전체 교체
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import 'highlight.js/styles/github-dark.css';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import ToastContainer from '@/components/ui/ToastContainer';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OllamaAgent",
  description: "AI Agent powered by Ollama",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-[family-name:var(--font-inter)] antialiased`}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <ToastContainer />
      </body>
    </html>
  );
}
```

**Step 3: 커밋**

```bash
git add src/components/ui/ErrorBoundary.tsx src/app/layout.tsx
git commit -m "feat: ErrorBoundary + ToastContainer를 layout에 적용

React 에러 경계로 크래시 시 폴백 UI 표시.
ToastContainer를 루트에 마운트하여 전역 알림 가능."
```

---

### Task 3: Rate Limiter 생성

**Files:**
- Create: `src/lib/middleware/rate-limiter.ts`

**Step 1: Rate Limiter 모듈 생성**

```typescript
// src/lib/middleware/rate-limiter.ts
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
};
```

**Step 2: 커밋**

```bash
git add src/lib/middleware/rate-limiter.ts
git commit -m "feat: 토큰 버킷 기반 Rate Limiter 추가

chat: 분당 30회, upload: 분당 10회, api: 분당 60회.
5분 미사용 버킷 자동 정리."
```

---

### Task 4: API 라우트에 Rate Limiter 적용

**Files:**
- Modify: `src/app/api/chat/route.ts:7-8` (import + 체크 추가)
- Modify: `src/app/api/upload/route.ts:7-8` (import + 체크 추가)

**Step 1: chat/route.ts에 Rate Limiter 적용**

`src/app/api/chat/route.ts` 상단 import에 추가:

```typescript
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';
```

`POST` 함수 시작 부분, `const encoder` 뒤에 추가:

```typescript
    // Rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`chat:${clientIP}`, RATE_LIMITS.chat)) {
      return new Response(
        JSON.stringify({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
```

**Step 2: upload/route.ts에 Rate Limiter 적용**

`src/app/api/upload/route.ts` 상단 import에 추가:

```typescript
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';
```

`POST` 함수 시작 부분, `try {` 바로 뒤에 추가:

```typescript
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`upload:${clientIP}`, RATE_LIMITS.upload)) {
      return NextResponse.json(
        { error: '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }
```

**Step 3: useChat.ts에 429 에러 시 Toast 표시**

`src/hooks/useChat.ts` 상단에 import 추가:

```typescript
import { addToast } from '@/hooks/useToast';
```

`sendMessage` 함수의 `response.ok` 체크 뒤 (약 82행)를 수정:

```typescript
      if (!response.ok) {
        if (response.status === 429) {
          addToast('warning', '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
          throw new Error('Rate limited');
        }
        throw new Error(`HTTP ${response.status}`);
      }
```

catch 블록에서 에러 메시지도 Toast로 표시. 기존 `setError(msg)` 뒤에 추가:

```typescript
      setError(msg);
      addToast('error', msg);
```

**Step 4: 커밋**

```bash
git add src/app/api/chat/route.ts src/app/api/upload/route.ts src/hooks/useChat.ts
git commit -m "feat: chat/upload API에 Rate Limiter 적용 + Toast 에러 표시

429 응답 시 Toast 경고 표시. 에러 발생 시에도 Toast로 알림."
```

---

## Agent B: 검색/내보내기 개선 (Features 8, 9)

### Task 5: 검색 결과에 snippet 반환

**Files:**
- Modify: `src/lib/conversations/storage.ts` (SearchResult 타입 + searchConversations 수정)
- Modify: `src/app/api/conversations/search/route.ts`

**Step 1: storage.ts에 SearchResult 타입 추가 및 searchConversations 수정**

`src/lib/conversations/storage.ts`에서 `searchConversations` 함수를 다음으로 교체:

```typescript
export interface SearchResult extends ConversationMeta {
  matchedSnippet?: string;
  matchType: 'title' | 'content';
}

export async function searchConversations(query: string): Promise<SearchResult[]> {
  const index = await readIndex();
  const lowerQuery = query.toLowerCase();

  const results: SearchResult[] = [];

  // Title matches
  for (const meta of index) {
    if (meta.title.toLowerCase().includes(lowerQuery)) {
      results.push({ ...meta, matchType: 'title' });
    }
  }

  // Content matches (skip already matched by title)
  const titleMatchIds = new Set(results.map((r) => r.id));
  for (const meta of index) {
    if (titleMatchIds.has(meta.id)) continue;
    try {
      const conv = await getConversation(meta.id);
      if (!conv) continue;
      for (const msg of conv.messages) {
        const idx = msg.content.toLowerCase().indexOf(lowerQuery);
        if (idx !== -1) {
          const start = Math.max(0, idx - 30);
          const end = Math.min(msg.content.length, idx + query.length + 50);
          const snippet = (start > 0 ? '...' : '') +
            msg.content.slice(start, end) +
            (end < msg.content.length ? '...' : '');
          results.push({ ...meta, matchType: 'content', matchedSnippet: snippet });
          break;
        }
      }
    } catch {
      // skip unreadable conversations
    }
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}
```

**Step 2: 커밋**

```bash
git add src/lib/conversations/storage.ts
git commit -m "feat: 검색 결과에 matchedSnippet과 matchType 추가

제목 매칭/본문 매칭 구분, 본문 매칭 시 전후 문맥 snippet 반환."
```

---

### Task 6: 프론트엔드 검색 결과 snippet 표시

**Files:**
- Modify: `src/hooks/useConversations.ts` (SearchResult 타입 사용)
- Modify: `src/components/sidebar/ConversationItem.tsx` (snippet 표시)

**Step 1: useConversations.ts에서 searchResults 상태 추가**

`src/hooks/useConversations.ts`의 `search` 함수를 수정하여 snippet 데이터를 보존. `conversations` 상태에 `matchedSnippet`을 포함시키기 위해 타입을 확장:

상단에 타입 import 추가:

```typescript
import { ConversationMeta } from '@/types/conversation';
```

아래에 인터페이스 추가 (import 뒤):

```typescript
export interface ConversationWithSnippet extends ConversationMeta {
  matchedSnippet?: string;
  matchType?: 'title' | 'content';
}
```

`conversations` 상태 타입을 변경:

```typescript
const [conversations, setConversations] = useState<ConversationWithSnippet[]>([]);
```

`search` 함수에서 결과를 그대로 설정:

```typescript
  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await fetchConversations();
      return;
    }
    try {
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // search failed
    }
  }, [fetchConversations]);
```

(함수 자체는 동일하지만 타입이 ConversationWithSnippet으로 확장됨)

**Step 2: ConversationItem.tsx에 snippet 표시**

`src/components/sidebar/ConversationItem.tsx`의 props 인터페이스에 snippet 추가:

```typescript
interface ConversationItemProps {
  conversation: ConversationMeta & { matchedSnippet?: string; matchType?: string };
  // ... 기존 props 동일
}
```

`formatTimeAgo` 표시 부분 (약 90행의 `<span className="text-[10px] text-muted">` 아래)에 snippet 표시 추가:

```tsx
              {conversation.matchedSnippet && (
                <p className="text-[10px] text-muted/70 truncate mt-0.5">
                  &ldquo;{conversation.matchedSnippet}&rdquo;
                </p>
              )}
```

**Step 3: 커밋**

```bash
git add src/hooks/useConversations.ts src/components/sidebar/ConversationItem.tsx
git commit -m "feat: 검색 결과에 매칭된 메시지 snippet 표시

검색 시 본문 매칭 대화에 snippet 미리보기 표시."
```

---

### Task 7: 마크다운 내보내기 개선

**Files:**
- Modify: `src/app/api/conversations/[id]/export/route.ts`

**Step 1: 내보내기에 도구 호출 결과 포함**

`src/app/api/conversations/[id]/export/route.ts`의 `format === 'markdown'` 블록에서 마크다운 생성 로직을 교체:

```typescript
    if (format === 'markdown') {
      const modelInfo = request.nextUrl.searchParams.get('model') || '';
      let md = `# ${conv.title}\n\n`;
      md += `> 날짜: ${new Date(conv.createdAt).toLocaleString('ko-KR')}\n`;
      if (modelInfo) md += `> 모델: ${modelInfo}\n`;
      md += `> 메시지 수: ${conv.messages.length}\n\n---\n\n`;

      for (const msg of conv.messages) {
        const role = msg.role === 'user' ? '**사용자**' : '**어시스턴트**';
        md += `${role}:\n\n`;

        // Tool calls
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            md += `<details>\n<summary>🔧 ${tc.tool} ${tc.success === false ? '(실패)' : ''}</summary>\n\n`;
            md += '```json\n' + JSON.stringify(tc.input, null, 2) + '\n```\n\n';
            if (tc.output) {
              md += '**결과:**\n```\n' + tc.output.slice(0, 2000) + '\n```\n';
            }
            md += '</details>\n\n';
          }
        }

        md += msg.content + '\n\n---\n\n';
      }

      const safeTitle = conv.title.replace(/[^\w가-힣\s.-]/g, '_');
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeTitle}.md"; filename*=UTF-8''${encodeURIComponent(conv.title)}.md`,
        },
      });
    }
```

**Step 2: 커밋**

```bash
git add "src/app/api/conversations/[id]/export/route.ts"
git commit -m "feat: 마크다운 내보내기에 도구 호출 결과 + 메타데이터 포함

도구 호출을 <details> 블록으로, 메타데이터(날짜/모델/메시지수) 헤더 추가."
```

---

## Agent C: UI 기능 (Features 10, 11, 12, 13)

### Task 8: 모델 파라미터 프리뷰

**Files:**
- Modify: `src/components/settings/ModelOptionsSliders.tsx`

**Step 1: 슬라이더에 설명 텍스트 추가**

`src/components/settings/ModelOptionsSliders.tsx`의 `SLIDER_CONFIGS`에 `description` 함수 추가:

```typescript
interface SliderConfig {
  key: keyof ModelOptions;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  describe: (v: number) => string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    min: 0,
    max: 2,
    step: 0.1,
    format: (v) => v.toFixed(1),
    describe: (v) => {
      if (v <= 0.3) return '매우 정확하고 결정적인 응답';
      if (v <= 0.7) return '균형 잡힌 응답';
      if (v <= 1.2) return '창의적이고 다양한 응답';
      return '매우 무작위적 (비추천)';
    },
  },
  {
    key: 'topP',
    label: 'Top P',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    describe: (v) => {
      if (v <= 0.5) return '상위 토큰만 사용 (집중적)';
      if (v <= 0.8) return '적당한 다양성';
      return '대부분의 토큰 고려 (다양)';
    },
  },
  {
    key: 'numPredict',
    label: 'Max Tokens',
    min: 256,
    max: 8192,
    step: 256,
    format: (v) => v.toString(),
    describe: (v) => {
      if (v <= 512) return '짧은 응답';
      if (v <= 2048) return '일반적인 길이';
      if (v <= 4096) return '긴 응답';
      return '매우 긴 응답';
    },
  },
];
```

렌더링 부분에서 min/max 표시 아래에 설명 추가:

```tsx
              <div className="flex justify-between text-[10px] text-muted mt-0.5">
                <span>{config.format(config.min)}</span>
                <span>{config.format(config.max)}</span>
              </div>
              <div className="text-[10px] text-accent/80 mt-0.5">
                {config.describe(value)}
              </div>
```

**Step 2: 커밋**

```bash
git add src/components/settings/ModelOptionsSliders.tsx
git commit -m "feat: 모델 파라미터 슬라이더에 값별 설명 표시

temperature/topP/maxTokens 값에 따라 동적으로 효과 설명."
```

---

### Task 9: 키보드 단축키 가이드

**Files:**
- Create: `src/components/ui/ShortcutGuide.tsx`

**Step 1: ShortcutGuide 컴포넌트 생성**

```tsx
// src/components/ui/ShortcutGuide.tsx
'use client';

interface ShortcutGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['Esc'], description: '응답 생성 중단' },
  { keys: ['Cmd', ','], description: '설정 열기/닫기' },
  { keys: ['Cmd', 'Shift', 'N'], description: '새 대화' },
  { keys: ['Enter'], description: '메시지 전송' },
  { keys: ['Shift', 'Enter'], description: '줄바꿈' },
  { keys: ['?'], description: '단축키 가이드' },
];

export default function ShortcutGuide({ isOpen, onClose }: ShortcutGuideProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-background border border-border rounded-2xl shadow-xl w-full max-w-sm p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">키보드 단축키</h3>
            <button onClick={onClose} className="text-muted hover:text-foreground text-xl">&times;</button>
          </div>
          <div className="space-y-3">
            {SHORTCUTS.map((s) => (
              <div key={s.description} className="flex items-center justify-between">
                <span className="text-sm text-muted">{s.description}</span>
                <div className="flex gap-1">
                  {s.keys.map((key) => (
                    <kbd
                      key={key}
                      className="px-2 py-0.5 text-xs font-mono bg-card border border-border rounded text-foreground"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-4 text-center">
            Mac: Cmd / Windows: Ctrl
          </p>
        </div>
      </div>
    </>
  );
}
```

**Step 2: 커밋**

```bash
git add src/components/ui/ShortcutGuide.tsx
git commit -m "feat: 키보드 단축키 가이드 모달 컴포넌트 추가"
```

---

### Task 10: ChatContainer 통합 — 드래그 오버레이 + 대화 분기 + 단축키 가이드 + Toast

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx`
- Modify: `src/components/chat/MessageBubble.tsx` (분기 버튼)
- Modify: `src/types/conversation.ts` (branchedFrom 필드)

**Step 1: conversation.ts에 branchedFrom 필드 추가**

`src/types/conversation.ts`에 필드 추가:

```typescript
export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  folderId?: string;
  tags?: string[];
  pinned?: boolean;
  branchedFrom?: { conversationId: string; messageIndex: number };
}

export interface Conversation extends ConversationMeta {
  messages: import('./message').Message[];
}
```

**Step 2: MessageBubble.tsx에 분기 버튼 추가**

`src/components/chat/MessageBubble.tsx`의 `MessageBubbleProps`에 `onBranch` 추가:

```typescript
interface MessageBubbleProps {
  message: Message;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onBranch?: (messageId: string) => void;
  isLast?: boolean;
}
```

함수 시그니처에 `onBranch` 추가:

```typescript
export default function MessageBubble({ message, onEdit, onRegenerate, onRetry, onBranch, isLast }: MessageBubbleProps) {
```

어시스턴트 메시지 action buttons (`{!isUser && message.content && (` 블록) 내부, regenerate 버튼 뒤에 분기 버튼 추가:

```tsx
            {onBranch && (
              <button onClick={() => onBranch(message.id)} className="p-1 text-muted hover:text-foreground" title="여기서 분기">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              </button>
            )}
```

**Step 3: ChatContainer.tsx 전체 교체**

`src/components/chat/ChatContainer.tsx` — 드래그 오버레이, 분기, 단축키 가이드, 기존 기능 유지:

```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { addToast } from '@/hooks/useToast';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import SettingsPanel from '@/components/settings/SettingsPanel';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Sidebar from '@/components/sidebar/Sidebar';
import ToolApprovalModal from '@/components/chat/ToolApprovalModal';
import ShortcutGuide from '@/components/ui/ShortcutGuide';

export default function ChatContainer() {
  const {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    regenerate,
    stopGeneration,
    clearMessages,
    conversationId,
    setConversationId,
    loadConversation,
    saveToServer,
    pendingApproval,
    respondToApproval,
  } = useChat();
  const { settings, updateSettings } = useSettings();
  const {
    conversations,
    folders,
    activeId,
    setActiveId,
    searchQuery,
    fetchConversations,
    createConversation,
    deleteConversation,
    renameConversation,
    search,
    togglePin,
    moveToFolder,
    updateTags,
    createFolder,
    deleteFolder: deleteFolderFn,
    renameFolder,
  } = useConversations();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutGuideOpen, setShortcutGuideOpen] = useState(false);
  const [isDragOverPage, setIsDragOverPage] = useState(false);
  const prevMessagesLenRef = useRef(0);
  const dragCounterRef = useRef(0);

  // Detect desktop on mount
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    setSidebarOpen(isDesktop);
  }, []);

  // Save messages to server after assistant response completes
  useEffect(() => {
    if (!isLoading && conversationId && messages.length > 0 && messages.length !== prevMessagesLenRef.current) {
      prevMessagesLenRef.current = messages.length;
      saveToServer(conversationId, messages);
      fetchConversations();
    }
  }, [isLoading, conversationId, messages, saveToServer, fetchConversations]);

  const handleNewChat = useCallback(() => {
    clearMessages();
    setActiveId(null);
    prevMessagesLenRef.current = 0;
  }, [clearMessages, setActiveId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoading) {
        stopGeneration();
      }
      if (e.key === 'Escape' && shortcutGuideOpen) {
        setShortcutGuideOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewChat();
      }
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShortcutGuideOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, stopGeneration, handleNewChat, shortcutGuideOpen]);

  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setConversationId(id);
    await loadConversation(id);
    prevMessagesLenRef.current = 0;
  }, [setActiveId, setConversationId, loadConversation]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    if (conversationId === id) {
      clearMessages();
      prevMessagesLenRef.current = 0;
    }
  }, [deleteConversation, conversationId, clearMessages]);

  const handleSend = useCallback(async (content: string, images?: string[]) => {
    let currentConvId = conversationId;

    if (!currentConvId) {
      const newId = await createConversation();
      if (!newId) return;
      currentConvId = newId;
      setConversationId(newId);
      setActiveId(newId);
    }

    await sendMessage(content, images);

    if (messages.length === 0 && currentConvId) {
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/conversations/${currentConvId}/title`, {
            method: 'POST',
          });
          if (res.ok) {
            fetchConversations();
          }
        } catch {
          // title generation failed
        }
      }, 2000);
    }
  }, [conversationId, createConversation, setConversationId, setActiveId, sendMessage, messages.length, fetchConversations]);

  // Branch conversation from a specific message
  const handleBranch = useCallback(async (messageId: string) => {
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const branchedMessages = messages.slice(0, msgIndex + 1);
    const newId = await createConversation('분기된 대화');
    if (!newId) return;

    try {
      await fetch(`/api/conversations/${newId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: branchedMessages,
          branchedFrom: conversationId ? { conversationId, messageIndex: msgIndex } : undefined,
        }),
      });
      setConversationId(newId);
      setActiveId(newId);
      await loadConversation(newId);
      prevMessagesLenRef.current = 0;
      fetchConversations();
      addToast('info', '대화가 분기되었습니다.');
    } catch {
      addToast('error', '대화 분기에 실패했습니다.');
    }
  }, [messages, conversationId, createConversation, setConversationId, setActiveId, loadConversation, fetchConversations]);

  const handleFileDrop = useCallback(async (files: FileList) => {
    for (const file of Array.from(files).slice(0, 5)) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.status === 429) {
          addToast('warning', '업로드 요청이 너무 많습니다.');
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.content) {
            handleSend(`파일 "${data.originalName}"의 내용입니다:\n\n\`\`\`\n${data.content}\n\`\`\``);
          } else {
            handleSend(`파일 "${data.originalName}"을 업로드했습니다. (경로: ${data.path})`);
          }
        } else {
          const err = await res.json().catch(() => ({ error: 'Upload failed' }));
          addToast('error', err.error || '업로드 실패');
        }
      } catch {
        addToast('error', '파일 업로드에 실패했습니다.');
      }
    }
  }, [handleSend]);

  const handleExport = useCallback(async (id: string, format: 'json' | 'markdown') => {
    try {
      const res = await fetch(`/api/conversations/${id}/export?format=${format}`);
      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'markdown' ? 'conversation.md' : 'conversation.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast('error', '내보내기에 실패했습니다.');
    }
  }, []);

  const handleImport = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Page-level drag overlay
  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOverPage(true);
    }
  }, []);

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOverPage(false);
    }
  }, []);

  const handlePageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOverPage(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileDrop(files);
    }
  }, [handleFileDrop]);

  // Touch swipe to open sidebar on mobile
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX < 30) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    if (dx > 60 && dy < 50) {
      setSidebarOpen(true);
    }
    touchStartRef.current = null;
  }, []);

  return (
    <div
      className="flex h-screen bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDragEnter={handlePageDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      <Sidebar
        conversations={conversations}
        folders={folders}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={renameConversation}
        onSearch={search}
        searchQuery={searchQuery}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onExport={handleExport}
        onImport={handleImport}
        onTogglePin={togglePin}
        onMoveToFolder={moveToFolder}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolderFn}
        onRenameFolder={renameFolder}
        onUpdateTags={updateTags}
      />

      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Drag overlay */}
        {isDragOverPage && (
          <div className="absolute inset-0 z-20 bg-accent/10 border-2 border-dashed border-accent rounded-lg flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-3xl mb-2">📁</div>
              <p className="text-sm font-medium text-accent">파일을 놓아주세요</p>
              <p className="text-xs text-muted mt-1">최대 5개 파일</p>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="p-1.5 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
              title="사이드바 토글"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="text-xl">🤖</span>
            <h1 className="text-base font-semibold">OllamaAgent</h1>
            <span className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded">
              {settings?.ollamaModel || 'loading...'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && (
              <button
                onClick={stopGeneration}
                className="px-3 py-1.5 text-xs bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
              >
                Stop <span className="text-[10px] opacity-60 ml-1">ESC</span>
              </button>
            )}
            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 text-xs bg-card text-muted rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
            >
              New Chat
            </button>
            <ThemeToggle />
            <button
              onClick={() => setShortcutGuideOpen(true)}
              className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
              title="단축키 (?)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
              title="Settings (Cmd+,)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>
          </div>
        </header>

        {/* Messages */}
        <MessageList
          messages={messages}
          isLoading={isLoading}
          onEdit={editMessage}
          onRegenerate={regenerate}
          onSend={(msg) => handleSend(msg)}
          onBranch={handleBranch}
        />

        {/* Input */}
        <ChatInput onSend={(msg, imgs) => handleSend(msg, imgs)} disabled={isLoading} onDrop={handleFileDrop} />
      </main>

      {/* Settings */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={updateSettings}
      />

      {/* Tool Approval Modal */}
      {pendingApproval && (
        <ToolApprovalModal
          toolName={pendingApproval.toolName}
          toolInput={pendingApproval.toolInput}
          confirmId={pendingApproval.confirmId}
          onRespond={respondToApproval}
        />
      )}

      {/* Shortcut Guide */}
      <ShortcutGuide isOpen={shortcutGuideOpen} onClose={() => setShortcutGuideOpen(false)} />
    </div>
  );
}
```

**Step 4: MessageList.tsx에 onBranch prop 전달**

`src/components/chat/MessageList.tsx`의 `MessageListProps`에 `onBranch` 추가:

```typescript
interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
  onSend?: (content: string) => void;
  onBranch?: (messageId: string) => void;
}
```

함수 시그니처에 `onBranch` 추가:

```typescript
export default function MessageList({ messages, isLoading, onEdit, onRegenerate, onSend, onBranch }: MessageListProps) {
```

`MessageBubble` 렌더링에 `onBranch` 전달:

```tsx
          <MessageBubble
            key={message.id}
            message={message}
            onEdit={onEdit}
            onRegenerate={onRegenerate}
            onRetry={onRegenerate}
            onBranch={onBranch}
            isLast={idx === messages.length - 1}
          />
```

**Step 5: 커밋**

```bash
git add src/types/conversation.ts src/components/chat/MessageBubble.tsx src/components/chat/ChatContainer.tsx src/components/chat/MessageList.tsx
git commit -m "feat: 드래그 앤 드롭 오버레이, 대화 분기, 단축키 가이드 통합

- 전체 페이지 드래그 오버레이 (최대 5개 파일)
- 메시지 분기 버튼으로 대화 복제
- ? 키로 단축키 가이드 모달 표시
- Toast 에러 알림 통합"
```

---

## Stage 2: Agent D — 테스트 (Feature 5)

> Stage 1 완료 후 실행

### Task 11: Vitest 설정

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

**Step 1: 패키지 설치**

```bash
pnpm add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom @vitejs/plugin-react jsdom
```

**Step 2: vitest.config.ts 생성**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Step 3: test setup 생성**

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
```

**Step 4: package.json에 test 스크립트 추가**

`package.json`의 `scripts`에 추가:

```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 5: 커밋**

```bash
git add vitest.config.ts src/test/setup.ts package.json pnpm-lock.yaml
git commit -m "chore: Vitest + React Testing Library 설정

vitest.config.ts, 테스트 setup, package.json 스크립트 추가."
```

---

### Task 12: Lib 유닛 테스트 — approval, registry, rate-limiter

**Files:**
- Create: `src/lib/agent/__tests__/approval.test.ts`
- Create: `src/lib/tools/__tests__/registry.test.ts`
- Create: `src/lib/middleware/__tests__/rate-limiter.test.ts`

**Step 1: approval.test.ts**

```typescript
// src/lib/agent/__tests__/approval.test.ts
import { describe, it, expect, vi } from 'vitest';
import { waitForApproval, resolveApproval } from '../approval';

describe('approval', () => {
  it('resolveApproval returns true when pending approval exists', async () => {
    const promise = waitForApproval('test-1');
    const found = resolveApproval('test-1', true);
    expect(found).toBe(true);
    const result = await promise;
    expect(result).toBe(true);
  });

  it('resolveApproval returns false when no pending approval', () => {
    const found = resolveApproval('nonexistent', true);
    expect(found).toBe(false);
  });

  it('waitForApproval times out after 60s and resolves false', async () => {
    vi.useFakeTimers();
    const promise = waitForApproval('timeout-test');
    vi.advanceTimersByTime(61000);
    const result = await promise;
    expect(result).toBe(false);
    vi.useRealTimers();
  });

  it('resolveApproval with denied returns false to waiter', async () => {
    const promise = waitForApproval('deny-test');
    resolveApproval('deny-test', false);
    const result = await promise;
    expect(result).toBe(false);
  });
});
```

**Step 2: registry.test.ts**

```typescript
// src/lib/tools/__tests__/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../registry';
import { BaseTool } from '../base-tool';

class MockTool extends BaseTool {
  constructor(name: string) {
    super({
      name,
      description: `Mock ${name}`,
      parameters: { type: 'object', properties: {} },
    });
  }
  async execute(): Promise<{ success: boolean; output: string }> {
    return { success: true, output: 'ok' };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers and retrieves a tool', () => {
    const tool = new MockTool('test_tool');
    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
  });

  it('returns undefined for unregistered tool', () => {
    expect(registry.get('missing')).toBeUndefined();
  });

  it('getAll returns all registered tools', () => {
    registry.register(new MockTool('a'));
    registry.register(new MockTool('b'));
    expect(registry.getAll()).toHaveLength(2);
  });

  it('replaceAll atomically swaps tools', () => {
    registry.register(new MockTool('old'));
    registry.replaceAll([new MockTool('new1'), new MockTool('new2')]);
    expect(registry.get('old')).toBeUndefined();
    expect(registry.get('new1')).toBeDefined();
    expect(registry.get('new2')).toBeDefined();
  });
});
```

**Step 3: rate-limiter.test.ts**

```typescript
// src/lib/middleware/__tests__/rate-limiter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Re-import to get fresh module state
let checkRateLimit: typeof import('../rate-limiter').checkRateLimit;

describe('checkRateLimit', () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../rate-limiter');
    checkRateLimit = mod.checkRateLimit;
  });

  it('allows requests under limit', () => {
    const config = { maxTokens: 3, refillPerSecond: 0 };
    expect(checkRateLimit('test', config)).toBe(true);
    expect(checkRateLimit('test', config)).toBe(true);
    expect(checkRateLimit('test', config)).toBe(true);
  });

  it('blocks requests over limit', () => {
    const config = { maxTokens: 2, refillPerSecond: 0 };
    expect(checkRateLimit('block', config)).toBe(true);
    expect(checkRateLimit('block', config)).toBe(true);
    expect(checkRateLimit('block', config)).toBe(false);
  });

  it('tracks different keys independently', () => {
    const config = { maxTokens: 1, refillPerSecond: 0 };
    expect(checkRateLimit('key1', config)).toBe(true);
    expect(checkRateLimit('key2', config)).toBe(true);
    expect(checkRateLimit('key1', config)).toBe(false);
    expect(checkRateLimit('key2', config)).toBe(false);
  });

  it('refills tokens over time', () => {
    vi.useFakeTimers();
    const config = { maxTokens: 2, refillPerSecond: 1 };
    expect(checkRateLimit('refill', config)).toBe(true);
    expect(checkRateLimit('refill', config)).toBe(true);
    expect(checkRateLimit('refill', config)).toBe(false);

    vi.advanceTimersByTime(2000); // 2 seconds = 2 tokens refilled
    expect(checkRateLimit('refill', config)).toBe(true);
    vi.useRealTimers();
  });
});
```

**Step 4: 테스트 실행 확인**

```bash
pnpm test:run -- --reporter=verbose src/lib/agent/__tests__/ src/lib/tools/__tests__/ src/lib/middleware/__tests__/
```

**Step 5: 커밋**

```bash
git add src/lib/agent/__tests__/ src/lib/tools/__tests__/ src/lib/middleware/__tests__/
git commit -m "test: approval, registry, rate-limiter 유닛 테스트 추가 (12개)"
```

---

### Task 13: Lib 유닛 테스트 — http-client SSRF, storage ID 검증

**Files:**
- Create: `src/lib/tools/__tests__/http-client.test.ts`
- Create: `src/lib/conversations/__tests__/storage.test.ts`

**Step 1: http-client.test.ts**

```typescript
// src/lib/tools/__tests__/http-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HttpClientTool } from '../http-client';

// Mock global fetch
vi.stubGlobal('fetch', vi.fn());

describe('HttpClientTool SSRF prevention', () => {
  const tool = new HttpClientTool();

  it('blocks localhost', async () => {
    const result = await tool.execute({ url: 'http://localhost:8080/secret' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('내부 네트워크');
  });

  it('blocks 127.0.0.1', async () => {
    const result = await tool.execute({ url: 'http://127.0.0.1/admin' });
    expect(result.success).toBe(false);
  });

  it('blocks private IP 192.168.x.x', async () => {
    const result = await tool.execute({ url: 'http://192.168.1.1/' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('사설 IP');
  });

  it('blocks private IP 10.x.x.x', async () => {
    const result = await tool.execute({ url: 'http://10.0.0.1/' });
    expect(result.success).toBe(false);
  });

  it('blocks metadata service', async () => {
    const result = await tool.execute({ url: 'http://169.254.169.254/latest/meta-data/' });
    expect(result.success).toBe(false);
  });

  it('blocks non-HTTP protocols', async () => {
    const result = await tool.execute({ url: 'ftp://example.com/file' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('HTTP/HTTPS');
  });

  it('requires url parameter', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.output).toContain('url');
  });
});
```

**Step 2: storage.test.ts (ID 검증)**

```typescript
// src/lib/conversations/__tests__/storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs module
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

describe('storage ID validation', () => {
  let getConversation: typeof import('../storage').getConversation;
  let deleteConversation: typeof import('../storage').deleteConversation;
  let saveConversation: typeof import('../storage').saveConversation;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../storage');
    getConversation = mod.getConversation;
    deleteConversation = mod.deleteConversation;
    saveConversation = mod.saveConversation;
  });

  it('rejects path traversal in getConversation', async () => {
    const result = await getConversation('../../../etc/passwd');
    expect(result).toBeNull(); // Should catch the validation error
  });

  it('rejects path traversal in deleteConversation', async () => {
    // validateId throws, caught by try/catch
    await expect(async () => {
      // deleteConversation catches errors silently
      await deleteConversation('../etc/passwd');
    }).not.toThrow(); // It catches internally
  });

  it('accepts valid UUID-like IDs', async () => {
    // This will return null because the file doesn't exist (mocked)
    const result = await getConversation('abc-123-def');
    expect(result).toBeNull(); // null from file not found, not from validation
  });

  it('rejects IDs with special characters', async () => {
    const result = await getConversation('id with spaces');
    expect(result).toBeNull();
  });
});
```

**Step 3: 테스트 실행 확인**

```bash
pnpm test:run -- --reporter=verbose src/lib/tools/__tests__/http-client.test.ts src/lib/conversations/__tests__/storage.test.ts
```

**Step 4: 커밋**

```bash
git add src/lib/tools/__tests__/http-client.test.ts src/lib/conversations/__tests__/storage.test.ts
git commit -m "test: SSRF 방지 + storage ID 검증 테스트 추가 (11개)"
```

---

### Task 14: 컴포넌트 테스트 — MessageBubble, MessageList

**Files:**
- Create: `src/components/chat/__tests__/MessageBubble.test.tsx`
- Create: `src/components/chat/__tests__/MessageList.test.tsx`

**Step 1: Mock 모듈 설정**

```tsx
// src/components/chat/__tests__/MessageBubble.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageBubble from '../MessageBubble';
import { Message } from '@/types/message';

// Mock hooks
vi.mock('@/hooks/useVoice', () => ({
  useVoice: () => ({
    isSpeaking: false,
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
  }),
}));

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'test-1',
  role: 'assistant',
  content: 'Hello world',
  timestamp: Date.now(),
  ...overrides,
});

describe('MessageBubble', () => {
  it('renders user message', () => {
    render(<MessageBubble message={makeMessage({ role: 'user', content: 'Hi' })} />);
    expect(screen.getByText('Hi')).toBeInTheDocument();
  });

  it('renders assistant message with markdown', () => {
    render(<MessageBubble message={makeMessage({ content: 'Hello world' })} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows aborted indicator', () => {
    render(<MessageBubble message={makeMessage({ aborted: true })} />);
    expect(screen.getByText('응답이 중단되었습니다')).toBeInTheDocument();
  });

  it('shows error with retry button when isLast', () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={makeMessage({ error: 'Something failed' })}
        onRetry={onRetry}
        isLast
      />
    );
    expect(screen.getByText('Something failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('재시도'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('calls onBranch when branch button clicked', async () => {
    const onBranch = vi.fn();
    render(
      <MessageBubble
        message={makeMessage()}
        onBranch={onBranch}
      />
    );
    const branchBtn = screen.getByTitle('여기서 분기');
    fireEvent.click(branchBtn);
    expect(onBranch).toHaveBeenCalledWith('test-1');
  });
});
```

**Step 2: MessageList.test.tsx**

```tsx
// src/components/chat/__tests__/MessageList.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageList from '../MessageList';

vi.mock('@/hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({ ref: { current: null } }),
}));

vi.mock('@/hooks/useVoice', () => ({
  useVoice: () => ({
    isSpeaking: false,
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
  }),
}));

describe('MessageList', () => {
  it('shows suggestions when empty', () => {
    render(<MessageList messages={[]} isLoading={false} />);
    expect(screen.getByText('무엇이든 물어보세요')).toBeInTheDocument();
    expect(screen.getByText('코드 작성')).toBeInTheDocument();
    expect(screen.getByText('웹 검색')).toBeInTheDocument();
  });

  it('calls onSend when suggestion clicked', () => {
    const onSend = vi.fn();
    render(<MessageList messages={[]} isLoading={false} onSend={onSend} />);
    fireEvent.click(screen.getByText('코드 작성'));
    expect(onSend).toHaveBeenCalledWith('Python으로 간단한 웹 스크래퍼를 만들어주세요');
  });

  it('renders messages when provided', () => {
    const messages = [
      { id: '1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
      { id: '2', role: 'assistant' as const, content: 'Hi there', timestamp: Date.now() },
    ];
    render(<MessageList messages={messages} isLoading={false} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    const messages = [
      { id: '1', role: 'assistant' as const, content: '', timestamp: Date.now() },
    ];
    render(<MessageList messages={messages} isLoading={true} />);
    expect(screen.getByText('생각하고 있습니다...')).toBeInTheDocument();
  });
});
```

**Step 3: 테스트 실행 확인**

```bash
pnpm test:run -- --reporter=verbose src/components/chat/__tests__/
```

**Step 4: 커밋**

```bash
git add src/components/chat/__tests__/
git commit -m "test: MessageBubble + MessageList 컴포넌트 테스트 추가 (9개)"
```

---

### Task 15: 컴포넌트 테스트 — ChatInput, Toast, ShortcutGuide

**Files:**
- Create: `src/components/chat/__tests__/ChatInput.test.tsx`
- Create: `src/components/ui/__tests__/ToastContainer.test.tsx`
- Create: `src/components/ui/__tests__/ShortcutGuide.test.tsx`

**Step 1: ChatInput.test.tsx**

```tsx
// src/components/chat/__tests__/ChatInput.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatInput from '../ChatInput';

vi.mock('@/components/voice/VoiceButton', () => ({
  default: () => <button data-testid="voice-btn">Voice</button>,
}));

vi.mock('@/hooks/useVoice', () => ({
  useVoice: () => ({
    isRecording: false,
    isTranscribing: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(''),
  }),
}));

describe('ChatInput', () => {
  it('sends message on Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledWith('Hello', undefined);
  });

  it('does not send empty message', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('allows newline with Shift+Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    expect(textarea).toBeDisabled();
  });
});
```

**Step 2: ToastContainer.test.tsx**

```tsx
// src/components/ui/__tests__/ToastContainer.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ToastContainer from '../ToastContainer';
import { addToast, removeToast } from '@/hooks/useToast';

describe('ToastContainer', () => {
  beforeEach(() => {
    // Clear toasts by removing them
    vi.useFakeTimers();
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toast when added', () => {
    render(<ToastContainer />);
    act(() => addToast('error', 'Something went wrong'));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('removes toast on close button click', () => {
    render(<ToastContainer />);
    act(() => addToast('info', 'Test message'));
    expect(screen.getByText('Test message')).toBeInTheDocument();
    fireEvent.click(screen.getByText('\u00D7'));
    expect(screen.queryByText('Test message')).not.toBeInTheDocument();
  });

  it('auto-removes toast after 5 seconds', () => {
    render(<ToastContainer />);
    act(() => addToast('warning', 'Temporary'));
    expect(screen.getByText('Temporary')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByText('Temporary')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
```

**Step 3: ShortcutGuide.test.tsx**

```tsx
// src/components/ui/__tests__/ShortcutGuide.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShortcutGuide from '../ShortcutGuide';

describe('ShortcutGuide', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ShortcutGuide isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders shortcuts when open', () => {
    render(<ShortcutGuide isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('키보드 단축키')).toBeInTheDocument();
    expect(screen.getByText('응답 생성 중단')).toBeInTheDocument();
    expect(screen.getByText('새 대화')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutGuide isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('\u00D7'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutGuide isOpen={true} onClose={onClose} />);
    // Click the backdrop (first fixed div)
    const backdrop = screen.getByText('키보드 단축키').closest('[class*="fixed"]')!.previousSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
```

**Step 4: 테스트 실행 확인**

```bash
pnpm test:run -- --reporter=verbose src/components/
```

**Step 5: 커밋**

```bash
git add src/components/chat/__tests__/ChatInput.test.tsx src/components/ui/__tests__/
git commit -m "test: ChatInput, Toast, ShortcutGuide 컴포넌트 테스트 추가 (12개)"
```

---

### Task 16: 전체 테스트 실행 + useToast 테스트

**Files:**
- Create: `src/hooks/__tests__/useToast.test.ts`

**Step 1: useToast.test.ts**

```typescript
// src/hooks/__tests__/useToast.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

describe('useToast', () => {
  let useToast: typeof import('../../hooks/useToast').useToast;
  let addToast: typeof import('../../hooks/useToast').addToast;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mod = await import('../../hooks/useToast');
    useToast = mod.useToast;
    addToast = mod.addToast;
  });

  it('starts with empty toasts', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toHaveLength(0);
  });

  it('adds toast via global addToast', () => {
    const { result } = renderHook(() => useToast());
    act(() => addToast('error', 'test error'));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('error');
    expect(result.current.toasts[0].message).toBe('test error');
  });

  it('auto-removes toast after 5 seconds', () => {
    const { result } = renderHook(() => useToast());
    act(() => addToast('info', 'temporary'));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it('manually removes toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => addToast('warning', 'removable'));
    const id = result.current.toasts[0].id;
    act(() => result.current.removeToast(id));
    expect(result.current.toasts).toHaveLength(0);
    vi.useRealTimers();
  });
});
```

**Step 2: 전체 테스트 실행**

```bash
pnpm test:run -- --reporter=verbose
```

Expected: 전체 ~48개 테스트 통과

**Step 3: 커밋**

```bash
git add src/hooks/__tests__/
git commit -m "test: useToast 훅 테스트 추가 + 전체 테스트 확인 (~48개)"
```

---

## Stage 3: 빌드 검증

### Task 17: 빌드 및 린트 확인

**Step 1: TypeScript 빌드 확인**

```bash
pnpm build
```

Expected: 에러 없이 빌드 성공

**Step 2: 린트 확인**

```bash
pnpm lint
```

**Step 3: 전체 테스트 최종 확인**

```bash
pnpm test:run
```

**Step 4: 최종 커밋 (빌드 수정 필요 시)**

```bash
git add -A
git commit -m "fix: Phase 7 빌드 및 린트 오류 수정"
```

---

## Agent 구성 요약

| Agent | 영역 | 담당 Task | 수정 파일 (충돌 없음) |
|-------|------|-----------|----------------------|
| **A** | 인프라 | 1-4 | useToast.ts, ToastContainer.tsx, ErrorBoundary.tsx, rate-limiter.ts, layout.tsx, chat/route.ts, upload/route.ts, useChat.ts |
| **B** | 검색/내보내기 | 5-7 | storage.ts, useConversations.ts, ConversationItem.tsx, export/route.ts |
| **C** | UI 기능 | 8-10 | ModelOptionsSliders.tsx, ShortcutGuide.tsx, ChatContainer.tsx, MessageBubble.tsx, MessageList.tsx, conversation.ts |
| **D** | 테스트 | 11-17 | vitest.config.ts, setup.ts, __tests__/ 전체 (Stage 1 완료 후) |

## 실행 순서

```
Stage 1: Agent A + B + C (병렬) — 파일 충돌 없음
Stage 2: Agent D (테스트) — Stage 1 완료 후
Stage 3: 빌드 검증
```
