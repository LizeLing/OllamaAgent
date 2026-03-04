# OllamaAgent Feature Expansion Design

## Overview

OllamaAgent에 3가지 주요 기능 영역을 에이전트 팀 병렬 개발로 추가한다.

1. **대화 관리 시스템** — 멀티 대화, 사이드바, 자동 제목, 내보내기/가져오기, 검색
2. **에이전트 강화** — 도구 승인 모드, 에이전트 프리셋, 커스텀 도구 UI, MCP 서버 연동
3. **UX 개선** — 메시지 편집/재생성, 다크/라이트 테마, 반응형 모바일

## Team Structure

| Agent | Branch | Scope |
|-------|--------|-------|
| conversation-agent | feature/conversation-management | 대화 관리 전체 |
| agent-enhancement | feature/agent-enhancement | 에이전트 강화 전체 |
| ux-improvement | feature/ux-improvement | UX 개선 전체 |

---

## Section 1: Conversation Management

### Data Model

```typescript
// types/conversation.ts
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  summary?: string;
}
```

### Server API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/conversations` | GET | 목록 조회 (메타데이터만) |
| `/api/conversations` | POST | 새 대화 생성 |
| `/api/conversations/[id]` | GET | 대화 상세 |
| `/api/conversations/[id]` | PUT | 대화 업데이트 |
| `/api/conversations/[id]` | DELETE | 대화 삭제 |
| `/api/conversations/[id]/export` | GET | JSON/Markdown 내보내기 |
| `/api/conversations/import` | POST | 가져오기 |
| `/api/conversations/search` | GET | 전문 검색 |

### Storage

```
data/conversations/
  ├── index.json          # [{id, title, updatedAt}]
  └── {id}.json           # Full conversation data
```

### UI Components

- `Sidebar.tsx` — 대화 목록, 검색바, 새 대화 버튼
- `ConversationItem.tsx` — 개별 항목 (제목, 날짜, 삭제)
- `ChatContainer.tsx` 수정 — 사이드바 토글, 레이아웃 변경
- `useConversations.ts` — 대화 목록 관리 훅

### Auto Title

- 첫 사용자 메시지를 Ollama에 보내 1줄 요약
- `/api/chat` 완료 후 백그라운드 제목 생성

---

## Section 2: Agent Enhancement

### Tool Approval Mode

- `Settings.toolApprovalMode: 'auto' | 'confirm' | 'deny-dangerous'`
- 위험 도구: `code_executor`, `file_write`
- SSE `tool_confirm` 이벤트 → 프론트 모달 → POST `/api/chat/confirm`
- 서버 Promise 대기 → 승인 시 계속

### Agent Presets

```typescript
interface AgentPreset {
  id: string;
  name: string;
  systemPrompt: string;
  enabledTools: string[];
  model?: string;
}
```

- `data/presets/` JSON 저장
- 기본 3개: 코딩, 리서치, 일반
- 설정 패널 드롭다운

### Custom Tool Registration

- HTTP 엔드포인트 기반 도구 정의 (이름, URL, 파라미터 스키마)
- `data/custom-tools.json` 저장
- `init.ts`에서 레지스트리 등록

### MCP Server Integration

- `data/mcp-servers.json` 서버 목록
- `lib/mcp/client.ts`: stdio/SSE 연결, 도구 조회/실행
- 도구 레지스트리에 동적 추가
- 설정 패널 MCP 관리 UI

---

## Section 3: UX Improvement

### Message Edit/Regenerate

- `MessageBubble` hover 시 편집/재생성 버튼
- 편집: inline 수정 → 이후 대화 삭제 → 재전송
- 재생성: 마지막 assistant 삭제 → 재전송
- `useChat`에 `editMessage()`, `regenerate()` 추가

### Dark/Light Theme

- `data-theme` 어트리뷰트 기반 CSS 변수
- `useTheme` 훅: localStorage + system preference
- 헤더 토글 아이콘
- 라이트 모드 CSS 변수 정의

### Responsive Mobile

- 사이드바: 모바일 오버레이 (`md:` breakpoint)
- 입력: 모바일 키보드 대응
- 설정: 모바일 풀스크린 모달
- 터치 제스처: 스와이프 사이드바
