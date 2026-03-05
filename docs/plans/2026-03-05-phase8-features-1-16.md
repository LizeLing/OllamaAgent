# Phase 8: 16개 기능 구현 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** P0 안정성(가상 스크롤, 메모리 만료, 에러 표준화, E2E 테스트) + P1 기능 완성(코드블록, 토큰, 이미지, 설정, 태그, 캐싱) + P2 UX 개선(템플릿, 대시보드, 도구 로그, 멀티모델, 테이블, 모바일) 총 16개 기능을 구현한다.

**Architecture:** 3개 스테이지, 9개 에이전트로 병렬 구현. Stage 1(8기능, 4에이전트)은 파일 충돌 없는 독립 작업, Stage 2(5기능, 3에이전트)는 Stage 1 완료 후 코어 기능, Stage 3(3기능, 2에이전트)는 대시보드/테스트.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Vitest, pnpm

---

## 에이전트 구성

### Stage 1 (독립 작업 - 파일 충돌 없음)

| 에이전트 | 기능 | 주요 파일 |
|----------|------|-----------|
| **Agent A** | F2 메모리 만료 + F3 에러 표준화 | `lib/memory/*`, `lib/errors.ts`, API routes |
| **Agent B** | F5 코드블록 개선 + F15 테이블 개선 | `MarkdownRenderer.tsx`, `globals.css` |
| **Agent C** | F8 설정 내보내기/가져오기 + F11 시스템 프롬프트 템플릿 | `SettingsPanel.tsx`, 새 API routes |
| **Agent D** | F9 태그 필터링 + F10 검색 캐싱 | `Sidebar.tsx`, `useConversations.ts` |

### Stage 2 (Stage 1 완료 후)

| 에이전트 | 기능 | 주요 파일 |
|----------|------|-----------|
| **Agent E** | F1 가상 스크롤 + F16 모바일 최적화 | `MessageList.tsx`, `ChatInput.tsx` |
| **Agent F** | F6 토큰 사용량 + F14 멀티모델 | `agent-loop.ts`, `useChat.ts`, types |
| **Agent G** | F7 이미지 분석 개선 | `ChatInput.tsx`, image API |

### Stage 3 (Stage 2 완료 후)

| 에이전트 | 기능 | 주요 파일 |
|----------|------|-----------|
| **Agent H** | F12 통계 대시보드 + F13 도구 실행 로그 | 새 컴포넌트, `ChatContainer.tsx` |
| **Agent I** | F4 E2E 테스트 | 새 테스트 파일, playwright 설정 |

---

## Stage 1: Agent A — 메모리 만료 정책 + 에러 표준화

### Task 1: 메모리 만료 정책 (Feature 2)

**Files:**
- Modify: `src/lib/memory/vector-store.ts`
- Modify: `src/lib/memory/memory-manager.ts`
- Create: `src/app/api/memory/route.ts`

**Step 1: vector-store.ts에 만료/삭제 함수 추가**

`src/lib/memory/vector-store.ts` 끝에 추가:

```typescript
export async function deleteVector(id: string): Promise<void> {
  try {
    await fs.unlink(path.join(VECTORS_DIR, `${id}.json`));
  } catch {
    // file may not exist
  }
  const index = await loadIndex();
  const filtered = index.filter((e) => e.id !== id);
  await saveIndex(filtered);
}

export async function purgeExpiredMemories(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
  const index = await loadIndex();
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  // Remove expired entries
  const valid = index.filter((e) => (now - e.createdAt) < maxAgeMs);

  // If still over maxCount, keep most recent
  valid.sort((a, b) => b.createdAt - a.createdAt);
  const toKeep = valid.slice(0, maxCount);
  const toDelete = index.filter((e) => !toKeep.find((k) => k.id === e.id));

  // Delete vector files
  for (const entry of toDelete) {
    try {
      await fs.unlink(path.join(VECTORS_DIR, `${entry.id}.json`));
    } catch {
      // skip
    }
  }

  if (toDelete.length > 0) {
    await saveIndex(toKeep);
  }

  return toDelete.length;
}
```

**Step 2: memory-manager.ts에 purge 메서드 추가**

`src/lib/memory/memory-manager.ts` 클래스에 추가:

```typescript
import { addVector, searchVectors, getMemoryCount, purgeExpiredMemories } from './vector-store';

// 클래스 내부에 추가:
async purgeOld(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
  return purgeExpiredMemories(maxAgeDays, maxCount);
}

async getCount(): Promise<number> {
  return getMemoryCount();
}
```

**Step 3: 메모리 관리 API 생성**

`src/app/api/memory/route.ts` 생성:

```typescript
import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { getMemoryCount, purgeExpiredMemories } from '@/lib/memory/vector-store';

export async function GET() {
  try {
    const count = await getMemoryCount();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ error: 'Failed to get memory count' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const maxAgeDays = parseInt(searchParams.get('maxAgeDays') || '30');
    const maxCount = parseInt(searchParams.get('maxCount') || '1000');

    const deleted = await purgeExpiredMemories(maxAgeDays, maxCount);
    const remaining = await getMemoryCount();

    return NextResponse.json({ deleted, remaining });
  } catch {
    return NextResponse.json({ error: 'Failed to purge memories' }, { status: 500 });
  }
}
```

**Step 4: 커밋**

```bash
git add src/lib/memory/vector-store.ts src/lib/memory/memory-manager.ts src/app/api/memory/route.ts
git commit -m "feat: 메모리 만료 정책 추가 (TTL + maxCount)

- purgeExpiredMemories: 기간/개수 기반 자동 정리
- /api/memory: GET(카운트), DELETE(정리) API
- 기본값: 30일 TTL, 최대 1000개"
```

---

### Task 2: 에러 처리 표준화 (Feature 3)

**Files:**
- Create: `src/lib/errors.ts`
- Modify: `src/app/api/chat/route.ts` (에러 응답 패턴)
- Modify: `src/app/api/conversations/route.ts` (에러 응답 패턴)

**Step 1: 에러 유틸리티 생성**

`src/lib/errors.ts` 생성:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorResponse(error: unknown, defaultMessage: string = 'Internal server error') {
  if (error instanceof AppError) {
    console.error(`[${error.code}] ${error.message}`);
    return {
      body: { error: error.message, code: error.code },
      status: error.statusCode,
    };
  }

  const message = error instanceof Error ? error.message : defaultMessage;
  console.error(`[INTERNAL_ERROR] ${message}`);
  return {
    body: { error: defaultMessage, code: 'INTERNAL_ERROR' },
    status: 500,
  };
}

export function createErrorResponse(error: unknown, defaultMessage?: string) {
  const { body, status } = errorResponse(error, defaultMessage);
  const { NextResponse } = require('next/server');
  return NextResponse.json(body, { status });
}
```

**Step 2: chat/route.ts에 에러 로깅 개선**

`src/app/api/chat/route.ts`의 catch 블록을 수정. 기존 `catch (error)` 블록에서:

```typescript
// 기존:
// catch (error) {
//   ...
// }

// 변경: 에러 로깅 추가
catch (error) {
  const msg = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[CHAT_ERROR] ${msg}`, error instanceof Error ? error.stack : '');
  // ... 기존 에러 SSE 전송 로직 유지
}
```

**Step 3: conversations/route.ts 에러 패턴 적용**

`src/app/api/conversations/route.ts`의 catch 블록에 console.error 추가:

```typescript
// GET 함수의 catch:
} catch (error) {
  console.error('[CONVERSATIONS_LIST_ERROR]', error instanceof Error ? error.message : error);
  return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
}

// POST 함수의 catch:
} catch (error) {
  console.error('[CONVERSATIONS_CREATE_ERROR]', error instanceof Error ? error.message : error);
  return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
}
```

**Step 4: 커밋**

```bash
git add src/lib/errors.ts src/app/api/chat/route.ts src/app/api/conversations/route.ts
git commit -m "feat: 에러 처리 표준화 - AppError 클래스 및 로깅 개선

- AppError: statusCode, code 포함 커스텀 에러
- errorResponse: 일관된 에러 응답 포맷
- API 라우트 에러 로깅 추가 (태그 기반)"
```

---

## Stage 1: Agent B — 코드블록 개선 + 테이블 개선

### Task 3: 코드블록 언어 라벨 표시 (Feature 5)

**Files:**
- Modify: `src/components/markdown/MarkdownRenderer.tsx`

**Step 1: MarkdownRenderer의 pre 컴포넌트에 언어 라벨 추가**

`src/components/markdown/MarkdownRenderer.tsx`의 `pre` 컴포넌트를 수정:

```typescript
pre({ children, ...props }) {
  const codeElement = children as React.ReactElement<{
    children?: string | string[];
    className?: string;
  }>;
  const codeText =
    typeof codeElement === 'object' &&
    codeElement !== null &&
    'props' in codeElement
      ? String(codeElement.props.children || '')
      : '';

  // Extract language from className (e.g., "language-typescript" → "typescript")
  const lang =
    typeof codeElement === 'object' &&
    codeElement !== null &&
    'props' in codeElement &&
    codeElement.props.className
      ? codeElement.props.className.replace(/^language-/, '').replace(/^hljs\s*/, '')
      : '';

  return (
    <div className="relative group my-2">
      {lang && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#1a1a1a] rounded-t-lg border-b border-[#333]">
          <span className="text-[11px] text-muted font-mono">{lang}</span>
          <CopyButton code={codeText} />
        </div>
      )}
      <pre
        className={`overflow-x-auto ${lang ? 'rounded-b-lg rounded-t-none' : 'rounded-lg'} bg-[#111] p-4 font-[family-name:var(--font-jetbrains)] text-sm`}
        {...props}
      >
        {children}
      </pre>
      {!lang && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton code={codeText} />
        </div>
      )}
    </div>
  );
},
```

**Step 2: 커밋**

```bash
git add src/components/markdown/MarkdownRenderer.tsx
git commit -m "feat: 코드블록에 언어 라벨 및 헤더 바 추가

- 언어가 있는 코드블록: 상단에 언어명 + 복사 버튼 헤더
- 언어가 없는 코드블록: 기존 hover 복사 버튼 유지"
```

---

### Task 4: 마크다운 테이블 개선 (Feature 15)

**Files:**
- Modify: `src/components/markdown/MarkdownRenderer.tsx`
- Modify: `src/app/globals.css`

**Step 1: MarkdownRenderer에 테이블 래퍼 추가**

`src/components/markdown/MarkdownRenderer.tsx`의 `components` 객체에 `table` 커스텀 렌더러 추가 (a 컴포넌트 뒤에):

```typescript
table({ children, ...props }) {
  return (
    <div className="overflow-x-auto my-3 rounded-lg border border-border">
      <table className="min-w-full" {...props}>
        {children}
      </table>
    </div>
  );
},
tr({ children, ...props }) {
  return (
    <tr className="even:bg-card/50" {...props}>
      {children}
    </tr>
  );
},
```

**Step 2: globals.css 테이블 스타일 개선**

`src/app/globals.css`의 기존 `.markdown-body table` 스타일을 교체:

```css
.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
}
.markdown-body th, .markdown-body td {
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
  text-align: left;
}
.markdown-body th {
  background: var(--card);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}
.markdown-body tr:hover td {
  background: var(--card-hover);
}
```

**Step 3: 커밋**

```bash
git add src/components/markdown/MarkdownRenderer.tsx src/app/globals.css
git commit -m "feat: 마크다운 테이블 개선 - 가로 스크롤, 스트라이프, 호버

- 가로 오버플로우 스크롤 래퍼 추가
- 짝수 행 배경색 (스트라이프)
- 행 호버 하이라이트
- 헤더 sticky 지원"
```

---

## Stage 1: Agent C — 설정 내보내기/가져오기 + 시스템 프롬프트 템플릿

### Task 5: 설정 내보내기/가져오기 (Feature 8)

**Files:**
- Create: `src/app/api/settings/export/route.ts`
- Create: `src/app/api/settings/import/route.ts`
- Modify: `src/components/settings/SettingsPanel.tsx`

**Step 1: 설정 내보내기 API**

`src/app/api/settings/export/route.ts` 생성:

```typescript
import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';

export async function GET() {
  try {
    const settings = await loadSettings();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="ollamaagent-settings.json"',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to export settings' }, { status: 500 });
  }
}
```

**Step 2: 설정 가져오기 API**

`src/app/api/settings/import/route.ts` 생성:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings } from '@/lib/config/settings';
import { Settings } from '@/types/settings';

const ALLOWED_KEYS: (keyof Settings)[] = [
  'systemPrompt', 'maxIterations', 'allowedPaths', 'deniedPaths',
  'responseLanguage', 'ollamaUrl', 'ollamaModel', 'embeddingModel',
  'imageModel', 'searxngUrl', 'autoReadResponses', 'ttsVoice',
  'toolApprovalMode', 'customTools', 'mcpServers', 'modelOptions',
  'enabledTools',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid import data' }, { status: 400 });
    }

    // Support both direct settings and { version, settings } format
    const importedSettings = body.settings || body;
    const current = await loadSettings();

    // Only merge known keys
    const merged: Record<string, unknown> = { ...current };
    for (const key of ALLOWED_KEYS) {
      if (key in importedSettings) {
        merged[key] = importedSettings[key];
      }
    }

    await saveSettings(merged as Settings);
    const updated = await loadSettings();

    return NextResponse.json({ success: true, settings: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to import settings' }, { status: 500 });
  }
}
```

**Step 3: SettingsPanel에 내보내기/가져오기 버튼 추가**

`src/components/settings/SettingsPanel.tsx`의 Save 버튼 앞에 추가:

```typescript
{/* Settings Import/Export */}
<div className="flex gap-2">
  <button
    onClick={async () => {
      try {
        const res = await fetch('/api/settings/export');
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ollamaagent-settings.json';
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        // export failed
      }
    }}
    className="flex-1 py-2 text-sm text-muted bg-card rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
  >
    설정 내보내기
  </button>
  <label className="flex-1 py-2 text-sm text-center text-muted bg-card rounded-lg hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer">
    설정 가져오기
    <input
      type="file"
      accept=".json"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          const res = await fetch('/api/settings/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const result = await res.json();
            setDraft({ ...result.settings });
          }
        } catch {
          // import failed
        }
        e.target.value = '';
      }}
    />
  </label>
</div>
```

**Step 4: 커밋**

```bash
git add src/app/api/settings/export/route.ts src/app/api/settings/import/route.ts src/components/settings/SettingsPanel.tsx
git commit -m "feat: 설정 내보내기/가져오기 기능

- /api/settings/export: JSON 파일 다운로드
- /api/settings/import: JSON 파일 업로드 및 병합
- SettingsPanel에 내보내기/가져오기 버튼 추가"
```

---

### Task 6: 시스템 프롬프트 템플릿 (Feature 11)

**Files:**
- Create: `src/lib/presets/prompt-templates.ts`
- Modify: `src/components/settings/SystemPromptEditor.tsx`

**Step 1: 프롬프트 템플릿 정의**

`src/lib/presets/prompt-templates.ts` 생성:

```typescript
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'default',
    name: '기본',
    description: '범용 AI 어시스턴트',
    prompt: '당신은 도움이 되는 AI 어시스턴트입니다. 한국어로 응답하세요.',
  },
  {
    id: 'coder',
    name: '코딩 전문가',
    description: '코드 작성 및 디버깅 특화',
    prompt: '당신은 숙련된 소프트웨어 엔지니어입니다. 코드를 작성할 때 클린 코드 원칙을 따르고, 항상 타입 안전한 코드를 작성합니다. 한국어로 설명하세요.',
  },
  {
    id: 'writer',
    name: '글쓰기 도우미',
    description: '문서 작성 및 교정',
    prompt: '당신은 전문 작가이자 편집자입니다. 명확하고 간결한 글쓰기를 도와주세요. 한국어로 응답하세요.',
  },
  {
    id: 'analyst',
    name: '데이터 분석가',
    description: '데이터 분석 및 인사이트 도출',
    prompt: '당신은 데이터 분석 전문가입니다. 데이터를 분석하고 인사이트를 도출하는 것을 도와주세요. 가능하면 수치와 근거를 제시하세요. 한국어로 응답하세요.',
  },
  {
    id: 'tutor',
    name: '학습 튜터',
    description: '개념 설명 및 학습 가이드',
    prompt: '당신은 친절한 튜터입니다. 복잡한 개념을 쉽게 설명하고, 단계별로 가르쳐주세요. 예시를 많이 사용하세요. 한국어로 응답하세요.',
  },
];
```

**Step 2: SystemPromptEditor에 템플릿 선택 드롭다운 추가**

`src/components/settings/SystemPromptEditor.tsx` 파일을 읽고 수정해야 함. 기존 인터페이스 확인 후, 템플릿 선택 기능을 추가:

```typescript
'use client';

import { useState } from 'react';
import { PROMPT_TEMPLATES } from '@/lib/presets/prompt-templates';

interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SystemPromptEditor({ value, onChange }: SystemPromptEditorProps) {
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">System Prompt</label>
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {showTemplates ? '닫기' : '템플릿 선택'}
        </button>
      </div>

      {showTemplates && (
        <div className="mb-2 grid grid-cols-1 gap-1.5">
          {PROMPT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onChange(t.prompt);
                setShowTemplates(false);
              }}
              className="text-left p-2 bg-card hover:bg-card-hover border border-border rounded-lg transition-colors"
            >
              <div className="text-xs font-medium text-foreground">{t.name}</div>
              <div className="text-[11px] text-muted">{t.description}</div>
            </button>
          ))}
        </div>
      )}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#111] border border-border rounded-lg px-3 py-2 text-sm h-32 resize-y focus:outline-none focus:border-accent"
        placeholder="시스템 프롬프트를 입력하세요..."
      />
    </div>
  );
}
```

**Step 3: 커밋**

```bash
git add src/lib/presets/prompt-templates.ts src/components/settings/SystemPromptEditor.tsx
git commit -m "feat: 시스템 프롬프트 템플릿 5종 추가

- 기본, 코딩 전문가, 글쓰기, 데이터 분석, 학습 튜터
- SystemPromptEditor에 템플릿 선택 토글 추가"
```

---

## Stage 1: Agent D — 태그 필터링 + 검색 캐싱

### Task 7: 대화 태그 필터링 (Feature 9)

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx`

**Step 1: Sidebar에 태그 필터 UI 추가**

`src/components/sidebar/Sidebar.tsx`에 태그 필터 상태와 UI 추가:

```typescript
// 기존 state 아래에 추가:
const [activeTag, setActiveTag] = useState<string | null>(null);

// conversations 그룹핑 로직 앞에 태그 수집 추가:
const allTags = Array.from(
  new Set(conversations.flatMap((c) => c.tags || []))
).sort();

// conversations 필터링 (기존 그룹핑 로직 앞에):
const filtered = activeTag
  ? conversations.filter((c) => c.tags?.includes(activeTag))
  : conversations;

// 그룹핑 로직에서 conversations → filtered 로 교체:
const pinned = filtered.filter((c) => c.pinned);
// ... byFolder, uncategorized도 filtered 사용

// Search 입력 아래에 태그 필터 바 추가:
```

검색 input 닫는 `</div>` 바로 아래에 태그 필터 UI 삽입:

```tsx
{/* Tag filter */}
{allTags.length > 0 && !searchQuery && (
  <div className="px-3 py-1 flex gap-1 flex-wrap">
    {activeTag && (
      <button
        onClick={() => setActiveTag(null)}
        className="px-2 py-0.5 text-[10px] rounded-full bg-error/20 text-error hover:bg-error/30 transition-colors"
      >
        초기화
      </button>
    )}
    {allTags.map((tag) => (
      <button
        key={tag}
        onClick={() => setActiveTag(activeTag === tag ? null : tag)}
        className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
          activeTag === tag
            ? 'bg-accent text-white'
            : 'bg-card text-muted hover:text-foreground hover:bg-card-hover'
        }`}
      >
        #{tag}
      </button>
    ))}
  </div>
)}
```

또한 `conversations.length === 0` 체크도 `filtered.length === 0`으로 교체.

**Step 2: 커밋**

```bash
git add src/components/sidebar/Sidebar.tsx
git commit -m "feat: 사이드바 태그 필터링 기능

- 사용된 태그 자동 수집 및 필터 바 표시
- 클릭하여 태그별 대화 필터링
- 초기화 버튼으로 필터 해제"
```

---

### Task 8: 검색 결과 캐싱 (Feature 10)

**Files:**
- Modify: `src/hooks/useConversations.ts`

**Step 1: 검색 캐시 구현**

`src/hooks/useConversations.ts`에 캐시 로직 추가:

```typescript
// 기존 import 아래에 캐시 맵 추가:
const searchCache = new Map<string, { data: ConversationWithSnippet[]; timestamp: number }>();
const CACHE_TTL = 30_000; // 30초

// search 함수 수정:
const search = useCallback(async (query: string) => {
  setSearchQuery(query);
  if (!query.trim()) {
    await fetchConversations();
    return;
  }

  // Check cache
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    setConversations(cached.data);
    return;
  }

  try {
    const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
      searchCache.set(query, { data, timestamp: Date.now() });

      // Limit cache size
      if (searchCache.size > 50) {
        const oldest = Array.from(searchCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        if (oldest) searchCache.delete(oldest[0]);
      }
    }
  } catch {
    // search failed
  }
}, [fetchConversations]);
```

또한 `fetchConversations` 성공 시 캐시 무효화:

```typescript
const fetchConversations = useCallback(async () => {
  try {
    const res = await fetch('/api/conversations');
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
      searchCache.clear(); // 데이터 변경 시 캐시 무효화
    }
  } catch {
    // fetch failed
  }
}, []);
```

**Step 2: 커밋**

```bash
git add src/hooks/useConversations.ts
git commit -m "feat: 검색 결과 캐싱 (30초 TTL, 최대 50개)

- 동일 검색어 재조회 시 캐시 반환
- 대화 목록 갱신 시 캐시 자동 무효화
- LRU 방식 캐시 크기 제한"
```

---

## Stage 2: Agent E — 가상 스크롤 + 모바일 최적화

### Task 9: 메시지 가상 스크롤 (Feature 1)

**Files:**
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/hooks/useAutoScroll.ts`

> **Note:** react-window이나 react-virtuoso 같은 외부 라이브러리 대신, 네이티브 IntersectionObserver 기반 지연 렌더링을 구현한다. 메시지가 100개 미만이면 전체 렌더링, 100개 이상이면 화면 근처 메시지만 렌더링.

**Step 1: MessageList에 지연 렌더링 구현**

`src/components/chat/MessageList.tsx`를 수정:

```typescript
'use client';

import { Message } from '@/types/message';
import MessageBubble from './MessageBubble';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
  onSend?: (content: string) => void;
  onBranch?: (messageId: string) => void;
}

const SUGGESTIONS = [
  {
    icon: '💻',
    title: '코드 작성',
    prompt: 'Python으로 간단한 웹 스크래퍼를 만들어주세요',
  },
  {
    icon: '📄',
    title: '파일 분석',
    prompt: '현재 디렉토리의 파일 목록을 보여주세요',
  },
  {
    icon: '🔍',
    title: '웹 검색',
    prompt: '최신 AI 뉴스를 검색해주세요',
  },
  {
    icon: '🧮',
    title: '문제 풀기',
    prompt: '피보나치 수열의 10번째 값을 구하는 코드를 작성하고 실행해주세요',
  },
];

const VIRTUAL_THRESHOLD = 100;
const RENDER_BUFFER = 20;

export default function MessageList({ messages, isLoading, onEdit, onRegenerate, onSend, onBranch }: MessageListProps) {
  const { ref } = useAutoScroll<HTMLDivElement>(messages);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: messages.length });
  const useVirtual = messages.length >= VIRTUAL_THRESHOLD;
  const sentinelTopRef = useRef<HTMLDivElement>(null);

  // When using virtual rendering, observe top sentinel to load more
  useEffect(() => {
    if (!useVirtual) {
      setVisibleRange({ start: 0, end: messages.length });
      return;
    }

    // Start by showing last RENDER_BUFFER*2 messages
    setVisibleRange({
      start: Math.max(0, messages.length - RENDER_BUFFER * 2),
      end: messages.length,
    });
  }, [messages.length, useVirtual]);

  // IntersectionObserver for loading older messages
  useEffect(() => {
    if (!useVirtual || !sentinelTopRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleRange.start > 0) {
          setVisibleRange((prev) => ({
            start: Math.max(0, prev.start - RENDER_BUFFER),
            end: prev.end,
          }));
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelTopRef.current);
    return () => observer.disconnect();
  }, [useVirtual, visibleRange.start]);

  if (messages.length === 0) {
    return (
      <div ref={ref} className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="text-center max-w-lg px-4">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-lg font-medium text-foreground mb-2">OllamaAgent</h2>
          <p className="text-sm text-muted mb-6">무엇이든 물어보세요</p>
          <div className="grid grid-cols-2 gap-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                onClick={() => onSend?.(s.prompt)}
                className="text-left p-3 bg-card hover:bg-card-hover border border-border rounded-xl transition-colors group"
              >
                <div className="text-lg mb-1">{s.icon}</div>
                <div className="text-xs font-medium text-foreground mb-0.5">{s.title}</div>
                <div className="text-[11px] text-muted leading-snug line-clamp-2">{s.prompt}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const visibleMessages = useVirtual
    ? messages.slice(visibleRange.start, visibleRange.end)
    : messages;

  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {/* Top sentinel for virtual scrolling */}
        {useVirtual && visibleRange.start > 0 && (
          <div ref={sentinelTopRef} className="h-4 flex items-center justify-center">
            <span className="text-[10px] text-muted">이전 메시지 {visibleRange.start}개 ...</span>
          </div>
        )}

        {visibleMessages.map((message, idx) => {
          const globalIdx = useVirtual ? visibleRange.start + idx : idx;
          return (
            <MessageBubble
              key={message.id}
              message={message}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
              onRetry={onRegenerate}
              onBranch={onBranch}
              isLast={globalIdx === messages.length - 1}
            />
          );
        })}
        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="flex items-center gap-2 text-muted text-sm ml-1 mb-4">
            <LoadingSpinner size={16} />
            <span>생각하고 있습니다...</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: 커밋**

```bash
git add src/components/chat/MessageList.tsx
git commit -m "feat: 메시지 가상 스크롤 (100개 이상 시 활성화)

- IntersectionObserver 기반 지연 렌더링
- 100개 미만: 전체 렌더링 (기존 동작)
- 100개 이상: 최근 40개부터 시작, 스크롤 시 20개씩 추가 로드
- 외부 의존성 없는 네이티브 구현"
```

---

### Task 10: 모바일 최적화 (Feature 16)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/chat/ChatInput.tsx`

**Step 1: globals.css에 모바일 반응형 스타일 추가**

`src/app/globals.css` 끝에 추가:

```css
/* Mobile optimizations */
@media (max-width: 640px) {
  .markdown-body h1 { font-size: 1.25rem; }
  .markdown-body h2 { font-size: 1.1rem; }
  .markdown-body h3 { font-size: 1rem; }
  .markdown-body p { font-size: 0.875rem; }
  .markdown-body ul, .markdown-body ol { margin-left: 1rem; }
  .markdown-body table { font-size: 0.75rem; }
  .markdown-body th, .markdown-body td { padding: 0.375rem 0.5rem; }
}

/* Prevent zoom on input focus (iOS) */
@media (max-width: 768px) {
  input, textarea, select {
    font-size: 16px !important;
  }
}

/* Keyboard visible height adjustment */
@supports (height: 100dvh) {
  .h-screen {
    height: 100dvh;
  }
}
```

**Step 2: ChatInput 모바일 개선**

`src/components/chat/ChatInput.tsx`의 textarea 컨테이너에 safe-area 패딩 추가. 기존 wrapper의 className에:

기존: `className="border-t border-border p-3 bg-background"`
변경: `className="border-t border-border p-3 bg-background safe-bottom"`

**Step 3: 커밋**

```bash
git add src/app/globals.css src/components/chat/ChatInput.tsx
git commit -m "feat: 모바일 최적화 - 반응형, iOS 줌 방지, dvh

- 640px 이하 마크다운 폰트 축소
- iOS input focus 줌 방지 (16px 최소)
- dvh 단위 사용으로 모바일 키보드 대응
- ChatInput safe-area 패딩"
```

---

## Stage 2: Agent F — 토큰 사용량 + 멀티모델

### Task 11: 토큰 사용량 표시 (Feature 6)

**Files:**
- Modify: `src/types/message.ts`
- Modify: `src/lib/agent/agent-loop.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/hooks/useChat.ts`
- Modify: `src/components/chat/MessageBubble.tsx`

**Step 1: Message 타입에 토큰 정보 추가**

`src/types/message.ts`에 추가:

```typescript
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
```

`Message` 인터페이스에 필드 추가:

```typescript
tokenUsage?: TokenUsage;
```

**Step 2: agent-loop.ts에서 토큰 정보 전달**

`src/lib/agent/agent-loop.ts`의 `done` 이벤트에 토큰 정보 추가.

Ollama 응답에는 `eval_count`(생성 토큰), `prompt_eval_count`(프롬프트 토큰)가 포함됨. chatStream의 마지막 chunk에서 이를 추출:

```typescript
// chatStream 루프 내, chunk.done 부분에서:
// 최종 응답 스트리밍 루프 수정:
let promptTokens = 0;
let completionTokens = 0;

for await (const chunk of chatStream(config.ollamaUrl, {
  model: config.ollamaModel,
  messages,
  think: true,
  options: config.modelOptions,
})) {
  if (chunk.message?.thinking) {
    hasThinking = true;
    yield { type: 'thinking_token', data: { content: chunk.message.thinking } };
  }
  if (chunk.message?.content) {
    yield { type: 'token', data: { content: chunk.message.content } };
  }
  if (chunk.done) {
    promptTokens = chunk.prompt_eval_count || 0;
    completionTokens = chunk.eval_count || 0;
  }
}
```

`done` 이벤트 수정:

```typescript
yield { type: 'done', data: {
  iterations: iteration + 1,
  tokenUsage: {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  },
}};
```

**Step 3: OllamaChatStreamChunk 타입에 토큰 필드 추가**

`src/lib/ollama/types.ts`의 `OllamaChatStreamChunk`에:

```typescript
prompt_eval_count?: number;
eval_count?: number;
```

**Step 4: useChat.ts에서 토큰 정보 처리**

`src/hooks/useChat.ts`의 `handleSSEEvent`에 `done` 케이스 추가:

```typescript
case 'done': {
  if (data.tokenUsage) {
    return { ...m, tokenUsage: data.tokenUsage as TokenUsage };
  }
  return m;
}
```

`import` 문에 `TokenUsage` 추가:

```typescript
import { Message, ToolCallInfo, ImageInfo, TokenUsage } from '@/types/message';
```

**Step 5: MessageBubble에 토큰 사용량 표시**

`src/components/chat/MessageBubble.tsx`의 assistant 메시지 액션 버튼 영역 (timestamp 옆)에 토큰 정보 표시:

```typescript
{/* 기존 timestamp 표시 바로 뒤에 */}
{message.tokenUsage && (
  <span className="text-[10px] text-muted ml-1" title={`프롬프트: ${message.tokenUsage.promptTokens} / 생성: ${message.tokenUsage.completionTokens}`}>
    {message.tokenUsage.totalTokens.toLocaleString()}t
  </span>
)}
```

**Step 6: 커밋**

```bash
git add src/types/message.ts src/lib/agent/agent-loop.ts src/lib/ollama/types.ts src/hooks/useChat.ts src/components/chat/MessageBubble.tsx
git commit -m "feat: 토큰 사용량 표시

- Ollama 응답에서 prompt/completion 토큰 카운트 추출
- agent-loop done 이벤트로 클라이언트 전달
- MessageBubble에 토큰 수 표시 (호버 시 상세)"
```

---

### Task 12: 멀티모델 대화 (Feature 14)

**Files:**
- Modify: `src/types/settings.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/components/chat/ChatContainer.tsx`

**Step 1: 메시지별 모델 오버라이드 지원**

`src/types/message.ts`의 `Message`에:

```typescript
model?: string;
```

**Step 2: ChatRequest에 model 필드 추가**

`src/types/api.ts`의 `ChatRequest`에:

```typescript
model?: string;
```

**Step 3: chat/route.ts에서 요청별 모델 사용**

`src/app/api/chat/route.ts`에서 모델을 요청에서 읽도록 수정:

```typescript
// 기존: const { message, history, images } = body;
const { message, history, images, model: requestModel } = body;

// AgentConfig 생성 시:
// ollamaModel: settings.ollamaModel →
ollamaModel: requestModel || settings.ollamaModel,
```

**Step 4: ChatContainer 헤더에 모델 선택 드롭다운 추가**

`src/components/chat/ChatContainer.tsx`에 상태 추가:

```typescript
const [selectedModel, setSelectedModel] = useState<string | null>(null);
const [availableModels, setAvailableModels] = useState<string[]>([]);

// 모델 목록 로드 (마운트 시)
useEffect(() => {
  fetch('/api/models')
    .then((r) => r.json())
    .then((data) => setAvailableModels(data.models || []))
    .catch(() => {});
}, []);
```

헤더의 모델 뱃지를 드롭다운으로 교체:

```tsx
{/* 기존 모델 배지 교체 */}
<select
  value={selectedModel || settings?.ollamaModel || ''}
  onChange={(e) => setSelectedModel(e.target.value || null)}
  className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded border-none outline-none cursor-pointer appearance-none"
  title="모델 선택"
>
  {availableModels.length > 0 ? (
    availableModels.map((m) => (
      <option key={m} value={m}>{m}</option>
    ))
  ) : (
    <option value={settings?.ollamaModel || ''}>{settings?.ollamaModel || 'loading...'}</option>
  )}
</select>
```

`handleSend`에서 선택된 모델 전달:

```typescript
// sendMessage 호출 시 모델 전달을 위해 useChat hook 수정 필요
// 대안: fetch body에 model 포함하도록 수정
```

이를 위해 `useChat.ts`의 `sendMessage`에 model 파라미터 추가:

```typescript
const sendMessage = useCallback(async (content: string, images?: string[], model?: string) => {
  // ...
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: content, history, images, model }),
    signal: abortController.signal,
  });
  // ...
```

`ChatContainer.tsx`의 `handleSend`에서:

```typescript
await sendMessage(content, images, selectedModel || undefined);
```

`done` 이벤트에서 model 정보도 저장 (agent-loop.ts에서 model 전달):

```typescript
yield { type: 'done', data: {
  iterations: iteration + 1,
  model: config.ollamaModel,
  // ...
}};
```

useChat의 done 핸들러에서:

```typescript
case 'done': {
  const updates: Partial<Message> = {};
  if (data.tokenUsage) updates.tokenUsage = data.tokenUsage as TokenUsage;
  if (data.model) updates.model = data.model as string;
  return Object.keys(updates).length > 0 ? { ...m, ...updates } : m;
}
```

**Step 5: MessageBubble에 모델명 표시**

토큰 사용량 옆에:

```typescript
{message.model && (
  <span className="text-[10px] text-muted ml-1">{message.model.split(':')[0]}</span>
)}
```

**Step 6: 커밋**

```bash
git add src/types/message.ts src/types/api.ts src/app/api/chat/route.ts src/hooks/useChat.ts src/components/chat/ChatContainer.tsx src/components/chat/MessageBubble.tsx src/lib/agent/agent-loop.ts
git commit -m "feat: 멀티모델 대화 지원

- 헤더에서 대화 중 모델 전환 가능
- 메시지별 사용된 모델 기록 및 표시
- API에 model 파라미터 추가"
```

---

## Stage 2: Agent G — 이미지 분석 개선

### Task 13: 이미지 분석 개선 (Feature 7)

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

**Step 1: 이미지 미리보기 개선 및 크기 제한**

`src/components/chat/ChatInput.tsx`의 이미지 처리 로직 개선:

기존 이미지 첨부 핸들러에 파일 크기 제한과 리사이즈 추가:

```typescript
// 이미지 처리 함수 (기존 handleImagePaste 또는 파일 선택 핸들러 근처에 추가)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_DIMENSION = 2048;

const processImage = useCallback(async (file: File): Promise<string | null> => {
  if (file.size > MAX_IMAGE_SIZE) {
    // Resize large images
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        resolve(base64);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  // Normal size: convert to base64
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}, []);
```

이미지 미리보기에 파일 크기 표시 추가 (기존 미리보기 영역에):

```tsx
{/* 기존 이미지 미리보기 수정 */}
{images.length > 0 && (
  <div className="flex gap-2 px-3 pt-2 flex-wrap">
    {images.map((img, i) => (
      <div key={i} className="relative group">
        <img
          src={`data:image/png;base64,${img}`}
          alt={`첨부 ${i + 1}`}
          className="w-16 h-16 object-cover rounded-lg border border-border"
        />
        <button
          onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-error text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      </div>
    ))}
  </div>
)}
```

**Step 2: 커밋**

```bash
git add src/components/chat/ChatInput.tsx
git commit -m "feat: 이미지 분석 개선 - 리사이즈, 미리보기, 삭제

- 5MB 초과 이미지 자동 리사이즈 (2048px, JPEG 80%)
- 이미지 미리보기 그리드 개선
- 개별 이미지 삭제 버튼 (호버 시 표시)"
```

---

## Stage 3: Agent H — 통계 대시보드 + 도구 실행 로그

### Task 14: 대화 통계 대시보드 (Feature 12)

**Files:**
- Create: `src/app/api/stats/route.ts`
- Create: `src/components/ui/StatsPanel.tsx`
- Modify: `src/components/chat/ChatContainer.tsx`

**Step 1: 통계 API 생성**

`src/app/api/stats/route.ts` 생성:

```typescript
import { NextResponse } from 'next/server';
import { readIndex } from '@/lib/conversations/storage';
import { getMemoryCount } from '@/lib/memory/vector-store';

export async function GET() {
  try {
    const conversations = await readIndex();
    const memoryCount = await getMemoryCount();

    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0);
    const pinnedCount = conversations.filter((c) => c.pinned).length;
    const tagCounts: Record<string, number> = {};
    const folderCounts: Record<string, number> = {};

    for (const c of conversations) {
      if (c.tags) {
        for (const tag of c.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      if (c.folderId) {
        folderCounts[c.folderId] = (folderCounts[c.folderId] || 0) + 1;
      }
    }

    // Activity by date (last 7 days)
    const now = Date.now();
    const dailyActivity: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - i * 86400000);
      const key = date.toISOString().slice(0, 10);
      dailyActivity[key] = 0;
    }
    for (const c of conversations) {
      const key = new Date(c.updatedAt).toISOString().slice(0, 10);
      if (key in dailyActivity) {
        dailyActivity[key]++;
      }
    }

    return NextResponse.json({
      totalConversations,
      totalMessages,
      pinnedCount,
      memoryCount,
      tagCounts,
      dailyActivity,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
```

`readIndex`는 현재 export 되어 있지 않음. `src/lib/conversations/storage.ts:21`에서 `async function readIndex` → `export async function readIndex`로 변경 필요.

**Step 2: 통계 패널 컴포넌트**

`src/components/ui/StatsPanel.tsx` 생성:

```typescript
'use client';

import { useState, useEffect } from 'react';

interface Stats {
  totalConversations: number;
  totalMessages: number;
  pinnedCount: number;
  memoryCount: number;
  tagCounts: Record<string, number>;
  dailyActivity: Record<string, number>;
}

interface StatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StatsPanel({ isOpen, onClose }: StatsPanelProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const topTags = stats
    ? Object.entries(stats.tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  const activityData = stats ? Object.entries(stats.dailyActivity) : [];
  const maxActivity = Math.max(...activityData.map(([, v]) => v), 1);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px] bg-background border border-border rounded-2xl z-50 max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">통계</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground text-xl">&times;</button>
          </div>

          {loading ? (
            <div className="text-center text-muted py-8">로딩 중...</div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '총 대화', value: stats.totalConversations },
                  { label: '총 메시지', value: stats.totalMessages },
                  { label: '고정 대화', value: stats.pinnedCount },
                  { label: '저장된 기억', value: stats.memoryCount },
                ].map((item) => (
                  <div key={item.label} className="bg-card rounded-xl p-3 border border-border">
                    <div className="text-[11px] text-muted">{item.label}</div>
                    <div className="text-xl font-semibold mt-1">{item.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* Activity chart (last 7 days) */}
              <div>
                <h3 className="text-sm font-medium mb-3">최근 7일 활동</h3>
                <div className="flex items-end gap-1 h-24">
                  {activityData.map(([date, count]) => (
                    <div key={date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-accent/70 rounded-t min-h-[2px] transition-all"
                        style={{ height: `${(count / maxActivity) * 100}%` }}
                      />
                      <span className="text-[9px] text-muted">{date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top tags */}
              {topTags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">인기 태그</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {topTags.map(([tag, count]) => (
                      <span key={tag} className="px-2 py-0.5 text-xs bg-card border border-border rounded-full">
                        #{tag} <span className="text-muted">({count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
```

**Step 3: ChatContainer에 통계 버튼 추가**

`src/components/chat/ChatContainer.tsx`에 import 추가:

```typescript
import StatsPanel from '@/components/ui/StatsPanel';
```

상태 추가:

```typescript
const [statsOpen, setStatsOpen] = useState(false);
```

헤더의 ShortcutGuide 버튼 앞에 통계 버튼 추가:

```tsx
<button
  onClick={() => setStatsOpen(true)}
  className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
  title="통계"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
</button>
```

ShortcutGuide 닫는 태그 뒤에 StatsPanel 추가:

```tsx
<StatsPanel isOpen={statsOpen} onClose={() => setStatsOpen(false)} />
```

**Step 4: 커밋**

```bash
git add src/app/api/stats/route.ts src/components/ui/StatsPanel.tsx src/components/chat/ChatContainer.tsx
git commit -m "feat: 대화 통계 대시보드

- /api/stats: 대화, 메시지, 기억, 태그 통계 API
- StatsPanel: 요약 카드, 7일 활동 차트, 인기 태그
- 헤더에 통계 버튼 추가"
```

---

### Task 15: 도구 실행 로그 패널 (Feature 13)

**Files:**
- Create: `src/components/ui/ToolLogPanel.tsx`
- Modify: `src/components/chat/ChatContainer.tsx`

**Step 1: ToolLogPanel 컴포넌트 생성**

`src/components/ui/ToolLogPanel.tsx` 생성:

```typescript
'use client';

import { Message, ToolCallInfo } from '@/types/message';

interface ToolLogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
}

export default function ToolLogPanel({ isOpen, onClose, messages }: ToolLogPanelProps) {
  if (!isOpen) return null;

  // Collect all tool calls from all messages
  const allToolCalls: (ToolCallInfo & { messageId: string })[] = [];
  for (const msg of messages) {
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        allToolCalls.push({ ...tc, messageId: msg.id });
      }
    }
  }

  const totalDuration = allToolCalls
    .filter((tc) => tc.endTime && tc.startTime)
    .reduce((sum, tc) => sum + ((tc.endTime || 0) - tc.startTime), 0);

  const successCount = allToolCalls.filter((tc) => tc.success).length;
  const failCount = allToolCalls.filter((tc) => tc.success === false).length;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full md:max-w-md bg-background border-l border-border z-50 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">도구 실행 로그</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground text-xl">&times;</button>
          </div>

          {/* Summary */}
          <div className="flex gap-3 mb-4 text-xs">
            <span className="text-muted">
              총 {allToolCalls.length}회
            </span>
            <span className="text-success">{successCount} 성공</span>
            {failCount > 0 && <span className="text-error">{failCount} 실패</span>}
            {totalDuration > 0 && (
              <span className="text-muted">{(totalDuration / 1000).toFixed(1)}초</span>
            )}
          </div>

          {allToolCalls.length === 0 ? (
            <div className="text-center text-muted text-sm py-8">
              도구 실행 기록이 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {allToolCalls.map((tc, i) => {
                const duration = tc.endTime ? ((tc.endTime - tc.startTime) / 1000).toFixed(1) : '...';
                return (
                  <div key={`${tc.id}-${i}`} className="bg-card rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono font-medium">{tc.tool}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">{duration}s</span>
                        <span className={`w-2 h-2 rounded-full ${
                          tc.success === true ? 'bg-success' :
                          tc.success === false ? 'bg-error' :
                          'bg-warning animate-pulse'
                        }`} />
                      </div>
                    </div>
                    <div className="text-[11px] text-muted font-mono truncate">
                      {JSON.stringify(tc.input).slice(0, 100)}
                    </div>
                    {tc.output && (
                      <div className="mt-1 text-[11px] text-muted/70 font-mono line-clamp-2 break-all">
                        {tc.output.slice(0, 200)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

**Step 2: ChatContainer에 도구 로그 버튼 추가**

`src/components/chat/ChatContainer.tsx`에 import 추가:

```typescript
import ToolLogPanel from '@/components/ui/ToolLogPanel';
```

상태 추가:

```typescript
const [toolLogOpen, setToolLogOpen] = useState(false);
```

통계 버튼 앞에 도구 로그 버튼 추가:

```tsx
<button
  onClick={() => setToolLogOpen(true)}
  className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
  title="도구 로그"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
</button>
```

StatsPanel 뒤에 ToolLogPanel 추가:

```tsx
<ToolLogPanel isOpen={toolLogOpen} onClose={() => setToolLogOpen(false)} messages={messages} />
```

**Step 3: 커밋**

```bash
git add src/components/ui/ToolLogPanel.tsx src/components/chat/ChatContainer.tsx
git commit -m "feat: 도구 실행 로그 패널

- 현재 대화의 모든 도구 호출 타임라인
- 성공/실패/실행중 상태 표시
- 입력 파라미터 및 출력 미리보기
- 총 실행 횟수, 성공률, 소요시간 요약"
```

---

## Stage 3: Agent I — E2E 테스트

### Task 16: E2E 테스트 (Feature 4)

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/chat.spec.ts`
- Create: `e2e/settings.spec.ts`
- Create: `e2e/sidebar.spec.ts`
- Modify: `package.json` (devDependencies)

**Step 1: Playwright 설치**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

**Step 2: Playwright 설정**

`playwright.config.ts` 생성:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```

**Step 3: 채팅 E2E 테스트**

`e2e/chat.spec.ts` 생성:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  test('should show welcome screen with suggestions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=OllamaAgent')).toBeVisible();
    await expect(page.locator('text=무엇이든 물어보세요')).toBeVisible();
    await expect(page.locator('text=코드 작성')).toBeVisible();
  });

  test('should have chat input', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea[placeholder]');
    await expect(textarea).toBeVisible();
  });

  test('should toggle settings with Cmd+,', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+,');
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('should create new chat with Cmd+Shift+N', async ({ page }) => {
    await page.goto('/');
    // Should not error when creating new chat
    await page.keyboard.press('Meta+Shift+N');
    await expect(page.locator('text=무엇이든 물어보세요')).toBeVisible();
  });

  test('should show shortcut guide with ?', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('?');
    await expect(page.locator('text=키보드 단축키')).toBeVisible();
  });
});
```

**Step 4: 설정 E2E 테스트**

`e2e/settings.spec.ts` 생성:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test('should open and close settings panel', async ({ page }) => {
    await page.goto('/');
    // Open settings
    await page.click('[title="Settings (Cmd+,)"]');
    await expect(page.locator('text=Settings').first()).toBeVisible();

    // Close settings
    await page.click('.fixed.inset-0');
    await expect(page.locator('.fixed.right-0.top-0')).not.toBeVisible();
  });

  test('should show model dropdown', async ({ page }) => {
    await page.goto('/');
    await page.click('[title="Settings (Cmd+,)"]');
    await expect(page.locator('text=Model')).toBeVisible();
  });
});
```

**Step 5: 사이드바 E2E 테스트**

`e2e/sidebar.spec.ts` 생성:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Sidebar', () => {
  test('should toggle sidebar', async ({ page }) => {
    await page.goto('/');
    // On desktop, sidebar should be visible
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('text=새 대화')).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('input[placeholder="대화 검색..."]')).toBeVisible();
  });

  test('should have import button', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('text=가져오기')).toBeVisible();
  });
});
```

**Step 6: package.json에 E2E 스크립트 추가**

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**Step 7: 커밋**

```bash
git add playwright.config.ts e2e/ package.json
git commit -m "feat: E2E 테스트 추가 (Playwright)

- 채팅: 환영 화면, 입력, 키보드 단축키
- 설정: 패널 열기/닫기, 모델 드롭다운
- 사이드바: 토글, 검색, 가져오기
- playwright.config.ts: Chromium, dev 서버 자동 시작"
```

---

## 빌드 검증

모든 Task 완료 후 최종 검증:

```bash
pnpm build
pnpm test
```

빌드 및 기존 테스트 통과 확인.

---

## 에이전트별 파일 충돌 분석

### Stage 1 (완전 병렬)

| | Agent A | Agent B | Agent C | Agent D |
|---|---------|---------|---------|---------|
| **Agent A** | memory/*, errors.ts, API routes | - | - | - |
| **Agent B** | - | MarkdownRenderer, globals.css | - | - |
| **Agent C** | - | - | SettingsPanel, settings API | - |
| **Agent D** | - | - | - | Sidebar, useConversations |

**충돌 없음 → 4개 에이전트 완전 병렬**

### Stage 2 (Stage 1 완료 후 병렬)

| | Agent E | Agent F | Agent G |
|---|---------|---------|---------|
| **Agent E** | MessageList, globals.css, ChatInput | - | - |
| **Agent F** | - | agent-loop, useChat, types, MessageBubble | - |
| **Agent G** | - | - | ChatInput |

**주의:** Agent E와 G 모두 ChatInput을 건드림.
- Agent E: `safe-bottom` 클래스만 추가 (간단)
- Agent G: 이미지 처리 로직 변경 (별도 영역)
→ 충돌 최소, 순차 실행 또는 수동 병합 필요시 Agent G를 Agent E 이후로.

**권장:** Agent E → Agent G 순차, Agent F는 E/G와 병렬.

### Stage 3 (Stage 2 완료 후 병렬)

| | Agent H | Agent I |
|---|---------|---------|
| **Agent H** | ChatContainer, 새 컴포넌트 | - |
| **Agent I** | - | 새 테스트 파일 |

**Agent H의 ChatContainer 수정과 Agent I의 테스트는 무관 → 병렬 가능.**
단, Agent I 테스트는 Stage 2 기능이 반영된 상태에서 실행해야 함.
