# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

로컬 Ollama 모델 기반 AI 에이전트 챗 애플리케이션. Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4. 패키지 매니저는 **pnpm**.

## Commands

```bash
pnpm dev              # 개발 서버 (http://localhost:3000)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint (next core-web-vitals + typescript)
pnpm test:unit        # 단위 테스트 (vitest project "unit", jsdom)
pnpm test:integration # 통합 테스트 (vitest project "integration", node, 60s timeout)
pnpm test:run         # 두 project 모두 실행 (= test:all)
pnpm test:e2e         # E2E 테스트 (playwright, dev 서버 필요)
pnpm test:e2e:ui      # Playwright UI 모드
```

단일 테스트 실행:
- 단위: `pnpm vitest run --project unit src/lib/tools/__tests__/registry.test.ts`
- 통합: `pnpm vitest run --project integration <path>`

단위/통합은 파일명 패턴으로 구분된다 — `*.integration.test.ts`는 `unit` project에서 제외되고 node 환경에서만 실행된다.

## Environment

`.env.local` 필수 변수:
- `OLLAMA_URL` — Ollama 서버 주소 (기본: http://localhost:11434)
- `OLLAMA_MODEL` — 기본 채팅 모델
- `OLLAMA_EMBEDDING_MODEL` — RAG 임베딩 모델
- `SEARXNG_URL` — 웹 검색 엔진 주소
- `DATA_DIR` — 데이터 저장 경로 (기본: ./data)

## Architecture

### Request Flow (Chat)

```
POST /api/chat (SSE) → runAgentLoop (async generator) → Ollama (chat / chatStream / chatWithFailover)
                           ↕ (tool loop, max N iterations)
                       MiddlewareChain (beforeAgent/beforeModel/afterModel/afterAgent)
                           ↕
                       ToolMiddlewareChain → ToolRegistry → BaseTool.execute()
                           ↕
                       yield AgentEvent → SSE stream → useChat() hook → UI
```

1. `/api/chat` receives message + history, starts SSE stream
2. `runAgentLoop()` (src/lib/agent/agent-loop.ts) is an **async generator** yielding `AgentEvent`
3. Each iteration: middleware hooks → call Ollama → check for tool calls → execute tools → repeat
4. History는 문자 길이 기준으로 trim (기본 10K chars, 혼합 텍스트에서 ~20K 토큰 가정)
5. Thinking은 `resolveThink(config, phase)`로 phase별로 분리 제어 (`thinkingMode` = auto/on/off, `thinkingForToolCalls`)
6. Events: `token`, `thinking_token`, `tool_start`, `tool_end`, `tool_confirm`, `subagent_*`, `done`, `error`

### Ollama Client & Failover

`src/lib/ollama/`에는 일반 `chat`/`chatStream`과 `chatWithFailover`가 모두 있다. failover는 설정의 `ollamaUrls` 리스트를 순회하며 활성 URL을 자동 전환한다. agent-loop에서 도구 비사용 시에는 `chatStream`으로 토큰 단위 SSE를 낸다.

### Middleware System

`src/lib/agent/middleware/`에 두 종류의 체인이 있다:

- **AgentMiddleware** (`MiddlewareChain`): `beforeAgent` / `beforeModel` / `afterModel` / `afterAgent` 훅. `MiddlewareContext`에 messages/userMessage/history/memories/metadata를 주고받는다. 기본 구현체: `summarization`(긴 history 요약), `subagent-limit`(하위 에이전트 깊이 제어).
- **ToolMiddleware** (`ToolMiddlewareChain`): 도구 실행 전/후 훅. `beforeExecute`에서 `skip: true` 반환 시 도구를 건너뛸 수 있다.

config에 `middlewares` / `toolMiddlewares` 배열이 비어있으면 체인은 생성조차 하지 않는다 — 추가 오버헤드 없음.

### Tool System

`BaseTool` 추상 클래스 → `ToolRegistry` (singleton Map) → Ollama native tool format 변환

도구 종류: Filesystem(Read/Write/List/Search), HttpClient, WebSearch, WebFetch, CodeExecutor, ImageGenerator, CustomTool, McpTool, DelegateToSubAgent

**승인 시스템**: `approval.ts`에서 `pendingApprovals` Map + 60초 타임아웃. 모드: auto / confirm / deny-dangerous

**루프 감지**: `ToolCallTracker`가 SHA256 해시로 동일 호출 추적. 2회째 캐시 반환, 3회째 중단

### Storage Layer

`src/lib/storage/`는 DB 없는 파일 기반 persistence의 공통 인프라:

- `atomicWriteJSON` / `safeReadJSON` (atomic-write.ts) — 임시파일 + rename으로 partial write 방지
- `withFileLock` (file-lock.ts) — 동일 경로에 대한 직렬화. 컬렉션/문서 갱신 등 읽고-수정-쓰기(RMW) 구간에 필수
- `VectorEngine` (vector-engine.ts) — `memory`, `knowledge` 등 namespace별 개별 파일 벡터 저장 + 메타 인덱스. 코사인 유사도 검색을 제공하며 `MemoryManager`와 `KnowledgeManager`가 공유

파일 기반 JSON을 수정하는 신규 코드는 반드시 `withFileLock` + `atomicWriteJSON` 조합을 쓸 것. raw `fs.writeFile`로 내려쓰면 동시 요청에서 손상된다.

### Knowledge Base (문서 RAG)

`src/lib/knowledge/`는 사용자가 업로드한 문서를 컬렉션 단위로 색인/검색한다. Memory RAG와 분리된 namespace를 쓴다.

- `document-parser.ts` — `detectFormat` + `parseDocument`로 md/txt/pdf/docx/xlsx 등을 섹션 배열로 변환 (mammoth/exceljs 등 사용)
- `chunk-strategy.ts` — `chunkSections`로 섹션 단위 청킹
- `knowledge-manager.ts` — 컬렉션/문서 CRUD, 임베딩 후 `VectorEngine('knowledge')`에 저장, `SearchResultWithSource`로 출처 포함 검색

API: `/api/knowledge/collections`, `/api/knowledge/documents`, `/api/knowledge/documents/directory`. 채팅은 `knowledge_search` SSE 이벤트로 결과를 스트리밍하고 UI에 `SourceBadge`로 출처를 렌더한다.

### Data Persistence (File-based JSON)

```
data/
├── settings.json           # 앱 설정
├── conversations/
│   ├── index.json          # 메타데이터 인덱스 (메모리 캐시)
│   └── {id}.json           # 개별 대화
├── memory/                 # VectorEngine('memory')
│   ├── index.json
│   └── vectors/{id}.json
├── knowledge/              # VectorEngine('knowledge')
│   ├── collections.json
│   ├── documents.json
│   ├── index.json
│   └── vectors/{id}.json
├── skills/{id}/SKILL.md    # 스킬 정의 (frontmatter + markdown)
├── tasks/{taskId}/         # Task Mode 저장 (아래 Task Mode 섹션 참조)
│   ├── task.json           # 기계용 정본
│   ├── task.md             # 사람이 읽는 요약
│   ├── runs/{runId}.json
│   ├── checkpoints/{cpId}.{json,md}
│   └── artifacts/
├── hooks.json              # 이벤트 훅
├── cron-jobs.json          # 스케줄 작업
├── cron-history.json       # 스케줄 실행 이력
└── generated/              # 생성 이미지
```

대화는 인덱스 기반 lazy-loading. 벡터는 개별 파일 + 인덱스로 DB 없이 RAG 구현 — 다만 모든 쓰기는 storage layer(`withFileLock` + `atomicWriteJSON`)를 경유해야 한다.

### MCP Integration

JSON-RPC 2.0 over HTTP. 설정의 `mcpServers` 배열에서 서버 등록 → `registerMcpTools()`로 동적 발견 → `mcp_` 접두사로 네이티브 도구와 구분.

### Memory (RAG)

대화 시작 시 `MemoryManager`가 임베딩 검색 → 상위 3개를 "관련 기억"으로 시스템 프롬프트에 주입. 대화 요약 자동 저장.

### Sub-agent Delegation

5종 특화 에이전트 (coder, researcher, analyst, verifier, planner). 깊이 추적으로 무한 재귀 방지 (기본 max 2). 이벤트는 `subagent_` 접두사로 버블업. `subagent-limit` 미들웨어로 깊이/호출 수를 중앙에서 제한한다.

**두 가지 실행 API** (`src/lib/agent/subagent-runner.ts`):
- `runSubAgent(...)` — 기존 호출자용 어댑터. `{ result, events, workerResult }` 반환 (events를 내부적으로 collect)
- `runSubAgentStream(...)` — async generator. 실시간 이벤트 스트림이 필요할 때 사용 (Task Execute API가 이걸로 for-await 중계)

Task Mode 호출 시(taskContext 전달) 마지막 `subagent_done` 이벤트에 `WorkerResult`가 파싱되어 실린다. 서브에이전트는 `<worker-result>` 태그 안 JSON으로 결과를 반환해야 하며, 파싱 실패 시 `{ status: 'completed', summary: rawText, ...empty }`로 fallback.

### Task Mode (장기 작업 관리)

Chat Mode가 transcript 중심이라면, Task Mode는 **Task 상태를 정본**으로 삼아 세션 재개를 state restore 문제로 바꾼다. `src/lib/tasks/`에 구성.

```
POST /api/tasks                    → runBreakdown → TaskRecord 저장 (task.json + task.md)
GET  /api/tasks, /api/tasks/[id]   → 목록/상세
POST /api/tasks/[id]/execute (SSE) → Coordinator.pickNextTask → Sub-agent → integrateWorkerResult
POST /api/tasks/[id]/checkpoint    → Checkpoint 생성 (json + md)
POST /api/tasks/[id]/resume        → ResumeContext 조립 (Task State > Checkpoint > Working Set)
```

**구성 요소**:
- `breakdown-engine.ts` — Ollama `chat`을 JSON format으로 호출해 Epic/Task/SubTask 초안 생성 + 구조화 파서 + draftToTaskRecord
- `storage.ts` — TaskRecord CRUD. `withFileLock` + `atomicWriteJSON` 사용. `data/tasks/{id}/` 아래 디렉토리 생성
- `markdown.ts` — task.md / checkpoint.md 렌더러 (YAML frontmatter + 섹션)
- `coordinator.ts` — pickNextTask (dependsOn topological + priority), integrateWorkerResult, computeProgress, shouldReplan
- `checkpoint.ts` — buildCheckpoint / createCheckpoint. LLM 호출 없이 템플릿 기반 resumePrompt 생성
- `context-builder.ts` — buildResumeContext: Task 목표 → Epic/Task 상태 → 최신 checkpoint → working set → (옵션) memory/knowledge

**UI 통합**: 사이드바 `Chats / Tasks` 탭. Tasks 탭에서 TaskList → TaskDetail 렌더. 채팅 입력창에서 `/task new <goal>`, `/task open <id>`, `/task checkpoint`, `/task replan`, `/task done` 명령어 지원. `useChat` 훅에 `taskId`, `taskMode` 상태 확장. `/api/chat`이 `taskMode: 'task'` + `command`를 받으면 Task 관리 분기로 흐른다.

**writeScope 이중 제한**: 각 `TaskItem.writeScope`는 서브에이전트 filesystem write 경로를 제한한다. 단 **writeScope에 포함된 경로라도 프로젝트 cwd 밖이면 차단**된다 (`/tmp/...` 같은 시스템 절대경로 거부). 샌드박스가 필요하면 프로젝트 내 경로(`sandbox/`, `build/`, `tmp/`)를 쓴다.

**사용 가이드**: [`docs/guides/task-mode.md`](docs/guides/task-mode.md) — 설계: [`docs/plans/2026-04-19-task-mode-design.md`](docs/plans/2026-04-19-task-mode-design.md)

### Autoresearch (벤치마크/실험 하네스)

`src/lib/autoresearch/`는 에이전트 설정을 자동으로 튜닝하는 실험 하네스다.

- `default-cases.ts` — 카테고리별(`tool_selection` / `response_quality` / `reasoning` / `instruction_following`) 벤치마크 케이스
- `benchmark.ts` — 한 config로 전체 케이스를 돌려 `BenchmarkResult` 산출 (도구 정확도, 키워드 적중률, 응답 시간, 토큰)
- `strategies.ts` — 다음 실험 파라미터 변경안을 제안
- `evaluator.ts` — LLM 기반 응답 품질 평가
- `experiment-runner.ts` — 루프: 변경안 적용 → 벤치마크 → keep/discard 결정 → 다음 변경안
- `results-store.ts` — 실험 이력 저장

API: `/api/autoresearch` (실행), `/api/autoresearch/benchmark`, `/api/autoresearch/results`. SSE로 `ExperimentProgress` 이벤트를 스트리밍한다.

## Code Conventions

- Path alias: `@/*` → `./src/*`
- 테스트 파일: `*.test.{ts,tsx}` (단위), `*.integration.test.{ts,tsx}` (통합)
- 테스트 위치: 소스 파일 옆 `__tests__/` 디렉토리
- 프로젝트 언어: 한국어 (UI, 주석, 커밋 메시지)
- 상태 관리: 외부 라이브러리 없이 React hooks만 사용
- API 응답: SSE 스트리밍 (chat), JSON (나머지)
- 설정: `DEFAULT_SETTINGS` → 저장된 값으로 merge → 환경 변수 오버라이드
