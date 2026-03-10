# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

로컬 Ollama 모델 기반 AI 에이전트 챗 애플리케이션. Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4. 패키지 매니저는 **pnpm**.

## Commands

```bash
pnpm dev              # 개발 서버 (http://localhost:3000)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint (next core-web-vitals + typescript)
pnpm test:unit        # 단위 테스트 (vitest, jsdom)
pnpm test:integration # 통합 테스트 (vitest, node, 60s timeout)
pnpm test:run         # 모든 vitest 테스트
pnpm test:e2e         # E2E 테스트 (playwright, localhost:3000 필요)
```

단일 테스트 실행: `pnpm vitest run src/lib/tools/__tests__/registry.test.ts`

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
POST /api/chat (SSE) → agentLoop (async generator) → Ollama API
                           ↕ (tool loop, max N iterations)
                       ToolRegistry → BaseTool.execute()
                           ↕
                       yield AgentEvent → SSE stream → useChat() hook → UI
```

1. `/api/chat` receives message + history, starts SSE stream
2. `runAgentLoop()` is an **async generator** yielding `AgentEvent` objects
3. Each iteration: call Ollama → check for tool calls → execute tools → repeat
4. Final answer: stream tokens with `think: true` (thinking mode)
5. Events: `token`, `thinking_token`, `tool_start`, `tool_end`, `tool_confirm`, `done`, `error`

### Tool System

`BaseTool` 추상 클래스 → `ToolRegistry` (singleton Map) → Ollama native tool format 변환

도구 종류: Filesystem(Read/Write/List/Search), HttpClient, WebSearch, WebFetch, CodeExecutor, ImageGenerator, CustomTool, McpTool, DelegateToSubAgent

**승인 시스템**: `approval.ts`에서 `pendingApprovals` Map + 60초 타임아웃. 모드: auto / confirm / deny-dangerous

**루프 감지**: `ToolCallTracker`가 SHA256 해시로 동일 호출 추적. 2회째 캐시 반환, 3회째 중단

### Data Persistence (File-based JSON)

```
data/
├── settings.json           # 앱 설정
├── conversations/
│   ├── index.json          # 메타데이터 인덱스 (메모리 캐시)
│   └── {id}.json           # 개별 대화
├── memory/
│   ├── index.json          # 벡터 메타데이터
│   └── vectors/{id}.json   # 개별 임베딩
├── skills/{id}/SKILL.md    # 스킬 정의 (frontmatter + markdown)
├── hooks.json              # 이벤트 훅
├── cron-jobs.json          # 스케줄 작업
└── generated/              # 생성 이미지
```

대화는 인덱스 기반 lazy-loading. 벡터는 개별 파일 + 인덱스로 DB 없이 RAG 구현.

### MCP Integration

JSON-RPC 2.0 over HTTP. 설정의 `mcpServers` 배열에서 서버 등록 → `registerMcpTools()`로 동적 발견 → `mcp_` 접두사로 네이티브 도구와 구분.

### Memory (RAG)

대화 시작 시 `MemoryManager`가 임베딩 검색 → 상위 3개를 "관련 기억"으로 시스템 프롬프트에 주입. 대화 요약 자동 저장.

### Sub-agent Delegation

3종 특화 에이전트 (coder, researcher, analyst). 깊이 추적으로 무한 재귀 방지 (기본 max 2). 이벤트는 `subagent_` 접두사로 버블업.

## Code Conventions

- Path alias: `@/*` → `./src/*`
- 테스트 파일: `*.test.{ts,tsx}` (단위), `*.integration.test.{ts,tsx}` (통합)
- 테스트 위치: 소스 파일 옆 `__tests__/` 디렉토리
- 프로젝트 언어: 한국어 (UI, 주석, 커밋 메시지)
- 상태 관리: 외부 라이브러리 없이 React hooks만 사용
- API 응답: SSE 스트리밍 (chat), JSON (나머지)
- 설정: `DEFAULT_SETTINGS` → 저장된 값으로 merge → 환경 변수 오버라이드
