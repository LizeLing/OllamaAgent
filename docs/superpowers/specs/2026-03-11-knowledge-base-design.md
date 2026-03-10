# 지식 베이스 (Knowledge Base) 시스템 설계

**날짜:** 2026-03-11
**상태:** 승인됨

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
  async searchVectors(queryEmbedding: number[], topK?: number): Promise<SearchResult[]>
  async deleteVector(id: string): Promise<void>
  async getVectorCount(): Promise<number>
  async listVectors(options: ListOptions): Promise<PaginatedResult>
  async purgeExpired(maxAgeDays: number, maxCount: number): Promise<number>
}
```

하위 호환성:
- 기존 함수형 API(`addVector()`, `searchVectors()` 등)는 `new VectorEngine("memory")` 래퍼로 유지
- 기존 테스트/호출부 수정 불필요

데이터 경로:
- `VectorEngine("memory")` → `data/memory/index.json`, `data/memory/vectors/`
- `VectorEngine("knowledge")` → `data/knowledge/index.json`, `data/knowledge/vectors/`

### 3. 문서 파싱 (DocumentParser)

| 포맷 | 라이브러리 | 추출 단위 |
|------|-----------|----------|
| .md, .txt | 직접 읽기 | 헤딩/섹션 |
| 코드 (.ts, .js, .py 등) | 직접 읽기 | 함수/클래스 (정규식 기반) |
| .docx | `mammoth` | 단락/헤딩 |
| .xlsx | `xlsx` | 시트 → 행 그룹 |
| .pptx | `jszip` + XML 파싱 | 슬라이드 |

### 4. 청킹 전략 (ChunkStrategy)

하이브리드 방식:

1. 구조 인식 분할 (포맷별 자연 단위)
2. 각 청크 크기 체크:
   - 200자 미만 → 다음 청크와 병합
   - 1000자 초과 → 고정 크기(500자, 100자 오버랩)로 재분할
   - 200~1000자 → 그대로 유지
3. 각 청크에 메타데이터 부착: `{ documentId, collectionId, chunkIndex, source }`

### 5. KnowledgeManager

```ts
class KnowledgeManager {
  constructor(ollamaUrl: string, embeddingModel: string)

  // 컬렉션 CRUD
  createCollection(name: string): Promise<string>
  deleteCollection(id: string): Promise<void>
  listCollections(): Promise<Collection[]>

  // 문서 관리
  addDocument(collectionId: string, file: File | string): Promise<string>
  deleteDocument(documentId: string): Promise<void>
  listDocuments(collectionId: string): Promise<Document[]>

  // 검색
  search(query: string, topK?: number): Promise<SearchResultWithSource[]>
}
```

`addDocument` 흐름: 파일 수신 → DocumentParser 텍스트 추출 → ChunkStrategy 분할 → 각 청크 임베딩 → VectorEngine 저장

### 6. 사이드바 UI

activeView 확장: `'chat' | 'settings' | 'skills' | 'cron' | 'knowledge'`

사이드바 하단에 `📚 지식 베이스` 버튼 추가.

**KnowledgePanel 레이아웃:**

컬렉션 목록 뷰:
- 컬렉션 카드: 이름 + 문서 수
- 클릭 → 문서 목록으로 전환 (뒤로가기 버튼)
- `+ 새 컬렉션` → 이름 입력 인라인 폼

문서 목록 뷰:
- 문서 카드: 파일명 + 청크 수 + 등록일 + 삭제 버튼
- `+ 추가` → 파일 선택 다이얼로그 (다중 선택 가능)
- 지원 포맷: .md, .txt, .docx, .xlsx, .pptx, .ts, .js, .py 등
- 업로드 시 프로그레스 바 표시

### 7. 채팅 통합

agentLoop 시작 시:
1. `MemoryManager.search(query)` → 관련 기억 3개 (기존)
2. `KnowledgeManager.search(query)` → 관련 청크 5개 (신규)
3. 시스템 프롬프트에 함께 주입:

```
[참조 문서]
1. [GDD.docx > 섹션 3.2] 전투 시스템은 턴제 기반으로...
2. [Balance.xlsx > Sheet1] 캐릭터 스탯 테이블...
위 참조 문서를 인용할 때 [출처: 파일명] 형식으로 표기하세요.
```

### 8. 출처 표시 UI

- AI 응답에서 `[출처: 파일명]` 패턴 감지
- 인라인 뱃지로 렌더링
- 클릭 시 해당 청크 원본 텍스트를 팝오버로 표시
- AgentEvent에 `knowledge_search` 이벤트 타입 추가

### 9. API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/knowledge/collections` | 컬렉션 목록 |
| POST | `/api/knowledge/collections` | 컬렉션 생성 `{ name }` |
| DELETE | `/api/knowledge/collections/[id]` | 컬렉션 삭제 |
| GET | `/api/knowledge/documents?collectionId=...` | 문서 목록 |
| POST | `/api/knowledge/documents` | 문서 업로드 (multipart) |
| DELETE | `/api/knowledge/documents/[id]` | 문서 삭제 |

### 10. 변경 대상 파일

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
| `src/components/chat/ChatContainer.tsx` | activeView에 'knowledge' 추가 |
| `src/components/sidebar/Sidebar.tsx` | 지식 베이스 버튼 추가 |
| `src/lib/agent/agent-loop.ts` | KnowledgeManager.search() 통합 |
| `src/types/knowledge.ts` | 새 파일 — Collection, Document, Chunk 타입 |

### 11. 새 의존성

- `mammoth` — docx 텍스트 추출
- `xlsx` — Excel 파싱
- `jszip` — pptx 파싱 (zip 내 XML 추출)
