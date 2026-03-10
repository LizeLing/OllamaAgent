# 지식 베이스 (Knowledge Base) 시스템 설계

**날짜:** 2026-03-11
**상태:** 승인됨 (리뷰 반영 v2)

## 개요

기존 대화 메모리 RAG와 별도로, 게임 디자인 문서(Word, PPT, Excel)와 프로젝트 코드를 임베딩하여 사용자 질의에 응답하는 지식 베이스 시스템. 왼쪽 사이드바에 관리 인터페이스를 추가한다.

## 요구사항

- 공통 벡터 엔진(VectorEngine)을 추출하여 메모리/지식 베이스가 공유
- 단순 컬렉션(이름 + 문서 목록) 단위로 문서 그룹화
- 지원 포맷: .md, .txt, 코드(.ts/.js/.py 등), .docx, .xlsx, .pptx
- 하이브리드 청킹: 구조 인식 분할 + 고정 크기 재분할
- 채팅 시 전체 컬렉션에서 자동 검색, 시스템 프롬프트에 주입
- 출처 표시 + 클릭 시 원본 청크 미리보기
- Confluence/Notion 연동은 2차로 미룸

## 설계

### 1. 전체 아키텍처

```
┌─ VectorEngine (공통) ───────────────────────────────────┐
│  addVector / searchVectors / deleteVector / listVectors    │
│  namespace 기반 데이터 분리                                 │
│  data/{namespace}/index.json + vectors/{id}.json          │
└───────────────────────────────────────────────────────────┘
        ↑                          ↑
   MemoryManager              KnowledgeManager
   (namespace: "memory")      (namespace: "knowledge")
   기존 대화 메모리 RAG         컬렉션 + 문서 + 청크 관리
                                    ↑
                              DocumentParser
                              (docx, xlsx, pptx, md, txt, code)
                                    ↑
                              ChunkStrategy
                              (구조 인식 + 고정 크기 재분할)
```

### 2. VectorEngine 공통 엔진

현재 `vector-store.ts`의 함수들을 클래스로 리팩토링:

```ts
class VectorEngine {
  constructor(namespace: string)

  async addVector(text: string, embedding: number[], metadata?: Record<string, unknown>): Promise<string>
  async searchVectors(queryEmbedding: number[], topK?: number, threshold?: number): Promise<SearchResult[]>
  async deleteVector(id: string): Promise<void>
  async getVectorCount(): Promise<number>
  async listVectors(options: ListOptions): Promise<PaginatedResult>
  async purgeExpired(maxAgeDays: number, maxCount: number): Promise<number>
}
```

하위 호환성:
- 기존 함수형 API(`addVector()`, `searchVectors()` 등)는 `new VectorEngine("memory")` 래퍼로 유지
- `searchVectors`의 `threshold` 파라미터 (기본값 0.3) 유지
- 기존 테스트/호출부 수정 불필요

데이터 경로:
- `VectorEngine("memory")` → `data/memory/index.json`, `data/memory/vectors/`
- `VectorEngine("knowledge")` → `data/knowledge/index.json`, `data/knowledge/vectors/`

### 3. 타입 정의 (`src/types/knowledge.ts`)

```ts
export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

export interface KnowledgeDocument {
  id: string;
  collectionId: string;
  filename: string;
  format: string;         // 'md' | 'txt' | 'docx' | 'xlsx' | 'pptx' | 'code'
  fileSize: number;       // bytes
  chunkCount: number;
  chunkIds: string[];     // VectorEngine에 저장된 청크 ID 목록
  createdAt: number;
}

export interface ChunkMetadata {
  documentId: string;
  collectionId: string;
  chunkIndex: number;
  source: string;         // "슬라이드 3", "Sheet1", "function handleClick" 등
  filename: string;       // 출처 표시용
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

### 4. 메타데이터 저장 (`data/knowledge/`)

```
data/knowledge/
├── collections.json     # Collection[] — 컬렉션 목록
├── documents.json       # KnowledgeDocument[] — 문서 메타데이터
├── index.json           # VectorEngine 청크 인덱스
└── vectors/{id}.json    # 개별 청크 임베딩
```

원본 파일은 저장하지 않음. 파싱 → 청킹 → 임베딩 후 텍스트만 보존.
문서 업데이트 시 기존 문서 삭제 후 재업로드 (delete + re-add).

### 5. 문서 파싱 (DocumentParser)

| 포맷 | 라이브러리 | 추출 단위 | 추출 범위 |
|------|-----------|----------|----------|
| .md, .txt | 직접 읽기 | 헤딩/섹션 | 전체 텍스트 |
| 코드 (.ts, .js, .py 등) | 직접 읽기 | 함수/클래스 (정규식 기반) | 전체 소스 |
| .docx | `mammoth` | 단락/헤딩 | 본문 텍스트 |
| .xlsx | `exceljs` | 시트 → 행 그룹 | 셀 값 텍스트 |
| .pptx | `jszip` + XML 파싱 | 슬라이드 | 본문 텍스트만 (`<a:t>` 요소). 노트/마스터/레이아웃 제외 |

업로드 파일 크기 제한: **10MB per file**.

### 6. 청킹 전략 (ChunkStrategy)

하이브리드 방식:

1. 구조 인식 분할 (포맷별 자연 단위)
2. 크기 정규화 루프 (수렴할 때까지 반복):
   - 200자 미만 → 다음 청크와 병합
   - 1000자 초과 → 고정 크기(500자, 100자 오버랩)로 재분할
   - 200~1000자 → 그대로 유지
   - 병합 후 1000자 초과 시 다시 재분할 (재귀 방지: 최대 2회 반복)
3. 각 청크에 메타데이터 부착: `ChunkMetadata`

### 7. KnowledgeManager

```ts
class KnowledgeManager {
  constructor(ollamaUrl: string, embeddingModel: string)

  // 컬렉션 CRUD
  createCollection(name: string): Promise<string>
  deleteCollection(id: string): Promise<void>  // 소속 문서+청크 모두 cascading 삭제
  listCollections(): Promise<Collection[]>

  // 문서 관리
  addDocument(collectionId: string, filename: string, content: Buffer): Promise<string>
  deleteDocument(documentId: string): Promise<void>  // 소속 청크 모두 삭제
  listDocuments(collectionId: string): Promise<KnowledgeDocument[]>

  // 검색
  search(query: string, topK?: number): Promise<SearchResultWithSource[]>
}
```

`addDocument` 흐름:
1. 파일 포맷 판별 (확장자 기반)
2. DocumentParser로 텍스트 추출
3. ChunkStrategy로 분할
4. 각 청크 임베딩 (Ollama API)
5. VectorEngine에 저장 (ChunkMetadata 포함)
6. documents.json에 메타데이터 기록
7. **실패 시 롤백**: 저장된 청크가 있으면 모두 삭제, documents.json에서 제거

### 8. 사이드바 UI

**activeView 타입 추출 및 확장:**

`src/types/` 또는 `ChatContainer.tsx`에서 공유 타입으로 추출:
```ts
type ActiveView = 'chat' | 'settings' | 'skills' | 'cron' | 'knowledge';
```

`ChatContainer.tsx`의 `useState` 타입과 `setActiveView` 캐스트 모두 업데이트.

사이드바 하단에 `📚 지식 베이스` 버튼 추가.

**KnowledgePanel 레이아웃:**

컬렉션 목록 뷰:
- 컬렉션 카드: 이름 + 문서 수
- 클릭 → 문서 목록으로 전환 (뒤로가기 버튼)
- `+ 새 컬렉션` → 이름 입력 인라인 폼

문서 목록 뷰:
- 문서 카드: 파일명 + 청크 수 + 등록일 + 삭제 버튼
- `+ 추가` → 파일 선택 다이얼로그 (다중 선택 가능, 10MB 제한 표시)
- 지원 포맷: .md, .txt, .docx, .xlsx, .pptx, .ts, .js, .py 등
- 업로드 시 프로그레스 바 표시

### 9. 채팅 통합

**통합 위치: `src/app/api/chat/route.ts`** (기존 MemoryManager.searchMemories() 호출 옆)

```ts
// 기존: memoryManager.searchMemories(body.message, 3)
// 신규: knowledgeManager.search(body.message, 5)
```

결과를 시스템 프롬프트에 주입:

```
[참조 문서]
1. [GDD.docx > 섹션 3.2] 전투 시스템은 턴제 기반으로...
2. [Balance.xlsx > Sheet1] 캐릭터 스탯 테이블...
위 참조 문서를 인용할 때 [출처: 파일명] 형식으로 표기하세요.
```

`runAgentLoop()`에 `knowledgeSources` 파라미터 추가하여 출처 정보를 클라이언트에 전달.

### 10. 출처 표시 UI

**AgentEvent 확장:**
```ts
// src/lib/agent/types.ts — AgentEvent.type에 'knowledge_search' 추가
type: '...' | 'knowledge_search';

// knowledge_search 이벤트 data:
{ sources: SearchResultWithSource[] }
```

`src/types/api.ts`의 `SSEEvent.event`에도 `'knowledge_search'` 추가.

**출처 감지 및 렌더링:**
- AI 응답에서 `\[출처:\s*(.+?)\]` 정규식으로 패턴 감지
- 인라인 SourceBadge 컴포넌트로 렌더링
- 클릭 시 `knowledge_search` 이벤트로 전달된 청크 데이터에서 매칭하여 팝오버 표시
- 매칭 실패 시 뱃지만 표시 (미리보기 없음)

### 11. API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/knowledge/collections` | 컬렉션 목록 |
| POST | `/api/knowledge/collections` | 컬렉션 생성 `{ name }` |
| DELETE | `/api/knowledge/collections/[id]` | 컬렉션 삭제 (cascading) |
| GET | `/api/knowledge/documents?collectionId=...` | 문서 목록 |
| POST | `/api/knowledge/documents` | 문서 업로드 (multipart, 10MB 제한) |
| DELETE | `/api/knowledge/documents/[id]` | 문서 삭제 (소속 청크 포함) |

### 12. 변경 대상 파일

| 파일 | 변경 |
|------|------|
| `src/lib/storage/vector-engine.ts` | 새 파일 — VectorEngine 클래스 |
| `src/lib/memory/vector-store.ts` | VectorEngine("memory") 래퍼로 리팩토링 |
| `src/lib/knowledge/knowledge-manager.ts` | 새 파일 — 컬렉션/문서/검색 관리 |
| `src/lib/knowledge/document-parser.ts` | 새 파일 — 포맷별 텍스트 추출 |
| `src/lib/knowledge/chunk-strategy.ts` | 새 파일 — 하이브리드 청킹 |
| `src/app/api/knowledge/collections/route.ts` | 새 파일 — GET, POST |
| `src/app/api/knowledge/collections/[id]/route.ts` | 새 파일 — DELETE |
| `src/app/api/knowledge/documents/route.ts` | 새 파일 — GET, POST |
| `src/app/api/knowledge/documents/[id]/route.ts` | 새 파일 — DELETE |
| `src/components/knowledge/KnowledgePanel.tsx` | 새 파일 — 메인 패널 |
| `src/components/knowledge/CollectionList.tsx` | 새 파일 — 컬렉션 목록 |
| `src/components/knowledge/DocumentList.tsx` | 새 파일 — 문서 목록 |
| `src/components/knowledge/SourceBadge.tsx` | 새 파일 — 출처 인용 뱃지 |
| `src/components/chat/ChatContainer.tsx` | ActiveView 타입 확장, knowledge 뷰 추가 |
| `src/components/sidebar/Sidebar.tsx` | 지식 베이스 버튼 추가 |
| `src/app/api/chat/route.ts` | KnowledgeManager.search() 통합 |
| `src/lib/agent/types.ts` | AgentEvent.type에 'knowledge_search' 추가 |
| `src/types/api.ts` | SSEEvent.event에 'knowledge_search' 추가 |
| `src/types/knowledge.ts` | 새 파일 — Collection, KnowledgeDocument, ChunkMetadata, SearchResultWithSource 타입 |

**테스트 파일:**
| 파일 | 테스트 대상 |
|------|-----------|
| `src/lib/storage/__tests__/vector-engine.test.ts` | VectorEngine 클래스 |
| `src/lib/knowledge/__tests__/knowledge-manager.test.ts` | KnowledgeManager |
| `src/lib/knowledge/__tests__/document-parser.test.ts` | DocumentParser |
| `src/lib/knowledge/__tests__/chunk-strategy.test.ts` | ChunkStrategy |

### 13. 새 의존성

- `mammoth` — docx 텍스트 추출
- `exceljs` — Excel 파싱 (SheetJS 대신, 라이선스 안정적)
- `jszip` — pptx 파싱 (zip 내 XML 추출)
