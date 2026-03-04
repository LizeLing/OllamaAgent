# Phase 2 기능 확장 설계

## 목표
3개 기능 추가: (1) Thinking 토큰 스트리밍 표시, (2) 대화 폴더/태그/고정, (3) 모델 파라미터 조정 UI

---

## 기능 1: Thinking 토큰 스트리밍 표시

### 배경
qwen3.5 모델은 thinking 모드를 지원하며, `think: true` 시 thinking 토큰을 별도 필드로 전달. 현재 agent-loop에서 `think: false`로 비활성화 중.

### 설계
- **agent-loop**: 최종 응답 스트리밍 시 `think: true`로 변경. tool 판단용 non-streaming call은 `think: false` 유지
- **SSE 이벤트**: `thinking_token` 이벤트 타입 추가 (기존 `token`과 구분)
- **Message 타입**: `thinkingContent?: string` 필드 추가
- **useChat**: `handleSSEEvent`에서 `thinking_token` → `thinkingContent` 누적
- **MessageBubble**: 접이식 토글 UI. 기본 접힘, 소요 시간 표시

### 변경 파일
- `src/lib/ollama/types.ts` - OllamaChatStreamChunk에 thinking 필드 추가
- `src/lib/agent/agent-loop.ts` - 최종 응답 스트리밍에 think: true, thinking_token 이벤트 yield
- `src/lib/agent/types.ts` - AgentEvent에 thinking_token 타입 추가
- `src/types/message.ts` - Message에 thinkingContent 필드 추가
- `src/hooks/useChat.ts` - handleSSEEvent에 thinking_token 케이스 추가
- `src/components/chat/MessageBubble.tsx` - ThinkingToggle UI 추가

---

## 기능 2: 대화 폴더/태그/고정

### 배경
현재 대화는 flat list로 updatedAt 기준 정렬. 대화가 많아지면 관리 어려움.

### 설계
- **ConversationMeta 확장**: `folderId?: string`, `tags?: string[]`, `pinned?: boolean`
- **FolderMeta 타입**: `{ id: string, name: string, color: string, order: number }`
- **저장소**: `data/folders.json` 파일에 폴더 목록 저장
- **Sidebar 구조**: 고정 대화 → 폴더별 그룹 (접이식) → 미분류
- **태그**: 대화 아이템에 칩 표시, 검색 시 태그 필터링

### API
- `GET/POST /api/folders` - 폴더 목록/생성
- `PUT/DELETE /api/folders/[id]` - 폴더 수정/삭제
- `PUT /api/conversations/[id]` - 기존 PUT에 folderId, tags, pinned 지원 (이미 spread로 처리)

### 변경 파일
- `src/types/conversation.ts` - ConversationMeta에 folderId, tags, pinned 추가
- `src/types/folder.ts` - FolderMeta 타입 신규
- `src/lib/conversations/folders.ts` - 폴더 CRUD 저장소
- `src/app/api/folders/route.ts` - 폴더 API
- `src/app/api/folders/[id]/route.ts` - 개별 폴더 API
- `src/hooks/useConversations.ts` - 폴더/태그/핀 관련 함수 추가
- `src/components/sidebar/Sidebar.tsx` - 폴더별 그룹, 핀 섹션, 태그 칩
- `src/components/sidebar/ConversationItem.tsx` - 태그 칩, 핀 아이콘, 폴더 이동
- `src/components/sidebar/FolderGroup.tsx` - 접이식 폴더 그룹 컴포넌트

---

## 기능 3: 모델 파라미터 조정 UI

### 배경
`OllamaChatRequest.options`에 temperature 등 전달 타입은 있으나 UI 미제공.

### 설계
- **Settings 확장**: `modelOptions: { temperature: number, topP: number, numPredict: number }`
- **기본값**: temperature 0.7, topP 0.9, numPredict 2048
- **UI**: 설정 패널에 슬라이더 3개 (레이블 + 값 + 범위 바)
- **전달 경로**: Settings → chat route → AgentConfig → agent-loop → chat() options

### 파라미터 범위
| 파라미터 | 범위 | 기본값 | 스텝 |
|---------|------|--------|------|
| temperature | 0 ~ 2 | 0.7 | 0.1 |
| top_p | 0 ~ 1 | 0.9 | 0.05 |
| max tokens | 256 ~ 8192 | 2048 | 256 |

### 변경 파일
- `src/types/settings.ts` - ModelOptions 인터페이스, Settings에 modelOptions 추가
- `src/lib/config/constants.ts` - DEFAULT_SETTINGS에 modelOptions 기본값
- `src/lib/agent/types.ts` - AgentConfig에 modelOptions 추가
- `src/lib/agent/agent-loop.ts` - chat() 호출 시 options 전달
- `src/app/api/chat/route.ts` - settings.modelOptions를 agent config에 전달
- `src/components/settings/SettingsPanel.tsx` - 슬라이더 UI 추가
- `src/components/settings/ModelOptionsSliders.tsx` - 슬라이더 컴포넌트

---

## 에이전트 팀 구성

3개 기능이 독립적이므로 병렬 작업 가능:
- **Agent A**: 기능 1 (Thinking 토큰) - agent-loop + SSE + UI
- **Agent B**: 기능 2 (폴더/태그/고정) - 타입 + API + Sidebar UI
- **Agent C**: 기능 3 (모델 파라미터) - Settings 확장 + 슬라이더 UI
