# 지식 베이스 (Knowledge Base) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 디자인 문서(docx, xlsx, pptx)와 코드를 임베딩하여 채팅 시 자동 검색 + 출처 인용하는 지식 베이스 시스템 구축

**Architecture:** VectorEngine 공통 엔진 추출 → 기존 memory 래퍼 유지 + knowledge namespace 추가. KnowledgeManager가 DocumentParser/ChunkStrategy를 사용하여 문서 파싱→청킹→임베딩. 사이드바에 컬렉션/문서 관리 UI, 채팅에 출처 뱃지 표시.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, mammoth (docx), exceljs (xlsx), jszip (pptx), vitest

**Spec:** `docs/superpowers/specs/2026-03-11-knowledge-base-design.md`

---

## Chunk 1: 핵심 엔진 (VectorEngine + 타입 + 리팩토링)

### Task 1: 지식 베이스 타입 정의

**Files:**
- Create: `src/types/knowledge.ts`

- [ ] **Step 1: 타입 파일 생성**

```ts
// src/types/knowledge.ts

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

export interface KnowledgeDocument {
  id: string;
  collectionId: string;
  filename: string;
  format: string;
  fileSize: number;
  chunkCount: number;
  chunkIds: string[];
  createdAt: number;
}

export interface ChunkMetadata {
  documentId: string;
  collectionId: string;
  chunkIndex: number;
  source: string;
  filename: string;
}

export interface SearchResultWithSource {
  text: string;
  similarity: number;
  source: string;
  filename: string;
  documentId: string;
  collectionId: string;
}

export interface KnowledgeSearchEvent {
  sources: SearchResultWithSource[];
}
```

- [ ] **Step 2: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음 (새 파일이므로 임포트하는 곳이 아직 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/types/knowledge.ts
git commit -m "feat: 지식 베이스 타입 정의 추가"
```

---

### Task 2: VectorEngine 클래스 구현

**Files:**
- Create: `src/lib/storage/vector-engine.ts`
- Create: `src/lib/storage/__tests__/vector-engine.test.ts`

**참고 파일:**
- `src/lib/memory/vector-store.ts` — 기존 벡터 스토어 (이 코드를 클래스로 추출)
- `src/lib/storage/atomic-write.ts` — `atomicWriteJSON`, `safeReadJSON`
- `src/lib/storage/file-lock.ts` — `withFileLock`
- `src/lib/memory/embedder.ts` — `cosineSimilarity`

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/storage/__tests__/vector-engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFs = {
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
};

vi.mock('fs/promises', () => ({
  default: mockFs,
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-vec-id'),
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

const mockAtomicWriteJSON = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: (...args: unknown[]) => mockAtomicWriteJSON(...args),
}));

vi.mock('@/lib/storage/file-lock', () => ({
  withFileLock: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('VectorEngine', () => {
  let VectorEngine: typeof import('../vector-engine').VectorEngine;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFs.readFile.mockRejectedValue(new Error('not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const mod = await import('../vector-engine');
    VectorEngine = mod.VectorEngine;
  });

  it('namespace에 따라 다른 디렉토리를 사용한다', () => {
    const engine = new VectorEngine('knowledge');
    expect(engine.namespace).toBe('knowledge');
  });

  it('addVector: 벡터 파일과 인덱스를 저장한다', async () => {
    const engine = new VectorEngine('knowledge');
    const id = await engine.addVector('test text', [0.1, 0.2], { key: 'val' });

    expect(id).toBe('test-vec-id');
    expect(mockAtomicWriteJSON).toHaveBeenCalledTimes(2);
    // 벡터 파일 경로에 knowledge 포함
    expect(mockAtomicWriteJSON.mock.calls[0][0]).toContain('knowledge');
    expect(mockAtomicWriteJSON.mock.calls[0][0]).toContain('test-vec-id.json');
  });

  it('searchVectors: threshold 이상의 결과를 반환한다', async () => {
    const engine = new VectorEngine('knowledge');
    const index = [
      { id: 'v1', text: 'match', createdAt: 1000 },
      { id: 'v2', text: 'no match', createdAt: 2000 },
    ];
    mockFs.readFile
      .mockResolvedValueOnce(JSON.stringify(index))
      .mockResolvedValueOnce(JSON.stringify({ id: 'v1', text: 'match', vector: [1, 0], createdAt: 1000 }))
      .mockResolvedValueOnce(JSON.stringify({ id: 'v2', text: 'no match', vector: [0, 1], createdAt: 2000 }));

    const results = await engine.searchVectors([1, 0], 5, 0.5);

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('match');
  });

  it('deleteVector: 파일과 인덱스에서 제거한다', async () => {
    const engine = new VectorEngine('knowledge');
    const index = [
      { id: 'v1', text: 'a', createdAt: 1000 },
      { id: 'v2', text: 'b', createdAt: 2000 },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    await engine.deleteVector('v1');

    expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('v1.json'));
  });

  it('getVectorCount: 인덱스 길이를 반환한다', async () => {
    const engine = new VectorEngine('knowledge');
    const index = [{ id: 'v1', text: 'a', createdAt: 1000 }];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    expect(await engine.getVectorCount()).toBe(1);
  });

  it('listVectors: 페이지네이션된 목록을 반환한다', async () => {
    const engine = new VectorEngine('knowledge');
    const index = [
      { id: 'v1', text: 'a', createdAt: 3000 },
      { id: 'v2', text: 'b', createdAt: 2000 },
      { id: 'v3', text: 'c', createdAt: 1000 },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const result = await engine.listVectors({ page: 1, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
    // 최신순
    expect(result.items[0].id).toBe('v1');
  });

  it('purgeExpired: 만료된 벡터를 삭제한다', async () => {
    const engine = new VectorEngine('knowledge');
    const now = Date.now();
    const old = now - 31 * 24 * 60 * 60 * 1000;
    const index = [
      { id: 'v1', text: 'old', createdAt: old },
      { id: 'v2', text: 'new', createdAt: now },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const count = await engine.purgeExpired(30, 1000);

    expect(count).toBe(1);
    expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('v1.json'));
  });

  it('서로 다른 namespace의 엔진은 서로 영향을 주지 않는다', () => {
    const memoryEngine = new VectorEngine('memory');
    const knowledgeEngine = new VectorEngine('knowledge');
    // 경로가 다르므로 독립적
    expect(memoryEngine.namespace).not.toBe(knowledgeEngine.namespace);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/storage/__tests__/vector-engine.test.ts 2>&1 | tail -10`
Expected: FAIL — `vector-engine` 모듈 없음

- [ ] **Step 3: VectorEngine 구현**

```ts
// src/lib/storage/vector-engine.ts
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { cosineSimilarity } from '@/lib/memory/embedder';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { logger } from '@/lib/logger';

interface VectorEntry {
  id: string;
  text: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface IndexEntry {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

interface ListOptions {
  page: number;
  limit: number;
  category?: string;
}

interface PaginatedResult {
  items: IndexEntry[];
  total: number;
  page: number;
  limit: number;
}

const SEARCH_BATCH_SIZE = 25;

export class VectorEngine {
  readonly namespace: string;
  private readonly baseDir: string;
  private readonly vectorsDir: string;
  private readonly indexFile: string;

  constructor(namespace: string) {
    this.namespace = namespace;
    this.baseDir = path.join(DATA_DIR, namespace);
    this.vectorsDir = path.join(this.baseDir, 'vectors');
    this.indexFile = path.join(this.baseDir, 'index.json');
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.vectorsDir, { recursive: true });
  }

  private async loadIndex(): Promise<IndexEntry[]> {
    try {
      const data = await fs.readFile(this.indexFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async saveIndex(index: IndexEntry[]): Promise<void> {
    await this.ensureDirs();
    await atomicWriteJSON(this.indexFile, index);
  }

  async addVector(
    text: string,
    vector: number[],
    metadata?: Record<string, unknown>
  ): Promise<string> {
    return withFileLock(this.indexFile, async () => {
      await this.ensureDirs();

      const id = uuidv4();
      const entry: VectorEntry = {
        id,
        text,
        vector,
        metadata,
        createdAt: Date.now(),
      };

      await atomicWriteJSON(
        path.join(this.vectorsDir, `${id}.json`),
        entry
      );

      const index = await this.loadIndex();
      index.push({ id, text, metadata, createdAt: entry.createdAt });
      await this.saveIndex(index);

      return id;
    });
  }

  async searchVectors(
    queryVector: number[],
    topK: number = 5,
    threshold: number = 0.3
  ): Promise<{ text: string; similarity: number; metadata?: Record<string, unknown> }[]> {
    await this.ensureDirs();

    const index = await this.loadIndex();
    const results: { text: string; similarity: number; metadata?: Record<string, unknown> }[] = [];

    for (let i = 0; i < index.length; i += SEARCH_BATCH_SIZE) {
      const batch = index.slice(i, i + SEARCH_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (entry) => {
          const data = await fs.readFile(path.join(this.vectorsDir, `${entry.id}.json`), 'utf-8');
          const vectorEntry: VectorEntry = JSON.parse(data);
          const similarity = cosineSimilarity(queryVector, vectorEntry.vector);
          return { text: entry.text, similarity, metadata: entry.metadata };
        })
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value.similarity >= threshold) {
          results.push(r.value);
        }
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  async deleteVector(id: string): Promise<void> {
    return withFileLock(this.indexFile, async () => {
      try {
        await fs.unlink(path.join(this.vectorsDir, `${id}.json`));
      } catch (err) {
        logger.warn('VECTOR_ENGINE', `Vector file not found: ${id}`, err);
      }
      const index = await this.loadIndex();
      const filtered = index.filter((e) => e.id !== id);
      await this.saveIndex(filtered);
    });
  }

  async getVectorCount(): Promise<number> {
    const index = await this.loadIndex();
    return index.length;
  }

  async listVectors(options: ListOptions): Promise<PaginatedResult> {
    const { page, limit, category } = options;
    const index = await this.loadIndex();

    let filtered = index;
    if (category) {
      filtered = index.filter((e) => e.metadata?.category === category);
    }

    filtered.sort((a, b) => b.createdAt - a.createdAt);

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return { items, total, page, limit };
  }

  async purgeExpired(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
    return withFileLock(this.indexFile, async () => {
      const index = await this.loadIndex();
      const now = Date.now();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

      const valid = index.filter((e) => (now - e.createdAt) < maxAgeMs);
      valid.sort((a, b) => b.createdAt - a.createdAt);
      const toKeep = valid.slice(0, maxCount);
      const toKeepIds = new Set(toKeep.map((k) => k.id));
      const toDelete = index.filter((e) => !toKeepIds.has(e.id));

      for (const entry of toDelete) {
        try {
          await fs.unlink(path.join(this.vectorsDir, `${entry.id}.json`));
        } catch (err) {
          logger.warn('VECTOR_ENGINE', `Failed to delete: ${entry.id}`, err);
        }
      }

      if (toDelete.length > 0) {
        await this.saveIndex(toKeep);
      }

      return toDelete.length;
    });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/storage/__tests__/vector-engine.test.ts 2>&1 | tail -15`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/storage/vector-engine.ts src/lib/storage/__tests__/vector-engine.test.ts
git commit -m "feat: VectorEngine 공통 벡터 엔진 클래스 구현"
```

---

### Task 3: vector-store.ts를 VectorEngine 래퍼로 리팩토링

**Files:**
- Modify: `src/lib/memory/vector-store.ts`
- Test: `src/lib/memory/__tests__/vector-store.test.ts` (기존 테스트가 모두 통과해야 함)

**핵심:** 기존 함수형 API 시그니처를 그대로 유지하면서 내부 구현만 `VectorEngine("memory")`로 위임. 기존 테스트 수정 없이 통과해야 한다.

- [ ] **Step 1: vector-store.ts 리팩토링**

기존 파일 전체를 다음으로 교체:

```ts
// src/lib/memory/vector-store.ts
import { VectorEngine, type IndexEntry } from '@/lib/storage/vector-engine';

export type { IndexEntry };

const engine = new VectorEngine('memory');

export async function addVector(
  text: string,
  vector: number[],
  metadata?: Record<string, unknown>
): Promise<string> {
  return engine.addVector(text, vector, metadata);
}

export async function searchVectors(
  queryVector: number[],
  topK: number = 5,
  threshold: number = 0.3
): Promise<{ text: string; similarity: number; metadata?: Record<string, unknown> }[]> {
  return engine.searchVectors(queryVector, topK, threshold);
}

export async function getMemoryCount(): Promise<number> {
  return engine.getVectorCount();
}

export async function deleteVector(id: string): Promise<void> {
  return engine.deleteVector(id);
}

export async function purgeExpiredMemories(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
  return engine.purgeExpired(maxAgeDays, maxCount);
}

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
  return engine.listVectors(options);
}
```

- [ ] **Step 2: 기존 vector-store 테스트 실행**

Run: `pnpm vitest run src/lib/memory/__tests__/vector-store.test.ts 2>&1 | tail -20`
Expected: 모든 테스트 PASS

**주의:** 기존 테스트는 `fs/promises`를 직접 mock하고 있으므로, vector-store.ts가 VectorEngine을 통해 간접적으로 fs를 사용해도 mock이 적용되어야 한다. 만약 테스트가 실패하면 vector-engine.ts의 임포트 경로가 테스트 mock과 일치하는지 확인한다.

실패 시 조치: 기존 테스트의 mock 구조가 `vector-engine.ts`를 경유하는 호출을 가로채지 못할 수 있다. 이 경우 기존 테스트에 `vi.mock('@/lib/storage/vector-engine', ...)` mock을 추가하거나, vector-store.ts 테스트를 VectorEngine mock 기반으로 수정한다. 다만 기존 mock 패턴(`fs/promises`, `uuid`, `atomic-write`, `file-lock`)은 모듈 레벨로 동작하므로 VectorEngine 내부 임포트에도 적용될 가능성이 높다.

- [ ] **Step 3: 전체 메모리 관련 테스트 실행**

Run: `pnpm vitest run src/lib/memory/__tests__/ 2>&1 | tail -20`
Expected: 모든 기존 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/lib/memory/vector-store.ts
git commit -m "refactor: vector-store를 VectorEngine 래퍼로 리팩토링"
```

---

## Chunk 2: 문서 파싱 + 청킹

### Task 4: 의존성 설치

**Files:** `package.json`

- [ ] **Step 1: 패키지 설치**

Run: `pnpm add mammoth exceljs jszip`

- [ ] **Step 2: 설치 확인**

Run: `pnpm ls mammoth exceljs jszip`
Expected: 3개 패키지가 모두 나열됨

- [ ] **Step 3: 커밋**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 문서 파싱 의존성 추가 (mammoth, exceljs, jszip)"
```

---

### Task 5: DocumentParser 구현

**Files:**
- Create: `src/lib/knowledge/document-parser.ts`
- Create: `src/lib/knowledge/__tests__/document-parser.test.ts`

**참고:** 각 포맷별 텍스트 추출. 반환 타입은 `{ text: string; source: string }[]` (구조 단위별 배열).

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/knowledge/__tests__/document-parser.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mammoth mock
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({
      value: '# 제목\n\n첫 번째 단락입니다.\n\n## 섹션 1\n\n두 번째 단락입니다.',
    }),
  },
}));

// exceljs mock
vi.mock('exceljs', () => {
  const mockWorksheet = {
    name: 'Sheet1',
    eachRow: vi.fn((cb: (row: { values: (string | number | null)[] }, rowNumber: number) => void) => {
      cb({ values: [null, '이름', '레벨', '공격력'] }, 1);
      cb({ values: [null, '전사', 10, 150] }, 2);
      cb({ values: [null, '마법사', 8, 200] }, 3);
    }),
  };
  return {
    default: {
      Workbook: vi.fn().mockImplementation(() => ({
        xlsx: {
          load: vi.fn().mockResolvedValue(undefined),
        },
        worksheets: [mockWorksheet],
      })),
    },
  };
});

// jszip mock
vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn().mockResolvedValue({
      file: vi.fn().mockImplementation((name: string) => {
        if (name === 'ppt/slides/slide1.xml') {
          return {
            async: vi.fn().mockResolvedValue(
              '<p:sp><a:t>슬라이드 1 텍스트</a:t></p:sp>'
            ),
          };
        }
        if (name === 'ppt/slides/slide2.xml') {
          return {
            async: vi.fn().mockResolvedValue(
              '<p:sp><a:t>슬라이드 2 텍스트</a:t></p:sp>'
            ),
          };
        }
        return null;
      }),
      // ppt/slides/ 디렉토리 내 파일 목록
      filter: vi.fn().mockReturnValue([
        { name: 'ppt/slides/slide1.xml' },
        { name: 'ppt/slides/slide2.xml' },
      ]),
    }),
  },
}));

describe('DocumentParser', () => {
  let parseDocument: typeof import('../document-parser').parseDocument;
  let detectFormat: typeof import('../document-parser').detectFormat;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../document-parser');
    parseDocument = mod.parseDocument;
    detectFormat = mod.detectFormat;
  });

  describe('detectFormat', () => {
    it('.md → markdown', () => expect(detectFormat('readme.md')).toBe('markdown'));
    it('.txt → text', () => expect(detectFormat('note.txt')).toBe('text'));
    it('.ts → code', () => expect(detectFormat('main.ts')).toBe('code'));
    it('.js → code', () => expect(detectFormat('app.js')).toBe('code'));
    it('.py → code', () => expect(detectFormat('script.py')).toBe('code'));
    it('.docx → docx', () => expect(detectFormat('doc.docx')).toBe('docx'));
    it('.xlsx → xlsx', () => expect(detectFormat('sheet.xlsx')).toBe('xlsx'));
    it('.pptx → pptx', () => expect(detectFormat('slides.pptx')).toBe('pptx'));
    it('알 수 없는 확장자 → text', () => expect(detectFormat('file.abc')).toBe('text'));
  });

  describe('parseDocument — markdown', () => {
    it('헤딩 기준으로 섹션을 분리한다', async () => {
      const content = Buffer.from('# 제목\n\n본문 1\n\n## 섹션\n\n본문 2');
      const sections = await parseDocument('doc.md', content);

      expect(sections.length).toBeGreaterThanOrEqual(2);
      expect(sections[0].source).toContain('제목');
    });
  });

  describe('parseDocument — code', () => {
    it('함수/클래스 단위로 분리한다', async () => {
      const code = `function hello() {\n  return 'world';\n}\n\nclass Foo {\n  bar() {}\n}`;
      const content = Buffer.from(code);
      const sections = await parseDocument('main.ts', content);

      expect(sections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parseDocument — docx', () => {
    it('mammoth으로 텍스트를 추출하고 섹션으로 분리한다', async () => {
      const content = Buffer.from('fake docx content');
      const sections = await parseDocument('doc.docx', content);

      expect(sections.length).toBeGreaterThanOrEqual(1);
      expect(sections.some(s => s.text.includes('단락'))).toBe(true);
    });
  });

  describe('parseDocument — xlsx', () => {
    it('시트별로 행 데이터를 텍스트로 추출한다', async () => {
      const content = Buffer.from('fake xlsx content');
      const sections = await parseDocument('data.xlsx', content);

      expect(sections.length).toBeGreaterThanOrEqual(1);
      expect(sections[0].source).toContain('Sheet1');
    });
  });

  describe('parseDocument — pptx', () => {
    it('슬라이드별로 텍스트를 추출한다', async () => {
      const content = Buffer.from('fake pptx content');
      const sections = await parseDocument('slides.pptx', content);

      expect(sections).toHaveLength(2);
      expect(sections[0].source).toContain('슬라이드 1');
      expect(sections[0].text).toContain('슬라이드 1 텍스트');
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/knowledge/__tests__/document-parser.test.ts 2>&1 | tail -10`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: DocumentParser 구현**

```ts
// src/lib/knowledge/document-parser.ts
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export interface ParsedSection {
  text: string;
  source: string;  // "섹션 제목", "Sheet1", "슬라이드 1" 등
}

const FORMAT_MAP: Record<string, string> = {
  '.md': 'markdown',
  '.txt': 'text',
  '.ts': 'code', '.tsx': 'code', '.js': 'code', '.jsx': 'code',
  '.py': 'code', '.java': 'code', '.go': 'code', '.rs': 'code',
  '.c': 'code', '.cpp': 'code', '.h': 'code',
  '.css': 'code', '.html': 'code', '.json': 'code', '.yaml': 'code', '.yml': 'code',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
};

export function detectFormat(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return FORMAT_MAP[ext] || 'text';
}

export async function parseDocument(filename: string, content: Buffer): Promise<ParsedSection[]> {
  const format = detectFormat(filename);

  switch (format) {
    case 'markdown':
    case 'text':
      return parseMarkdownOrText(content.toString('utf-8'), filename);
    case 'code':
      return parseCode(content.toString('utf-8'), filename);
    case 'docx':
      return parseDocx(content);
    case 'xlsx':
      return parseXlsx(content);
    case 'pptx':
      return parsePptx(content);
    default:
      return [{ text: content.toString('utf-8'), source: filename }];
  }
}

function parseMarkdownOrText(text: string, filename: string): ParsedSection[] {
  // 헤딩 기준으로 분할
  const lines = text.split('\n');
  const sections: ParsedSection[] = [];
  let currentTitle = filename;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (currentLines.length > 0) {
        const sectionText = currentLines.join('\n').trim();
        if (sectionText) {
          sections.push({ text: sectionText, source: currentTitle });
        }
      }
      currentTitle = headingMatch[2].trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // 마지막 섹션
  if (currentLines.length > 0) {
    const sectionText = currentLines.join('\n').trim();
    if (sectionText) {
      sections.push({ text: sectionText, source: currentTitle });
    }
  }

  return sections.length > 0 ? sections : [{ text: text.trim(), source: filename }];
}

function parseCode(text: string, filename: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  // 함수/클래스 선언 패턴 매칭
  const patterns = [
    /^(?:export\s+)?(?:async\s+)?function\s+\w+/m,
    /^(?:export\s+)?class\s+\w+/m,
    /^(?:export\s+)?(?:const|let)\s+\w+\s*=/m,
    /^def\s+\w+/m,           // Python
    /^class\s+\w+/m,          // Python/Java
    /^func\s+\w+/m,           // Go
  ];

  const lines = text.split('\n');
  let currentName = filename;
  let currentLines: string[] = [];

  for (const line of lines) {
    let isDeclaration = false;
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        isDeclaration = true;
        break;
      }
    }

    if (isDeclaration && currentLines.length > 0) {
      const sectionText = currentLines.join('\n').trim();
      if (sectionText) {
        sections.push({ text: sectionText, source: currentName });
      }
      currentName = line.trim().slice(0, 80);
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const sectionText = currentLines.join('\n').trim();
    if (sectionText) {
      sections.push({ text: sectionText, source: currentName });
    }
  }

  return sections.length > 0 ? sections : [{ text, source: filename }];
}

async function parseDocx(content: Buffer): Promise<ParsedSection[]> {
  try {
    const result = await mammoth.extractRawText({ buffer: content });
    return parseMarkdownOrText(result.value, 'docx');
  } catch (err) {
    throw new Error(`DOCX 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function parseXlsx(content: Buffer): Promise<ParsedSection[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(content);

    const sections: ParsedSection[] = [];

    for (const worksheet of workbook.worksheets) {
      const rows: string[] = [];
      worksheet.eachRow((row, _rowNumber) => {
        const values = (row.values as (string | number | null)[])
          .slice(1) // ExcelJS는 인덱스 1부터
          .map((v) => (v != null ? String(v) : ''))
          .join('\t');
        rows.push(values);
      });

      if (rows.length > 0) {
        sections.push({
          text: rows.join('\n'),
          source: worksheet.name,
        });
      }
    }

    return sections;
  } catch (err) {
    throw new Error(`XLSX 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function parsePptx(content: Buffer): Promise<ParsedSection[]> {
  try {
    const zip = await JSZip.loadAsync(content);
    const slideFiles = zip.filter((_relativePath, file) =>
      file.name.match(/^ppt\/slides\/slide\d+\.xml$/) !== null
    );

    // 슬라이드 번호순 정렬
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.name.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.name.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

    const sections: ParsedSection[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const file = zip.file(slideFiles[i].name);
      if (!file) continue;

      const xml = await file.async('text');
      // <a:t> 태그에서 텍스트 추출
      const texts: string[] = [];
      const regex = /<a:t>([^<]*)<\/a:t>/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        if (match[1].trim()) {
          texts.push(match[1].trim());
        }
      }

      if (texts.length > 0) {
        sections.push({
          text: texts.join(' '),
          source: `슬라이드 ${i + 1}`,
        });
      }
    }

    return sections;
  } catch (err) {
    throw new Error(`PPTX 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/knowledge/__tests__/document-parser.test.ts 2>&1 | tail -20`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/knowledge/document-parser.ts src/lib/knowledge/__tests__/document-parser.test.ts
git commit -m "feat: DocumentParser 문서 파싱 모듈 구현 (md/txt/code/docx/xlsx/pptx)"
```

---

### Task 6: ChunkStrategy 구현

**Files:**
- Create: `src/lib/knowledge/chunk-strategy.ts`
- Create: `src/lib/knowledge/__tests__/chunk-strategy.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/knowledge/__tests__/chunk-strategy.test.ts
import { describe, it, expect } from 'vitest';
import { chunkSections } from '../chunk-strategy';
import type { ParsedSection } from '../document-parser';

describe('ChunkStrategy', () => {
  it('적절한 크기의 섹션은 그대로 유지한다', () => {
    const sections: ParsedSection[] = [
      { text: 'a'.repeat(500), source: 'test' },
    ];
    const chunks = chunkSections(sections);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toHaveLength(500);
  });

  it('200자 미만 섹션은 다음 섹션과 병합한다', () => {
    const sections: ParsedSection[] = [
      { text: 'short', source: 'a' },       // 5자
      { text: 'b'.repeat(300), source: 'b' }, // 300자
    ];
    const chunks = chunkSections(sections);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('short');
  });

  it('1000자 초과 섹션은 500자 단위로 재분할한다', () => {
    const sections: ParsedSection[] = [
      { text: 'x'.repeat(1500), source: 'big' },
    ];
    const chunks = chunkSections(sections);

    expect(chunks.length).toBeGreaterThan(1);
    // 각 청크는 1000자 이하
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1000);
    }
  });

  it('500자 재분할 시 100자 오버랩이 적용된다', () => {
    const text = 'abcdefghij'.repeat(150); // 1500자
    const sections: ParsedSection[] = [{ text, source: 'overlap' }];
    const chunks = chunkSections(sections);

    // 두 번째 청크 시작이 첫 번째 청크 끝과 겹침
    if (chunks.length >= 2) {
      const end1 = chunks[0].text.slice(-100);
      const start2 = chunks[1].text.slice(0, 100);
      expect(end1).toBe(start2);
    }
  });

  it('병합 후 1000자 초과 시 재분할한다', () => {
    const sections: ParsedSection[] = [
      { text: 'a'.repeat(100), source: 'small' },   // < 200, 병합 대상
      { text: 'b'.repeat(950), source: 'medium' },   // 병합 후 1050자 → 재분할
    ];
    const chunks = chunkSections(sections);

    // 재분할 되어 모든 청크가 1000자 이하
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1000);
    }
  });

  it('빈 섹션은 무시한다', () => {
    const sections: ParsedSection[] = [
      { text: '', source: 'empty' },
      { text: 'content', source: 'valid' },
    ];
    const chunks = chunkSections(sections);

    expect(chunks.every(c => c.text.trim().length > 0)).toBe(true);
  });

  it('chunkIndex가 순차적으로 부여된다', () => {
    const sections: ParsedSection[] = [
      { text: 'a'.repeat(500), source: 'a' },
      { text: 'b'.repeat(500), source: 'b' },
    ];
    const chunks = chunkSections(sections);

    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/knowledge/__tests__/chunk-strategy.test.ts 2>&1 | tail -10`
Expected: FAIL

- [ ] **Step 3: ChunkStrategy 구현**

```ts
// src/lib/knowledge/chunk-strategy.ts
import type { ParsedSection } from './document-parser';

const MIN_CHUNK_SIZE = 200;
const MAX_CHUNK_SIZE = 1000;
const SPLIT_SIZE = 500;
const OVERLAP_SIZE = 100;
const MAX_NORMALIZE_ROUNDS = 2;

export interface Chunk {
  text: string;
  source: string;
  chunkIndex: number;
}

export function chunkSections(sections: ParsedSection[]): Chunk[] {
  // 빈 섹션 제거
  const nonEmpty = sections.filter((s) => s.text.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  // 1단계: 구조 단위를 리스트로 변환
  let items: { text: string; source: string }[] = nonEmpty.map((s) => ({
    text: s.text,
    source: s.source,
  }));

  // 2단계: 크기 정규화 (최대 MAX_NORMALIZE_ROUNDS 반복)
  for (let round = 0; round < MAX_NORMALIZE_ROUNDS; round++) {
    const normalized = normalizePass(items);
    // 수렴 체크: 변화 없으면 종료
    if (normalized.length === items.length) break;
    items = normalized;
  }

  // 3단계: chunkIndex 부여
  return items.map((item, i) => ({
    text: item.text,
    source: item.source,
    chunkIndex: i,
  }));
}

function normalizePass(items: { text: string; source: string }[]): { text: string; source: string }[] {
  const result: { text: string; source: string }[] = [];

  let i = 0;
  while (i < items.length) {
    let current = items[i];

    // 200자 미만이면 다음과 병합
    if (current.text.length < MIN_CHUNK_SIZE && i + 1 < items.length) {
      const next = items[i + 1];
      // 더 긴 텍스트의 source를 유지 (의미가 더 풍부함)
      const mergedSource = next.text.length > current.text.length ? next.source : current.source;
      current = {
        text: current.text + '\n\n' + next.text,
        source: mergedSource,
      };
      i += 2;
    } else {
      i += 1;
    }

    // 1000자 초과면 재분할
    if (current.text.length > MAX_CHUNK_SIZE) {
      const splits = splitWithOverlap(current.text, SPLIT_SIZE, OVERLAP_SIZE);
      for (const splitText of splits) {
        result.push({ text: splitText, source: current.source });
      }
    } else {
      result.push(current);
    }
  }

  return result;
}

function splitWithOverlap(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }

  return chunks;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/knowledge/__tests__/chunk-strategy.test.ts 2>&1 | tail -15`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/knowledge/chunk-strategy.ts src/lib/knowledge/__tests__/chunk-strategy.test.ts
git commit -m "feat: ChunkStrategy 하이브리드 청킹 모듈 구현"
```

---

## Chunk 3: KnowledgeManager + API

### Task 7: KnowledgeManager 구현

**Files:**
- Create: `src/lib/knowledge/knowledge-manager.ts`
- Create: `src/lib/knowledge/__tests__/knowledge-manager.test.ts`

**참고:**
- `src/lib/storage/vector-engine.ts` — VectorEngine 클래스
- `src/lib/memory/embedder.ts` — `getEmbedding()`
- `src/types/knowledge.ts` — Collection, KnowledgeDocument 등 타입
- `src/lib/storage/atomic-write.ts` — `atomicWriteJSON`, `safeReadJSON`

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/knowledge/__tests__/knowledge-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAddVector = vi.fn().mockResolvedValue('chunk-id-1');
const mockSearchVectors = vi.fn().mockResolvedValue([]);
const mockDeleteVector = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/storage/vector-engine', () => ({
  VectorEngine: vi.fn().mockImplementation(() => ({
    addVector: mockAddVector,
    searchVectors: mockSearchVectors,
    deleteVector: mockDeleteVector,
    getVectorCount: vi.fn().mockResolvedValue(0),
  })),
}));

const mockGetEmbedding = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
vi.mock('@/lib/memory/embedder', () => ({
  getEmbedding: (...args: unknown[]) => mockGetEmbedding(...args),
}));

const mockAtomicWriteJSON = vi.fn().mockResolvedValue(undefined);
const mockSafeReadJSON = vi.fn();
vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: (...args: unknown[]) => mockAtomicWriteJSON(...args),
  safeReadJSON: (...args: unknown[]) => mockSafeReadJSON(...args),
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

vi.mock('@/lib/storage/file-lock', () => ({
  withFileLock: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-id'),
}));

// DocumentParser mock
vi.mock('../document-parser', () => ({
  parseDocument: vi.fn().mockResolvedValue([
    { text: '파싱된 텍스트 1', source: '섹션 1' },
    { text: '파싱된 텍스트 2 '.repeat(30), source: '섹션 2' },
  ]),
  detectFormat: vi.fn().mockReturnValue('text'),
}));

// ChunkStrategy mock
vi.mock('../chunk-strategy', () => ({
  chunkSections: vi.fn().mockReturnValue([
    { text: '청크 1', source: '섹션 1', chunkIndex: 0 },
    { text: '청크 2', source: '섹션 2', chunkIndex: 1 },
  ]),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('KnowledgeManager', () => {
  let KnowledgeManager: typeof import('../knowledge-manager').KnowledgeManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 기본: collections/documents 비어있음
    mockSafeReadJSON.mockResolvedValue([]);
    mockAddVector.mockResolvedValue('chunk-id-1');

    const mod = await import('../knowledge-manager');
    KnowledgeManager = mod.KnowledgeManager;
  });

  describe('컬렉션 관리', () => {
    it('컬렉션을 생성할 수 있다', async () => {
      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      const id = await manager.createCollection('GDD 문서');

      expect(id).toBe('test-id');
      expect(mockAtomicWriteJSON).toHaveBeenCalled();
    });

    it('컬렉션 목록을 조회할 수 있다', async () => {
      mockSafeReadJSON.mockResolvedValueOnce([
        { id: 'c1', name: 'GDD', createdAt: 1000 },
      ]);
      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      const collections = await manager.listCollections();

      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('GDD');
    });

    it('컬렉션 삭제 시 소속 문서와 청크도 삭제된다', async () => {
      mockSafeReadJSON
        .mockResolvedValueOnce([{ id: 'c1', name: 'GDD', createdAt: 1000 }])  // collections
        .mockResolvedValueOnce([{                                              // documents
          id: 'd1', collectionId: 'c1', filename: 'test.md',
          chunkIds: ['ch1', 'ch2'], chunkCount: 2, format: 'md',
          fileSize: 100, createdAt: 1000,
        }]);

      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      await manager.deleteCollection('c1');

      // 청크 삭제
      expect(mockDeleteVector).toHaveBeenCalledTimes(2);
      // collections/documents 저장
      expect(mockAtomicWriteJSON).toHaveBeenCalled();
    });
  });

  describe('문서 관리', () => {
    it('문서를 추가하면 파싱→청킹→임베딩→저장한다', async () => {
      mockSafeReadJSON.mockResolvedValue([]); // documents
      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      const id = await manager.addDocument('c1', 'test.md', Buffer.from('내용'));

      expect(id).toBe('test-id');
      // 2개 청크 × getEmbedding
      expect(mockGetEmbedding).toHaveBeenCalledTimes(2);
      // 2개 청크 × addVector
      expect(mockAddVector).toHaveBeenCalledTimes(2);
    });

    it('문서 삭제 시 소속 청크도 삭제된다', async () => {
      mockSafeReadJSON.mockResolvedValueOnce([{
        id: 'd1', collectionId: 'c1', filename: 'test.md',
        chunkIds: ['ch1', 'ch2'], chunkCount: 2, format: 'md',
        fileSize: 100, createdAt: 1000,
      }]);

      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      await manager.deleteDocument('d1');

      expect(mockDeleteVector).toHaveBeenCalledTimes(2);
    });

    it('임베딩 실패 시 저장된 청크를 롤백한다', async () => {
      mockGetEmbedding
        .mockResolvedValueOnce([0.1, 0.2])  // 첫 번째 청크 성공
        .mockRejectedValueOnce(new Error('Ollama down'));  // 두 번째 실패

      mockSafeReadJSON.mockResolvedValue([]);
      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');

      await expect(manager.addDocument('c1', 'test.md', Buffer.from('내용')))
        .rejects.toThrow();

      // 롤백: 첫 번째 청크 삭제
      expect(mockDeleteVector).toHaveBeenCalled();
    });
  });

  describe('검색', () => {
    it('query를 임베딩하여 벡터 검색한다', async () => {
      mockSearchVectors.mockResolvedValueOnce([
        {
          text: '검색 결과',
          similarity: 0.9,
          metadata: {
            documentId: 'd1', collectionId: 'c1',
            source: '섹션 1', filename: 'test.md',
          },
        },
      ]);

      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      const results = await manager.search('질문');

      expect(results).toHaveLength(1);
      expect(results[0].filename).toBe('test.md');
      expect(results[0].source).toBe('섹션 1');
      expect(mockGetEmbedding).toHaveBeenCalledWith('http://localhost:11434', 'embed-model', '질문');
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/knowledge/__tests__/knowledge-manager.test.ts 2>&1 | tail -10`
Expected: FAIL

- [ ] **Step 3: KnowledgeManager 구현**

```ts
// src/lib/knowledge/knowledge-manager.ts
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { VectorEngine } from '@/lib/storage/vector-engine';
import { getEmbedding } from '@/lib/memory/embedder';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { DATA_DIR } from '@/lib/config/constants';
import { parseDocument, detectFormat } from './document-parser';
import { chunkSections } from './chunk-strategy';
import { logger } from '@/lib/logger';
import type { Collection, KnowledgeDocument, SearchResultWithSource, ChunkMetadata } from '@/types/knowledge';

const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
const COLLECTIONS_FILE = path.join(KNOWLEDGE_DIR, 'collections.json');
const DOCUMENTS_FILE = path.join(KNOWLEDGE_DIR, 'documents.json');

export class KnowledgeManager {
  private engine: VectorEngine;

  constructor(
    private ollamaUrl: string,
    private embeddingModel: string
  ) {
    this.engine = new VectorEngine('knowledge');
  }

  // --- 컬렉션 ---

  async createCollection(name: string): Promise<string> {
    return withFileLock(COLLECTIONS_FILE, async () => {
      const collections = await safeReadJSON<Collection[]>(COLLECTIONS_FILE, []);
      const id = uuidv4();
      collections.push({ id, name, createdAt: Date.now() });
      await atomicWriteJSON(COLLECTIONS_FILE, collections);
      return id;
    });
  }

  async listCollections(): Promise<Collection[]> {
    return safeReadJSON<Collection[]>(COLLECTIONS_FILE, []);
  }

  async deleteCollection(id: string): Promise<void> {
    // 소속 문서 모두 삭제 (청크 포함)
    const collections = await safeReadJSON<Collection[]>(COLLECTIONS_FILE, []);
    const documents = await safeReadJSON<KnowledgeDocument[]>(DOCUMENTS_FILE, []);

    const docsToDelete = documents.filter((d) => d.collectionId === id);
    for (const doc of docsToDelete) {
      for (const chunkId of doc.chunkIds) {
        await this.engine.deleteVector(chunkId);
      }
    }

    const remainingDocs = documents.filter((d) => d.collectionId !== id);
    const remainingColls = collections.filter((c) => c.id !== id);

    await atomicWriteJSON(DOCUMENTS_FILE, remainingDocs);
    await atomicWriteJSON(COLLECTIONS_FILE, remainingColls);
  }

  // --- 문서 ---

  async addDocument(collectionId: string, filename: string, content: Buffer): Promise<string> {
    const format = detectFormat(filename);
    const sections = await parseDocument(filename, content);
    const chunks = chunkSections(sections);

    const savedChunkIds: string[] = [];
    const docId = uuidv4();

    try {
      for (const chunk of chunks) {
        const embedding = await getEmbedding(this.ollamaUrl, this.embeddingModel, chunk.text);
        const metadata: ChunkMetadata = {
          documentId: docId,
          collectionId,
          chunkIndex: chunk.chunkIndex,
          source: chunk.source,
          filename,
        };
        const chunkId = await this.engine.addVector(chunk.text, embedding, metadata as unknown as Record<string, unknown>);
        savedChunkIds.push(chunkId);
      }
    } catch (err) {
      // 롤백: 이미 저장된 청크 삭제
      logger.warn('KNOWLEDGE', `Document add failed, rolling back ${savedChunkIds.length} chunks`, err);
      for (const chunkId of savedChunkIds) {
        await this.engine.deleteVector(chunkId).catch(() => {});
      }
      throw err;
    }

    // 문서 메타데이터 저장
    return withFileLock(DOCUMENTS_FILE, async () => {
      const documents = await safeReadJSON<KnowledgeDocument[]>(DOCUMENTS_FILE, []);
      documents.push({
        id: docId,
        collectionId,
        filename,
        format,
        fileSize: content.length,
        chunkCount: chunks.length,
        chunkIds: savedChunkIds,
        createdAt: Date.now(),
      });
      await atomicWriteJSON(DOCUMENTS_FILE, documents);
      return docId;
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    return withFileLock(DOCUMENTS_FILE, async () => {
      const documents = await safeReadJSON<KnowledgeDocument[]>(DOCUMENTS_FILE, []);
      const doc = documents.find((d) => d.id === documentId);
      if (!doc) return;

      for (const chunkId of doc.chunkIds) {
        await this.engine.deleteVector(chunkId);
      }

      const remaining = documents.filter((d) => d.id !== documentId);
      await atomicWriteJSON(DOCUMENTS_FILE, remaining);
    });
  }

  async listDocuments(collectionId: string): Promise<KnowledgeDocument[]> {
    const documents = await safeReadJSON<KnowledgeDocument[]>(DOCUMENTS_FILE, []);
    return documents.filter((d) => d.collectionId === collectionId);
  }

  // --- 검색 ---

  async search(query: string, topK: number = 5): Promise<SearchResultWithSource[]> {
    try {
      const queryVector = await getEmbedding(this.ollamaUrl, this.embeddingModel, query);
      const results = await this.engine.searchVectors(queryVector, topK);

      return results.map((r) => ({
        text: r.text,
        similarity: r.similarity,
        source: (r.metadata?.source as string) || '',
        filename: (r.metadata?.filename as string) || '',
        documentId: (r.metadata?.documentId as string) || '',
        collectionId: (r.metadata?.collectionId as string) || '',
      }));
    } catch (err) {
      logger.error('KNOWLEDGE', 'Search failed', err);
      return [];
    }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/knowledge/__tests__/knowledge-manager.test.ts 2>&1 | tail -20`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/knowledge/knowledge-manager.ts src/lib/knowledge/__tests__/knowledge-manager.test.ts
git commit -m "feat: KnowledgeManager 지식 베이스 관리자 구현"
```

---

### Task 8: API 라우트 — 컬렉션

**Files:**
- Create: `src/app/api/knowledge/collections/route.ts`
- Create: `src/app/api/knowledge/collections/[id]/route.ts`

- [ ] **Step 1: 컬렉션 GET/POST 라우트**

```ts
// src/app/api/knowledge/collections/route.ts
import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';

export async function GET() {
  try {
    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const collections = await manager.listCollections();
    return NextResponse.json(collections);
  } catch {
    return NextResponse.json({ error: 'Failed to list collections' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const id = await manager.createCollection(name.trim());
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 컬렉션 DELETE 라우트**

```ts
// src/app/api/knowledge/collections/[id]/route.ts
import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    await manager.deleteCollection(id);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/knowledge/collections/
git commit -m "feat: 지식 베이스 컬렉션 API 라우트 (GET/POST/DELETE)"
```

---

### Task 9: API 라우트 — 문서

**Files:**
- Create: `src/app/api/knowledge/documents/route.ts`
- Create: `src/app/api/knowledge/documents/[id]/route.ts`

- [ ] **Step 1: 문서 GET/POST 라우트**

```ts
// src/app/api/knowledge/documents/route.ts
import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collectionId');

    if (!collectionId) {
      return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });
    }

    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const documents = await manager.listDocuments(collectionId);
    return NextResponse.json(documents);
  } catch {
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const collectionId = formData.get('collectionId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!collectionId) {
      return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '파일 크기는 10MB를 초과할 수 없습니다' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    const id = await manager.addDocument(collectionId, file.name, buffer);

    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add document' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 문서 DELETE 라우트**

```ts
// src/app/api/knowledge/documents/[id]/route.ts
import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const settings = await loadSettings();
    const manager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
    await manager.deleteDocument(id);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/knowledge/documents/
git commit -m "feat: 지식 베이스 문서 API 라우트 (GET/POST/DELETE)"
```

---

## Chunk 4: UI 컴포넌트 + 채팅 통합

### Task 10: KnowledgePanel + CollectionList 컴포넌트

**Files:**
- Create: `src/components/knowledge/KnowledgePanel.tsx`
- Create: `src/components/knowledge/CollectionList.tsx`

**참고:**
- `src/components/settings/SettingsPanel.tsx` — 기존 UI 패턴 (fetch, state, 에러 처리)
- `src/components/sidebar/Sidebar.tsx` — 사이드바 버튼 스타일 참조

- [ ] **Step 1: CollectionList 컴포넌트 생성**

```tsx
// src/components/knowledge/CollectionList.tsx
'use client';

import { useState } from 'react';
import type { Collection } from '@/types/knowledge';

interface CollectionListProps {
  collections: Collection[];
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}

export default function CollectionList({ collections, onSelect, onCreate, onDelete }: CollectionListProps) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (trimmed) {
      onCreate(trimmed);
      setNewName('');
      setShowNew(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">컬렉션</h3>
        <button
          onClick={() => setShowNew(true)}
          className="px-2 py-1 text-xs bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors"
        >
          + 새 컬렉션
        </button>
      </div>

      {showNew && (
        <div className="flex gap-2 mb-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setShowNew(false);
            }}
            placeholder="컬렉션 이름..."
            className="flex-1 text-sm bg-card text-foreground placeholder:text-muted rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent border border-border"
            autoFocus
          />
          <button onClick={handleCreate} className="text-xs text-accent hover:text-accent-hover">생성</button>
          <button onClick={() => setShowNew(false)} className="text-xs text-muted hover:text-foreground">취소</button>
        </div>
      )}

      {collections.length === 0 ? (
        <p className="text-xs text-muted py-4 text-center">컬렉션이 없습니다</p>
      ) : (
        <div className="space-y-1">
          {collections.map((coll) => (
            <div
              key={coll.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-card hover:bg-card-hover cursor-pointer transition-colors group"
              onClick={() => onSelect(coll.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">📁</span>
                <span className="text-sm text-foreground">{coll.name}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(coll.id); }}
                className="text-xs text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                title="삭제"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: KnowledgePanel 컴포넌트 생성**

```tsx
// src/components/knowledge/KnowledgePanel.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import CollectionList from './CollectionList';
import DocumentList from './DocumentList';
import type { Collection } from '@/types/knowledge';
import type { KnowledgeDocument } from '@/types/knowledge';

export default function KnowledgePanel({ onClose }: { onClose: () => void }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/collections');
      const data = await res.json();
      setCollections(Array.isArray(data) ? data : []);
    } catch {
      setCollections([]);
    }
  }, []);

  const fetchDocuments = useCallback(async (collectionId: string) => {
    try {
      const res = await fetch(`/api/knowledge/documents?collectionId=${collectionId}`);
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  useEffect(() => {
    if (selectedCollectionId) {
      fetchDocuments(selectedCollectionId);
    }
  }, [selectedCollectionId, fetchDocuments]);

  const handleCreateCollection = async (name: string) => {
    await fetch('/api/knowledge/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    fetchCollections();
  };

  const handleDeleteCollection = async (id: string) => {
    await fetch(`/api/knowledge/collections/${id}`, { method: 'DELETE' });
    if (selectedCollectionId === id) {
      setSelectedCollectionId(null);
      setDocuments([]);
    }
    fetchCollections();
  };

  const handleUploadDocument = async (files: FileList) => {
    if (!selectedCollectionId) return;
    setLoading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('collectionId', selectedCollectionId);
        await fetch('/api/knowledge/documents', { method: 'POST', body: formData });
      }
      fetchDocuments(selectedCollectionId);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    await fetch(`/api/knowledge/documents/${id}`, { method: 'DELETE' });
    if (selectedCollectionId) {
      fetchDocuments(selectedCollectionId);
    }
  };

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {selectedCollectionId && (
              <button
                onClick={() => { setSelectedCollectionId(null); setDocuments([]); }}
                className="text-muted hover:text-foreground mr-1"
                title="뒤로"
              >
                ←
              </button>
            )}
            <h2 className="text-xl font-semibold">
              {selectedCollection ? selectedCollection.name : '📚 지식 베이스'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground bg-card hover:bg-card-hover rounded-lg transition-colors"
          >
            돌아가기
          </button>
        </div>

        {selectedCollectionId ? (
          <DocumentList
            documents={documents}
            loading={loading}
            onUpload={handleUploadDocument}
            onDelete={handleDeleteDocument}
          />
        ) : (
          <CollectionList
            collections={collections}
            onSelect={setSelectedCollectionId}
            onCreate={handleCreateCollection}
            onDelete={handleDeleteCollection}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: DocumentList 임포트 에러 (아직 미생성) — 다음 Task에서 해결

- [ ] **Step 4: 커밋**

```bash
git add src/components/knowledge/KnowledgePanel.tsx src/components/knowledge/CollectionList.tsx
git commit -m "feat: KnowledgePanel + CollectionList 컴포넌트 구현"
```

---

### Task 11: DocumentList 컴포넌트

**Files:**
- Create: `src/components/knowledge/DocumentList.tsx`

- [ ] **Step 1: DocumentList 컴포넌트 생성**

```tsx
// src/components/knowledge/DocumentList.tsx
'use client';

import { useRef } from 'react';
import type { KnowledgeDocument } from '@/types/knowledge';

interface DocumentListProps {
  documents: KnowledgeDocument[];
  loading: boolean;
  onUpload: (files: FileList) => void;
  onDelete: (id: string) => void;
}

const ACCEPTED_FORMATS = '.md,.txt,.ts,.tsx,.js,.jsx,.py,.java,.go,.rs,.c,.cpp,.h,.css,.html,.json,.yaml,.yml,.docx,.xlsx,.pptx';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

const FORMAT_ICONS: Record<string, string> = {
  markdown: '📝', text: '📄', code: '💻',
  docx: '📘', xlsx: '📊', pptx: '📙',
};

export default function DocumentList({ documents, loading, onUpload, onDelete }: DocumentListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{documents.length}개 문서</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="px-2 py-1 text-xs bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
        >
          {loading ? '처리 중...' : '+ 문서 추가'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              onUpload(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-xs text-muted mt-2">문서 파싱 및 임베딩 중...</p>
        </div>
      )}

      {documents.length === 0 && !loading ? (
        <p className="text-xs text-muted py-8 text-center">
          문서가 없습니다. &quot;+ 문서 추가&quot;를 클릭하여 파일을 업로드하세요.
        </p>
      ) : (
        <div className="space-y-1">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-card hover:bg-card-hover transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm shrink-0">{FORMAT_ICONS[doc.format] || '📄'}</span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{doc.filename}</p>
                  <p className="text-[10px] text-muted">
                    {doc.chunkCount}청크 · {formatFileSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onDelete(doc.id)}
                className="text-xs text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                title="삭제"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/knowledge/DocumentList.tsx
git commit -m "feat: DocumentList 문서 목록 컴포넌트 구현"
```

---

### Task 12: Sidebar + ChatContainer에 지식 베이스 뷰 연결

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx:348-390` — 하단 버튼에 지식 베이스 추가
- Modify: `src/components/chat/ChatContainer.tsx:61,324,355-396` — activeView 확장 + KnowledgePanel 렌더링

- [ ] **Step 1: Sidebar에 지식 베이스 버튼 추가**

`src/components/sidebar/Sidebar.tsx`에서 스킬 버튼 (`onClick={() => onViewChange('skills')}`) 앞에 지식 베이스 버튼을 추가:

```tsx
          <button
            onClick={() => onViewChange('knowledge')}
            className={`w-full flex items-center justify-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors ${
              activeView === 'knowledge'
                ? 'bg-accent/20 text-accent'
                : 'text-muted bg-card hover:text-foreground hover:bg-card-hover'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            지식 베이스
          </button>
```

이 버튼은 `{/* Bottom actions */}` 섹션의 `<div className="flex gap-2">` 닫힌 뒤, 스킬 버튼 이전에 삽입.

- [ ] **Step 2: ChatContainer activeView 확장**

`src/components/chat/ChatContainer.tsx` 변경사항:

1. 상단 import 추가:
```ts
import KnowledgePanel from '@/components/knowledge/KnowledgePanel';
```

2. Line 61 — useState 타입 변경:
```ts
const [activeView, setActiveView] = useState<'chat' | 'settings' | 'skills' | 'cron' | 'knowledge'>('chat');
```

3. Line 324 — onViewChange 캐스트 변경:
```ts
onViewChange={(view) => setActiveView(view as 'chat' | 'settings' | 'skills' | 'cron' | 'knowledge')}
```

4. Line 379 (cron 뷰 닫는 `) :` 뒤) — knowledge 뷰 조건 추가:
```tsx
        ) : activeView === 'knowledge' ? (
          <KnowledgePanel onClose={() => setActiveView('chat')} />
        ) : (
```

- [ ] **Step 3: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: lint 확인**

Run: `pnpm lint 2>&1 | tail -10`
Expected: 기존 에러만 (신규 에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add src/components/sidebar/Sidebar.tsx src/components/chat/ChatContainer.tsx
git commit -m "feat: 사이드바에 지식 베이스 버튼 추가 + ChatContainer 뷰 연결"
```

---

### Task 13: 채팅 통합 — KnowledgeManager 검색 + AgentEvent 확장

**Files:**
- Modify: `src/lib/agent/types.ts:51` — AgentEvent.type에 'knowledge_search' 추가
- Modify: `src/types/api.ts:11` — SSEEvent.event에 'knowledge_search' 추가
- Modify: `src/app/api/chat/route.ts:77-89` — KnowledgeManager 검색 추가

- [ ] **Step 1: AgentEvent 타입 확장**

`src/lib/agent/types.ts` Line 51 — type 유니온에 `'knowledge_search'` 추가:

```ts
  type: 'thinking' | 'tool_start' | 'tool_end' | 'tool_confirm' | 'token' | 'thinking_token' | 'image' | 'done' | 'error' | 'loop_detected' | 'model_fallback' | 'skill_start' | 'skill_step' | 'skill_end' | 'subagent_start' | 'subagent_event' | 'subagent_end' | 'knowledge_search';
```

- [ ] **Step 2: SSEEvent 타입 확장**

`src/types/api.ts` Line 11 — event 유니온에 `'knowledge_search'` 추가:

```ts
  event: 'thinking' | 'tool_start' | 'tool_end' | 'token' | 'image' | 'done' | 'error' | 'knowledge_search';
```

- [ ] **Step 3: chat route에 KnowledgeManager 통합**

`src/app/api/chat/route.ts` 변경:

1. 상단 import 추가:
```ts
import { KnowledgeManager } from '@/lib/knowledge/knowledge-manager';
import type { SearchResultWithSource } from '@/types/knowledge';
```

2. Line 89 (memories 검색 후, `HookExecutor.fireAndForget` 전) — 지식 베이스 검색 추가:

```ts
    // Search knowledge base for context
    let knowledgeSources: SearchResultWithSource[] = [];
    try {
      const knowledgeManager = new KnowledgeManager(settings.ollamaUrl, settings.embeddingModel);
      knowledgeSources = await knowledgeManager.search(body.message, 5);
    } catch {
      // Knowledge base unavailable, continue without
    }
```

3. Line 131-133 (agentLoop 호출 전) — 지식 컨텍스트를 시스템 프롬프트에 추가:

`runAgentLoop` 호출 전에 `agentConfig.systemPrompt`를 확장. `agentConfig` 객체 생성 후 (Line 128 뒤):

```ts
          // 지식 베이스 검색 결과를 시스템 프롬프트에 추가
          if (knowledgeSources.length > 0) {
            const knowledgeContext = knowledgeSources
              .map((s, i) => `${i + 1}. [${s.filename} > ${s.source}] ${s.text.slice(0, 300)}`)
              .join('\n');
            agentConfig.systemPrompt += `\n\n[참조 문서]\n${knowledgeContext}\n위 참조 문서를 인용할 때 [출처: 파일명] 형식으로 표기하세요.`;
          }
```

4. agentLoop 시작 직후 (Line 135 `for await` 직전) — knowledge_search 이벤트 발행:

```ts
          // 지식 베이스 출처 정보를 클라이언트에 전달
          if (knowledgeSources.length > 0) {
            controller.enqueue(
              encoder.encode(formatSSE('knowledge_search', { sources: knowledgeSources }))
            );
          }
```

- [ ] **Step 4: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 5: 기존 테스트 통과 확인**

Run: `pnpm vitest run 2>&1 | tail -20`
Expected: 모든 기존 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/agent/types.ts src/types/api.ts src/app/api/chat/route.ts
git commit -m "feat: 채팅에 지식 베이스 검색 통합 + knowledge_search 이벤트"
```

---

### Task 14: 클라이언트 knowledge_search 이벤트 핸들링

**Files:**
- Modify: `src/types/message.ts:7-22` — Message 인터페이스에 `knowledgeSources` 필드 추가
- Modify: `src/hooks/useChat.ts` — `handleSSEEvent` switch에 `knowledge_search` case 추가

**핵심:** 서버에서 `knowledge_search` SSE 이벤트를 발행하더라도 클라이언트에서 핸들링하지 않으면 데이터가 유실된다. Message에 출처 데이터를 부착해야 SourceBadge 팝오버가 동작한다.

- [ ] **Step 1: Message 타입에 knowledgeSources 필드 추가**

`src/types/message.ts`의 `Message` 인터페이스에 추가:

```ts
  knowledgeSources?: import('@/types/knowledge').SearchResultWithSource[];
```

- [ ] **Step 2: useChat에 knowledge_search 핸들러 추가**

`src/hooks/useChat.ts`의 `handleSSEEvent` 함수 내 switch문에 `case 'done':` 앞에 추가:

```ts
            case 'knowledge_search':
              return {
                ...m,
                knowledgeSources: data.sources as import('@/types/knowledge').SearchResultWithSource[],
              };
```

- [ ] **Step 3: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/types/message.ts src/hooks/useChat.ts
git commit -m "feat: 클라이언트 knowledge_search SSE 이벤트 핸들링"
```

---

### Task 15: SourceBadge 출처 표시 컴포넌트

**Files:**
- Create: `src/components/knowledge/SourceBadge.tsx`

**참고:** 이 컴포넌트는 채팅 메시지 렌더링에서 `[출처: 파일명]` 패턴을 감지하여 인라인 뱃지로 교체한다. MessageBubble 렌더링 파이프라인에 `parseSourceCitations()` + `<SourceBadge>` 를 연결하는 작업은 후속 작업으로 분리한다.

- [ ] **Step 1: SourceBadge 컴포넌트 생성**

```tsx
// src/components/knowledge/SourceBadge.tsx
'use client';

import { useState } from 'react';

interface SourceBadgeProps {
  filename: string;
  chunkText?: string;
}

export default function SourceBadge({ filename, chunkText }: SourceBadgeProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => chunkText && setShowPreview(!showPreview)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-accent/10 text-accent rounded-md hover:bg-accent/20 transition-colors cursor-pointer"
        title={chunkText ? '클릭하여 원본 보기' : filename}
      >
        📄 {filename}
      </button>
      {showPreview && chunkText && (
        <div className="absolute bottom-full left-0 mb-1 w-72 max-h-48 overflow-y-auto p-3 text-xs bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-foreground">{filename}</span>
            <button
              onClick={() => setShowPreview(false)}
              className="text-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <p className="text-muted whitespace-pre-wrap">{chunkText}</p>
        </div>
      )}
    </span>
  );
}

/**
 * 텍스트에서 [출처: 파일명] 패턴을 감지하여 SourceBadge로 교체할 수 있도록
 * 파싱 유틸리티를 제공한다.
 */
export function parseSourceCitations(text: string): { type: 'text' | 'source'; content: string }[] {
  const regex = /\[출처:\s*(.+?)\]/g;
  const parts: { type: 'text' | 'source'; content: string }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'source', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}
```

- [ ] **Step 2: 빌드 확인**

Run: `pnpm tsc --noEmit --pretty 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/knowledge/SourceBadge.tsx
git commit -m "feat: SourceBadge 출처 인용 뱃지 컴포넌트 구현"
```

---

### Task 16: 전체 통합 검증

- [ ] **Step 1: 전체 테스트 실행**

Run: `pnpm test:unit 2>&1 | tail -30`
Expected: 모든 테스트 PASS

- [ ] **Step 2: lint 확인**

Run: `pnpm lint 2>&1 | tail -20`
Expected: 신규 에러 없음 (기존 에러만)

- [ ] **Step 3: 빌드 확인**

Run: `pnpm build 2>&1 | tail -20`
Expected: 빌드 성공

- [ ] **Step 4: 최종 커밋 (필요 시)**

남은 수정사항이 있으면 커밋.

---

## 후속 작업 (이 계획 범위 밖)

- **MessageBubble에 SourceBadge 연결**: `parseSourceCitations()` + `<SourceBadge>` 를 메시지 렌더링 파이프라인에 통합하여 `[출처: 파일명]` 패턴을 실제 뱃지로 교체
- **Notion/Confluence 연동**: 2차 구현 (Notion MCP 활용, Confluence REST API)
- **대용량 코드베이스 인덱싱**: 폴더 단위 재귀 업로드, .gitignore 반영
- **문서 재인덱싱**: 동일 파일 업데이트 시 기존 청크 교체 (현재는 delete + re-add)
