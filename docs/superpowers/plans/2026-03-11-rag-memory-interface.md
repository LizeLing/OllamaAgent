# RAG 메모리 관리 인터페이스 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 패널에 "메모리" 탭을 추가하여 임베딩 모델 선택, 카테고리 정책 관리, 메모리 CRUD, 수동 추가(텍스트/파일/URL)를 지원한다.

**Architecture:** Settings 타입에 `memoryCategories` 필드를 추가하고, vector-store에 목록 조회 함수를 노출한다. API 레이어에 메모리 CRUD 엔드포인트를 확장하고, MemoryTab 컴포넌트에서 전체 관리 UI를 제공한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-11-rag-memory-interface-design.md`

---

## 파일 구조

| 파일 | 역할 | 변경 |
|------|------|------|
| `src/types/settings.ts` | 설정 타입 정의 | `MemoryCategoryConfig` 추가 |
| `src/lib/config/constants.ts` | 기본 설정 값 | `memoryCategories` 기본값 추가 |
| `src/lib/memory/vector-store.ts` | 벡터 저장소 | `getMemoryList()` 함수 추가 |
| `src/lib/memory/structured-memory.ts` | 카테고리 분류 | Settings 기반 동적 가중치 지원 |
| `src/lib/memory/memory-manager.ts` | 메모리 관리자 | 수동 추가 메서드 추가 |
| `src/app/api/memory/route.ts` | 메모리 API | GET 목록 확장, POST 수동 추가 |
| `src/app/api/memory/[id]/route.ts` | 개별 메모리 API | 새 파일 — DELETE |
| `src/app/api/memory/bulk/route.ts` | 일괄 삭제 API | 새 파일 — DELETE |
| `src/components/settings/SettingsPanel.tsx` | 설정 패널 | 메모리 탭 추가 |
| `src/components/settings/tabs/MemoryTab.tsx` | 메모리 관리 UI | 새 파일 |

---

## Chunk 1: 데이터 레이어 (타입 + vector-store + structured-memory)

### Task 1: Settings 타입에 MemoryCategoryConfig 추가

**Files:**
- Modify: `src/types/settings.ts`
- Modify: `src/lib/config/constants.ts`
- Test: `src/lib/config/__tests__/settings.test.ts`

- [ ] **Step 1: 타입 정의 추가**

`src/types/settings.ts`에 추가:

```ts
export interface MemoryCategoryConfig {
  weight: number;
  maxAgeDays: number;
}
```

`Settings` 인터페이스에 필드 추가:

```ts
memoryCategories: Record<string, MemoryCategoryConfig>;
```

- [ ] **Step 2: DEFAULT_SETTINGS에 기본값 추가**

`src/lib/config/constants.ts`의 `DEFAULT_SETTINGS`에 추가:

```ts
memoryCategories: {
  technical: { weight: 1.2, maxAgeDays: 60 },
  research: { weight: 1.0, maxAgeDays: 30 },
  preference: { weight: 1.5, maxAgeDays: 90 },
  general: { weight: 0.8, maxAgeDays: 14 },
},
```

- [ ] **Step 3: 기존 settings 테스트 통과 확인**

Run: `pnpm vitest run src/lib/config/__tests__/settings.test.ts`
Expected: PASS (기존 테스트가 DEFAULT_SETTINGS 구조 변경에 영향받지 않는지 확인)

- [ ] **Step 4: 커밋**

```bash
git add src/types/settings.ts src/lib/config/constants.ts
git commit -m "feat: Settings에 memoryCategories 타입 및 기본값 추가"
```

---

### Task 2: vector-store에 getMemoryList 함수 추가

**Files:**
- Modify: `src/lib/memory/vector-store.ts`
- Test: `src/lib/memory/__tests__/vector-store.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/memory/__tests__/vector-store.test.ts`의 `beforeEach`에 `getMemoryList` import 추가:

```ts
let getMemoryList: typeof import('../vector-store').getMemoryList;

// beforeEach 내부에 추가:
getMemoryList = mod.getMemoryList;
```

테스트 추가 (기존 mock 패턴 — `mockFs.readFile`로 인덱스 데이터 설정):

```ts
describe('getMemoryList', () => {
  it('페이지네이션된 메모리 목록을 반환한다', async () => {
    const index = [
      { id: 'v1', text: '메모리 1', metadata: { category: 'technical' }, createdAt: 1000 },
      { id: 'v2', text: '메모리 2', metadata: { category: 'research' }, createdAt: 2000 },
      { id: 'v3', text: '메모리 3', metadata: { category: 'general' }, createdAt: 3000 },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const result = await getMemoryList({ page: 1, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.items[0]).toHaveProperty('id');
    expect(result.items[0]).toHaveProperty('text');
    expect(result.items[0]).toHaveProperty('metadata');
    expect(result.items[0]).toHaveProperty('createdAt');
  });

  it('카테고리로 필터링할 수 있다', async () => {
    const index = [
      { id: 'v1', text: '기술 메모', metadata: { category: 'technical' }, createdAt: 1000 },
      { id: 'v2', text: '일반 메모', metadata: { category: 'general' }, createdAt: 2000 },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const result = await getMemoryList({ page: 1, limit: 20, category: 'technical' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe('기술 메모');
  });

  it('최신순으로 정렬된다', async () => {
    const index = [
      { id: 'v1', text: '첫번째', createdAt: 1000 },
      { id: 'v2', text: '두번째', createdAt: 2000 },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const result = await getMemoryList({ page: 1, limit: 20 });

    expect(result.items[0].text).toBe('두번째');
    expect(result.items[1].text).toBe('첫번째');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/memory/__tests__/vector-store.test.ts`
Expected: FAIL — `getMemoryList is not a function`

- [ ] **Step 3: getMemoryList 구현**

`src/lib/memory/vector-store.ts`에 추가:

```ts
interface MemoryListOptions {
  page: number;
  limit: number;
  category?: string;
}

interface MemoryListResult {
  items: IndexEntry[];
  total: number;
  page: number;
  limit: number;
}

export async function getMemoryList(options: MemoryListOptions): Promise<MemoryListResult> {
  const { page, limit, category } = options;
  const index = await loadIndex();

  let filtered = index;
  if (category) {
    filtered = index.filter((e) => e.metadata?.category === category);
  }

  // 최신순 정렬
  filtered.sort((a, b) => b.createdAt - a.createdAt);

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return { items, total, page, limit };
}
```

기존 `IndexEntry` 인터페이스(vector-store.ts 18~23행)에 `export` 키워드 추가:

```ts
// 변경 전: interface IndexEntry {
// 변경 후:
export interface IndexEntry {
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/memory/__tests__/vector-store.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/memory/vector-store.ts src/lib/memory/__tests__/vector-store.test.ts
git commit -m "feat: vector-store에 getMemoryList 페이지네이션 함수 추가"
```

---

### Task 3: structured-memory에 동적 가중치 지원

**Files:**
- Modify: `src/lib/memory/structured-memory.ts`
- Modify: `src/lib/memory/memory-manager.ts`
- Test: `src/lib/memory/__tests__/structured-memory.test.ts` (새 파일)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/memory/__tests__/structured-memory.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { categorizeMemory, getMemoryWeight, type MemoryCategory } from '../structured-memory';

describe('categorizeMemory', () => {
  it('기술 키워드를 technical로 분류한다', () => {
    expect(categorizeMemory('React 컴포넌트 작성')).toBe('technical');
  });

  it('매칭 없으면 general을 반환한다', () => {
    expect(categorizeMemory('오늘 날씨 좋다')).toBe('general');
  });
});

describe('getMemoryWeight', () => {
  it('기본 가중치를 반환한다', () => {
    expect(getMemoryWeight('technical')).toBe(1.2);
  });

  it('커스텀 가중치를 반환한다', () => {
    const custom = { technical: { weight: 2.0, maxAgeDays: 90 } };
    expect(getMemoryWeight('technical', custom)).toBe(2.0);
  });

  it('커스텀에 없는 카테고리는 기본값을 사용한다', () => {
    const custom = { technical: { weight: 2.0, maxAgeDays: 90 } };
    expect(getMemoryWeight('general', custom)).toBe(0.8);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/memory/__tests__/structured-memory.test.ts`
Expected: FAIL — `getMemoryWeight is not exported`

- [ ] **Step 3: getMemoryWeight 함수 구현**

`src/lib/memory/structured-memory.ts`에 추가:

```ts
import type { MemoryCategoryConfig } from '@/types/settings';

export function getMemoryWeight(
  category: MemoryCategory,
  customCategories?: Record<string, MemoryCategoryConfig>
): number {
  if (customCategories?.[category]) {
    return customCategories[category].weight;
  }
  return MEMORY_CATEGORIES[category]?.weight ?? 1.0;
}

export function getMemoryMaxAge(
  category: MemoryCategory,
  customCategories?: Record<string, MemoryCategoryConfig>
): number {
  if (customCategories?.[category]) {
    return customCategories[category].maxAgeDays;
  }
  return MEMORY_CATEGORIES[category]?.maxAge ?? 30;
}
```

- [ ] **Step 4: memory-manager.ts의 searchMemories에서 동적 가중치 사용**

`src/lib/memory/memory-manager.ts`의 `searchMemories` 수정:

```ts
import { getMemoryWeight } from './structured-memory';
import type { MemoryCategoryConfig } from '@/types/settings';

// constructor에 선택적 파라미터 추가
constructor(
  private ollamaUrl: string,
  private embeddingModel: string,
  private memoryCategories?: Record<string, MemoryCategoryConfig>
) {}

// searchMemories에서 가중치 참조 변경
const weight = getMemoryWeight(category, this.memoryCategories);
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/memory/__tests__/structured-memory.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/memory/structured-memory.ts src/lib/memory/memory-manager.ts src/lib/memory/__tests__/structured-memory.test.ts
git commit -m "feat: structured-memory에 동적 가중치/만료 지원 추가"
```

---

## Chunk 2: API 레이어

### Task 4: GET /api/memory 목록 조회 확장

**Files:**
- Modify: `src/app/api/memory/route.ts`
- Test: `src/app/api/memory/__tests__/route.test.ts`

- [ ] **Step 1: mock 확장 + 기존 테스트 수정 + 새 테스트 작성**

`src/app/api/memory/__tests__/route.test.ts` 상단의 mock에 `getMemoryList` 추가:

```ts
vi.mock('@/lib/memory/vector-store', () => ({
  getMemoryCount: vi.fn(),
  getMemoryList: vi.fn(),
  purgeExpiredMemories: vi.fn(),
}));
```

import와 mock 변수 추가:

```ts
import { getMemoryCount, getMemoryList, purgeExpiredMemories } from '@/lib/memory/vector-store';

const mockGetMemoryCount = vi.mocked(getMemoryCount);
const mockGetMemoryList = vi.mocked(getMemoryList);
const mockPurgeExpired = vi.mocked(purgeExpiredMemories);
```

**기존 GET 테스트 2곳 수정** — `GET()`는 이제 `Request` 파라미터를 받으므로 기존 테스트 업데이트:

```ts
// "returns memory count" 테스트 (line 22-23):
// 변경 전: const res = await GET();
// 변경 후:
const res = await GET(new Request('http://localhost/api/memory'));

// "returns 500 on error" 테스트 (line 30-31):
// 변경 전: const res = await GET();
// 변경 후:
const res = await GET(new Request('http://localhost/api/memory'));
```

에러 메시지 assertion도 수정 (line 37):

```ts
// 변경 전: expect(json.error).toBe('Failed to get memory count');
// 변경 후:
expect(json.error).toBe('Failed to get memories');
```

새 테스트 추가:

```ts
describe('GET /api/memory?list=true', () => {
  it('list=true이면 페이지네이션된 메모리 목록을 반환한다', async () => {
    mockGetMemoryList.mockResolvedValue({
      items: [], total: 0, page: 1, limit: 20,
    } as never);

    const req = new Request('http://localhost/api/memory?list=true&page=1&limit=20');
    const res = await GET(req);
    const data = await res.json();

    expect(mockGetMemoryList).toHaveBeenCalledWith({ page: 1, limit: 20, category: undefined });
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('page');
  });

  it('category 파라미터로 필터링한다', async () => {
    mockGetMemoryList.mockResolvedValue({
      items: [], total: 0, page: 1, limit: 20,
    } as never);

    const req = new Request('http://localhost/api/memory?list=true&category=technical');
    const res = await GET(req);

    expect(mockGetMemoryList).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'technical' })
    );
  });

  it('list 파라미터 없으면 기존 count만 반환한다', async () => {
    mockGetMemoryCount.mockResolvedValue(42 as never);

    const req = new Request('http://localhost/api/memory');
    const res = await GET(req);
    const data = await res.json();

    expect(data).toHaveProperty('count');
    expect(data).not.toHaveProperty('items');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/app/api/memory/__tests__/route.test.ts`
Expected: FAIL (GET 시그니처 변경 전이므로)

- [ ] **Step 3: GET 핸들러 확장**

`src/app/api/memory/route.ts` 수정:

```ts
import { NextResponse } from 'next/server';
import { getMemoryCount, getMemoryList, purgeExpiredMemories } from '@/lib/memory/vector-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const list = searchParams.get('list');

    if (list === 'true') {
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '20');
      const category = searchParams.get('category') || undefined;

      const result = await getMemoryList({ page, limit, category });
      return NextResponse.json(result);
    }

    const count = await getMemoryCount();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ error: 'Failed to get memories' }, { status: 500 });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/app/api/memory/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/memory/route.ts src/app/api/memory/__tests__/route.test.ts
git commit -m "feat: GET /api/memory에 목록 조회 페이지네이션 추가"
```

---

### Task 5: POST /api/memory 수동 추가

**Files:**
- Modify: `src/app/api/memory/route.ts`
- Modify: `src/lib/memory/memory-manager.ts`
- Test: `src/app/api/memory/__tests__/route.test.ts`

- [ ] **Step 1: mock 추가 + 실패하는 테스트 작성**

`src/app/api/memory/__tests__/route.test.ts`에 `loadSettings`와 `MemoryManager` mock 추가:

```ts
vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    ollamaUrl: 'http://localhost:11434',
    embeddingModel: 'test-model',
    memoryCategories: {},
  }),
}));

const mockSaveManualMemory = vi.fn().mockResolvedValue('new-memory-id');
const mockSaveFromUrl = vi.fn().mockResolvedValue('url-memory-id');
vi.mock('@/lib/memory/memory-manager', () => ({
  MemoryManager: vi.fn().mockImplementation(() => ({
    saveManualMemory: mockSaveManualMemory,
    saveFromUrl: mockSaveFromUrl,
  })),
}));
```

import에 `POST` 추가:

```ts
import { GET, POST, DELETE } from '../route';
```

테스트 추가:

```ts
describe('POST /api/memory', () => {
  it('텍스트 타입으로 메모리를 추가한다', async () => {
    const req = new Request('http://localhost/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'text',
        content: '테스트 메모리 내용',
        category: 'technical',
      }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('id');
    expect(mockSaveManualMemory).toHaveBeenCalledWith('테스트 메모리 내용', 'technical');
  });

  it('content가 비어있으면 400을 반환한다', async () => {
    const req = new Request('http://localhost/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', content: '', category: 'general' }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it('URL 타입이면 saveFromUrl을 호출한다', async () => {
    const req = new Request('http://localhost/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'url',
        content: 'https://example.com',
        category: 'research',
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockSaveFromUrl).toHaveBeenCalledWith('https://example.com', 'research');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/app/api/memory/__tests__/route.test.ts`
Expected: FAIL — `POST is not a function`

- [ ] **Step 3: memory-manager에 수동 추가 메서드 구현**

`src/lib/memory/memory-manager.ts`에 추가:

```ts
async saveManualMemory(
  text: string,
  category: MemoryCategory
): Promise<string> {
  const scrubbed = scrubMemoryText(text);
  return this.saveMemory(scrubbed, { type: 'manual', category });
}

async saveFromUrl(
  url: string,
  category: MemoryCategory
): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`URL fetch failed: ${res.status}`);
  const html = await res.text();
  // HTML에서 텍스트 추출 (간단한 태그 제거)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
  return this.saveManualMemory(text, category);
}
```

- [ ] **Step 4: POST 핸들러 구현**

`src/app/api/memory/route.ts`에 추가:

```ts
import { loadSettings } from '@/lib/config/settings';
import { MemoryManager } from '@/lib/memory/memory-manager';
import type { MemoryCategory } from '@/lib/memory/structured-memory';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    const settings = await loadSettings();
    const manager = new MemoryManager(
      settings.ollamaUrl,
      settings.embeddingModel,
      settings.memoryCategories
    );

    if (contentType.includes('multipart/form-data')) {
      // 파일 업로드 처리
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const category = (formData.get('category') as string) || 'general';

      if (!file) {
        return NextResponse.json({ error: 'file is required' }, { status: 400 });
      }

      const text = await file.text();
      if (!text.trim()) {
        return NextResponse.json({ error: 'File is empty' }, { status: 400 });
      }

      const id = await manager.saveManualMemory(text.slice(0, 5000), category as MemoryCategory);
      return NextResponse.json({ id });
    }

    const body = await request.json();
    const { type, content, category = 'general' } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    let id: string;
    if (type === 'url') {
      id = await manager.saveFromUrl(content, category);
    } else {
      id = await manager.saveManualMemory(content, category);
    }

    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save memory' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/app/api/memory/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/memory/route.ts src/lib/memory/memory-manager.ts src/app/api/memory/__tests__/route.test.ts
git commit -m "feat: POST /api/memory 수동 메모리 추가 (텍스트/파일/URL)"
```

---

### Task 6: DELETE /api/memory/[id] 개별 삭제

**Files:**
- Create: `src/app/api/memory/[id]/route.ts`
- Test: `src/app/api/memory/__tests__/memory-id.test.ts` (새 파일)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/memory/__tests__/memory-id.test.ts` 생성:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/vector-store', () => ({
  deleteVector: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE } from '../[id]/route';

describe('DELETE /api/memory/[id]', () => {
  it('유효한 id로 메모리를 삭제한다', async () => {
    const req = new Request('http://localhost/api/memory/test-id', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'test-id' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe('test-id');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/app/api/memory/__tests__/memory-id.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 개별 삭제 라우트 구현**

`src/app/api/memory/[id]/route.ts` 생성:

```ts
import { NextResponse } from 'next/server';
import { deleteVector } from '@/lib/memory/vector-store';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteVector(id);
    return NextResponse.json({ deleted: id });
  } catch {
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/app/api/memory/__tests__/memory-id.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/memory/[id]/route.ts src/app/api/memory/__tests__/memory-id.test.ts
git commit -m "feat: DELETE /api/memory/[id] 개별 메모리 삭제"
```

---

### Task 7: DELETE /api/memory/bulk 일괄 삭제

**Files:**
- Create: `src/app/api/memory/bulk/route.ts`
- Test: `src/app/api/memory/__tests__/memory-bulk.test.ts` (새 파일)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/api/memory/__tests__/memory-bulk.test.ts` 생성:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/vector-store', () => ({
  deleteVector: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE } from '../bulk/route';
import { deleteVector } from '@/lib/memory/vector-store';

describe('DELETE /api/memory/bulk', () => {
  it('여러 id를 일괄 삭제한다', async () => {
    const req = new Request('http://localhost/api/memory/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['id-1', 'id-2', 'id-3'] }),
    });
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(3);
    expect(deleteVector).toHaveBeenCalledTimes(3);
  });

  it('ids가 비어있으면 400을 반환한다', async () => {
    const req = new Request('http://localhost/api/memory/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });
    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/app/api/memory/__tests__/memory-bulk.test.ts`
Expected: FAIL

- [ ] **Step 3: 일괄 삭제 라우트 구현**

`src/app/api/memory/bulk/route.ts` 생성:

```ts
import { NextResponse } from 'next/server';
import { deleteVector } from '@/lib/memory/vector-store';

export async function DELETE(request: Request) {
  try {
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    let deleted = 0;
    for (const id of ids) {
      await deleteVector(id);
      deleted++;
    }

    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: 'Failed to bulk delete' }, { status: 500 });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/app/api/memory/__tests__/memory-bulk.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/memory/bulk/route.ts src/app/api/memory/__tests__/memory-bulk.test.ts
git commit -m "feat: DELETE /api/memory/bulk 일괄 삭제"
```

---

## Chunk 3: UI 컴포넌트

### Task 8: SettingsPanel에 메모리 탭 등록

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

- [ ] **Step 1: SETTING_TABS에 메모리 탭 추가**

`src/components/settings/SettingsPanel.tsx` 수정:

import 추가:
```ts
import MemoryTab from './tabs/MemoryTab';
```

SETTING_TABS 배열에 추가:
```ts
{ id: 'memory', label: '메모리', icon: '🧠' },
```

renderContent switch에 case 추가:
```ts
case 'memory':
  return <MemoryTab draft={draft} onDraftChange={handleDraftChange} />;
```

- [ ] **Step 2: 커밋** (MemoryTab 파일이 아직 없으므로 Task 9 완료 후 함께 커밋)

---

### Task 9: MemoryTab 컴포넌트 구현 — 임베딩 모델 선택 + 카테고리 정책

**Files:**
- Create: `src/components/settings/tabs/MemoryTab.tsx`

- [ ] **Step 1: MemoryTab 기본 구조 + 임베딩 모델 선택기 구현**

`src/components/settings/tabs/MemoryTab.tsx` 생성. 핵심 구조:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, MemoryCategoryConfig } from '@/types/settings';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface MemoryTabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
}

const HELP = {
  embeddingModel: 'RAG 메모리 검색에 사용할 임베딩 모델입니다.',
  categoryPolicy: '카테고리별 검색 가중치와 메모리 만료 기간을 설정합니다.',
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: '기술',
  research: '리서치',
  preference: '선호',
  general: '일반',
};

const selectClass = 'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';

export default function MemoryTab({ draft, onDraftChange }: MemoryTabProps) {
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const fetchModels = useCallback(() => {
    setLoadingModels(true);
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const categories = draft.memoryCategories || {};

  const handleCategoryChange = (
    key: string,
    field: keyof MemoryCategoryConfig,
    value: number
  ) => {
    onDraftChange({
      memoryCategories: {
        ...categories,
        [key]: { ...categories[key], [field]: value },
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* 임베딩 모델 선택 */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium">임베딩 모델</label>
          <HelpTooltip text={HELP.embeddingModel} />
        </div>
        {loadingModels ? (
          <div className="text-sm text-muted py-1.5">Loading models...</div>
        ) : models.length > 0 ? (
          <div className="relative">
            <select
              value={draft.embeddingModel || ''}
              onChange={(e) => onDraftChange({ embeddingModel: e.target.value })}
              className={selectClass}
            >
              {!models.includes(draft.embeddingModel || '') && draft.embeddingModel && (
                <option value={draft.embeddingModel}>{draft.embeddingModel}</option>
              )}
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4.5L6 7.5L9 4.5"/></svg>
            </div>
          </div>
        ) : (
          <input
            value={draft.embeddingModel || ''}
            onChange={(e) => onDraftChange({ embeddingModel: e.target.value })}
            className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            placeholder="e.g. qwen3-embedding:8b"
          />
        )}
      </section>

      <hr className="border-border" />

      {/* 카테고리 정책 설정 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm font-medium">카테고리 정책</label>
          <HelpTooltip text={HELP.categoryPolicy} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="pb-2 pr-4">카테고리</th>
                <th className="pb-2 pr-4">가중치</th>
                <th className="pb-2">만료 (일)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(categories).map(([key, config]) => (
                <tr key={key} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium">{CATEGORY_LABELS[key] || key}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0.1}
                      max={3.0}
                      step={0.1}
                      value={config.weight}
                      onChange={(e) => handleCategoryChange(key, 'weight', parseFloat(e.target.value) || 1.0)}
                      className="w-20 bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={config.maxAgeDays}
                      onChange={(e) => handleCategoryChange(key, 'maxAgeDays', parseInt(e.target.value) || 30)}
                      className="w-20 bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-border" />

      {/* Task 10에서 메모리 테이블 추가 */}
      {/* Task 11에서 수동 추가 폼 추가 */}
    </div>
  );
}
```

- [ ] **Step 2: 개발 서버에서 확인**

Run: `pnpm dev`
설정 > 메모리 탭에서 임베딩 모델 드롭다운, 카테고리 정책 테이블이 표시되는지 확인.

- [ ] **Step 3: 커밋 (Task 8과 함께)**

```bash
git add src/components/settings/SettingsPanel.tsx src/components/settings/tabs/MemoryTab.tsx
git commit -m "feat: 설정에 메모리 탭 추가 — 임베딩 모델 선택 + 카테고리 정책"
```

---

### Task 10: MemoryTab — 메모리 테이블 (통계 + 검색/필터/정렬/페이지네이션/삭제)

**Files:**
- Modify: `src/components/settings/tabs/MemoryTab.tsx`

- [ ] **Step 1: 메모리 조회 상태 + fetch 로직 추가**

MemoryTab에 상태 추가:

```tsx
interface MemoryItem {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

// 상태
const [memories, setMemories] = useState<MemoryItem[]>([]);
const [totalCount, setTotalCount] = useState(0);
const [currentPage, setCurrentPage] = useState(1);
const [filterCategory, setFilterCategory] = useState<string>('');
const [searchQuery, setSearchQuery] = useState('');
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [expandedId, setExpandedId] = useState<string | null>(null);
const [loadingMemories, setLoadingMemories] = useState(false);
const [sortAsc, setSortAsc] = useState(false);
const ITEMS_PER_PAGE = 20;

const fetchMemories = useCallback(async () => {
  setLoadingMemories(true);
  try {
    const params = new URLSearchParams({
      list: 'true',
      page: currentPage.toString(),
      limit: ITEMS_PER_PAGE.toString(),
    });
    if (filterCategory) params.set('category', filterCategory);
    const res = await fetch(`/api/memory?${params}`);
    const data = await res.json();
    setMemories(data.items || []);
    setTotalCount(data.total || 0);
  } catch {
    setMemories([]);
  } finally {
    setLoadingMemories(false);
  }
}, [currentPage, filterCategory]);

useEffect(() => { fetchMemories(); }, [fetchMemories]);
```

- [ ] **Step 2: 통계 표시 영역 구현**

```tsx
{/* 통계 */}
<div className="text-xs text-muted mb-3">
  총 {totalCount}개
  {memories.length > 0 && (() => {
    const counts: Record<string, number> = {};
    memories.forEach((m) => {
      const cat = (m.metadata?.category as string) || 'general';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return ' — ' + Object.entries(counts)
      .map(([k, v]) => `${CATEGORY_LABELS[k] || k} ${v}`)
      .join(' · ');
  })()}
</div>
```

- [ ] **Step 3: 검색바 + 필터 + 정렬 컨트롤 구현**

```tsx
<div className="flex gap-2 mb-3">
  <input
    type="text"
    placeholder="검색..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
  />
  <select
    value={filterCategory}
    onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
    className="bg-card border border-border rounded-lg px-2 py-1.5 text-sm"
  >
    <option value="">전체</option>
    <option value="technical">기술</option>
    <option value="research">리서치</option>
    <option value="preference">선호</option>
    <option value="general">일반</option>
  </select>
  <button
    onClick={() => setSortAsc(!sortAsc)}
    className="px-2 py-1.5 bg-card border border-border rounded-lg text-sm hover:bg-card-hover"
    title={sortAsc ? '오래된순' : '최신순'}
  >
    {sortAsc ? '↑' : '↓'}
  </button>
</div>
```

- [ ] **Step 4: 테이블 본체 구현**

```tsx
const displayed = memories
  .filter((m) => !searchQuery || m.text.toLowerCase().includes(searchQuery.toLowerCase()))
  .sort((a, b) => sortAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);

const allSelected = displayed.length > 0 && displayed.every((m) => selectedIds.has(m.id));

// 테이블 렌더링
<div className="overflow-x-auto border border-border rounded-lg">
  <table className="w-full text-sm">
    <thead>
      <tr className="text-left text-muted bg-card/50 border-b border-border">
        <th className="p-2 w-8">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedIds(new Set(displayed.map((m) => m.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
            className="accent-accent"
          />
        </th>
        <th className="p-2">내용</th>
        <th className="p-2 w-20">카테고리</th>
        <th className="p-2 w-28">생성일</th>
        <th className="p-2 w-12"></th>
      </tr>
    </thead>
    <tbody>
      {displayed.map((m) => (
        <>
          <tr
            key={m.id}
            className="border-b border-border/50 hover:bg-card/30 cursor-pointer"
            onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
          >
            <td className="p-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedIds.has(m.id)}
                onChange={(e) => {
                  const next = new Set(selectedIds);
                  e.target.checked ? next.add(m.id) : next.delete(m.id);
                  setSelectedIds(next);
                }}
                className="accent-accent"
              />
            </td>
            <td className="p-2 truncate max-w-xs">{m.text.slice(0, 50)}</td>
            <td className="p-2">
              <span className="px-1.5 py-0.5 rounded text-xs bg-accent/10 text-accent">
                {CATEGORY_LABELS[(m.metadata?.category as string) || 'general'] || 'general'}
              </span>
            </td>
            <td className="p-2 text-muted text-xs">
              {new Date(m.createdAt).toLocaleDateString('ko-KR')}
            </td>
            <td className="p-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteOne(m.id); }}
                className="text-error hover:text-red-400 text-xs"
              >✕</button>
            </td>
          </tr>
          {expandedId === m.id && (
            <tr key={`${m.id}-expand`}>
              <td colSpan={5} className="p-3 bg-card/20 text-xs whitespace-pre-wrap">
                {m.text}
              </td>
            </tr>
          )}
        </>
      ))}
      {displayed.length === 0 && (
        <tr>
          <td colSpan={5} className="p-4 text-center text-muted">
            {loadingMemories ? '로딩 중...' : '메모리가 없습니다.'}
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>
```

- [ ] **Step 5: 일괄 삭제 버튼 + 개별 삭제 핸들러**

```tsx
const handleDeleteOne = async (id: string) => {
  await fetch(`/api/memory/${id}`, { method: 'DELETE' });
  fetchMemories();
  selectedIds.delete(id);
  setSelectedIds(new Set(selectedIds));
};

const handleBulkDelete = async () => {
  if (selectedIds.size === 0) return;
  await fetch('/api/memory/bulk', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: Array.from(selectedIds) }),
  });
  setSelectedIds(new Set());
  fetchMemories();
};

// 일괄 삭제 버튼 (테이블 위에 조건부 표시)
{selectedIds.size > 0 && (
  <button
    onClick={handleBulkDelete}
    className="mb-2 px-3 py-1 text-xs bg-error/10 text-error rounded-lg hover:bg-error/20"
  >
    선택 삭제 ({selectedIds.size}개)
  </button>
)}
```

- [ ] **Step 6: 페이지네이션 컨트롤**

```tsx
const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

{totalPages > 1 && (
  <div className="flex items-center justify-center gap-2 mt-3">
    <button
      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
      disabled={currentPage === 1}
      className="px-2 py-1 text-xs bg-card border border-border rounded disabled:opacity-30"
    >이전</button>
    <span className="text-xs text-muted">{currentPage} / {totalPages}</span>
    <button
      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
      disabled={currentPage === totalPages}
      className="px-2 py-1 text-xs bg-card border border-border rounded disabled:opacity-30"
    >다음</button>
  </div>
)}
```

- [ ] **Step 7: 개발 서버에서 확인**

Run: `pnpm dev`
메모리 탭에서 테이블, 검색, 필터, 정렬, 페이지네이션, 삭제가 동작하는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/components/settings/tabs/MemoryTab.tsx
git commit -m "feat: MemoryTab에 메모리 테이블 추가 — 검색/필터/정렬/삭제/페이지네이션"
```

---

### Task 11: MemoryTab — 수동 추가 폼 (텍스트/파일/URL)

**Files:**
- Modify: `src/components/settings/tabs/MemoryTab.tsx`

- [ ] **Step 1: 수동 추가 상태 추가**

```tsx
const [addMode, setAddMode] = useState<'text' | 'file' | 'url'>('text');
const [addContent, setAddContent] = useState('');
const [addCategory, setAddCategory] = useState('general');
const [addFile, setAddFile] = useState<File | null>(null);
const [adding, setAdding] = useState(false);
```

- [ ] **Step 2: 탭 전환 UI + 공통 카테고리 선택 구현**

```tsx
<section>
  <label className="text-sm font-medium mb-3 block">메모리 추가</label>

  {/* 탭 전환 */}
  <div className="flex gap-1 mb-3">
    {(['text', 'file', 'url'] as const).map((mode) => (
      <button
        key={mode}
        onClick={() => { setAddMode(mode); setAddContent(''); setAddFile(null); }}
        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
          addMode === mode
            ? 'bg-accent/10 text-accent font-medium'
            : 'text-muted hover:text-foreground hover:bg-card'
        }`}
      >
        {{ text: '텍스트', file: '파일', url: 'URL' }[mode]}
      </button>
    ))}
  </div>

  {/* 입력 영역 (모드별) */}
  {addMode === 'text' && (
    <textarea
      value={addContent}
      onChange={(e) => setAddContent(e.target.value)}
      placeholder="메모리에 저장할 내용을 입력하세요..."
      rows={4}
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none mb-2"
    />
  )}
  {addMode === 'file' && (
    <div className="mb-2">
      <input
        type="file"
        accept=".txt,.md,.pdf"
        onChange={(e) => setAddFile(e.target.files?.[0] || null)}
        className="text-sm text-muted"
      />
      {addFile && <p className="text-xs text-muted mt-1">{addFile.name}</p>}
    </div>
  )}
  {addMode === 'url' && (
    <input
      type="url"
      value={addContent}
      onChange={(e) => setAddContent(e.target.value)}
      placeholder="https://..."
      className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent mb-2"
    />
  )}

  {/* 카테고리 + 저장 버튼 */}
  <div className="flex gap-2">
    <select
      value={addCategory}
      onChange={(e) => setAddCategory(e.target.value)}
      className="bg-card border border-border rounded-lg px-2 py-1.5 text-sm"
    >
      <option value="technical">기술</option>
      <option value="research">리서치</option>
      <option value="preference">선호</option>
      <option value="general">일반</option>
    </select>
    <button
      onClick={handleAdd}
      disabled={adding}
      className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
    >
      {adding ? '저장 중...' : '추가'}
    </button>
  </div>
</section>
```

- [ ] **Step 3: handleAdd 함수 구현**

```tsx
const handleAdd = async () => {
  setAdding(true);
  try {
    if (addMode === 'file' && addFile) {
      const formData = new FormData();
      formData.append('file', addFile);
      formData.append('category', addCategory);
      await fetch('/api/memory', { method: 'POST', body: formData });
    } else if (addMode === 'url' && addContent.trim()) {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', content: addContent, category: addCategory }),
      });
    } else if (addMode === 'text' && addContent.trim()) {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', content: addContent, category: addCategory }),
      });
    }
    setAddContent('');
    setAddFile(null);
    fetchMemories();
  } catch {
    // 에러는 무시 (향후 toast 연동 가능)
  } finally {
    setAdding(false);
  }
};
```

- [ ] **Step 4: 개발 서버에서 확인**

Run: `pnpm dev`
메모리 탭에서 텍스트/파일/URL 각 모드로 메모리 추가가 동작하는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/components/settings/tabs/MemoryTab.tsx
git commit -m "feat: MemoryTab에 수동 추가 폼 — 텍스트/파일/URL"
```

---

## Chunk 4: 통합 + chat route 연동

### Task 12: chat route에서 memoryCategories를 MemoryManager에 전달

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: MemoryManager 생성자에 memoryCategories 전달**

`src/app/api/chat/route.ts`에서 MemoryManager 생성 부분을 찾아 수정:

```ts
const memoryManager = new MemoryManager(
  settings.ollamaUrl,
  settings.embeddingModel,
  settings.memoryCategories
);
```

- [ ] **Step 2: 빌드 확인**

Run: `pnpm build`
Expected: 빌드 성공

- [ ] **Step 3: 전체 테스트 실행**

Run: `pnpm test:unit`
Expected: 모든 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: chat route에서 Settings 기반 memoryCategories 전달"
```

---

### Task 13: 최종 통합 확인 + lint

- [ ] **Step 1: lint 실행**

Run: `pnpm lint`
Expected: 에러 없음

- [ ] **Step 2: 전체 테스트 실행**

Run: `pnpm test:run`
Expected: 모든 테스트 PASS

- [ ] **Step 3: 개발 서버에서 E2E 수동 확인**

확인 항목:
1. 설정 > 메모리 탭 진입
2. 임베딩 모델 드롭다운에서 모델 선택 → 저장
3. 카테고리 가중치/만료일 변경 → 저장
4. 메모리 테이블에 기존 메모리 표시
5. 검색, 카테고리 필터, 정렬 동작
6. 행 클릭 → 전체 내용 expand
7. 개별 삭제, 일괄 삭제
8. 텍스트 입력으로 메모리 추가
9. 파일 업로드로 메모리 추가
10. URL로 메모리 추가
11. 채팅에서 RAG가 정상 동작 (메모리 검색 + 가중치 적용)

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "feat: RAG 메모리 관리 인터페이스 완성"
```
