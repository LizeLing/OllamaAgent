# Phase 5: UX 개선 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 6~10번 UX 개선 사항을 구현하여 사용자 경험을 향상시킨다.

**Architecture:** 3개 에이전트로 병렬 처리. Agent A는 백엔드(6번 컨텍스트 관리), Agent B는 채팅 UX(7,8번), Agent C는 사이드바+설정(9,10번).

**Tech Stack:** Next.js 16, TypeScript, React 19, Tailwind CSS 4

---

## Agent A: 백엔드 - 컨텍스트 윈도우 관리 (Task 6)

### Task 6: 대화 컨텍스트 윈도우 관리

**Files:**
- Modify: `src/lib/agent/agent-loop.ts:24-28`
- Modify: `src/lib/agent/types.ts` (AgentConfig에 contextWindow 추가)
- Modify: `src/app/api/chat/route.ts:51-76` (contextWindow 전달)

**문제:** 전체 대화 히스토리를 Ollama에 무조건 전송하여 모델 컨텍스트 초과 시 오류 또는 무한 대기 발생. Qwen3.5:9b의 기본 컨텍스트는 약 32K 토큰.

**해결:** 히스토리를 최근 메시지 기준으로 트리밍하는 간단한 전략 적용. 글자 수 기반으로 근사 계산 (한국어 1글자 ≈ 2~3 토큰, 영어 1단어 ≈ 1.5 토큰 → 평균 1글자 ≈ 2 토큰으로 추정).

**Step 1: agent-loop.ts에 히스토리 트리밍 함수 추가**

`src/lib/agent/agent-loop.ts` 파일 끝(splitIntoChunks 뒤)에 함수 추가:

```typescript
function trimHistory(
  history: { role: string; content: string }[],
  maxChars: number
): { role: string; content: string }[] {
  let totalChars = 0;
  const result: { role: string; content: string }[] = [];

  // Keep most recent messages first
  for (let i = history.length - 1; i >= 0; i--) {
    const msgChars = history[i].content.length;
    if (totalChars + msgChars > maxChars && result.length > 0) break;
    totalChars += msgChars;
    result.unshift(history[i]);
  }

  return result;
}
```

**Step 2: agent-loop.ts에서 messages 조립 시 trimHistory 적용**

`src/lib/agent/agent-loop.ts` 24~28행을 수정:

```typescript
  // Before:
  const messages: OllamaChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    userMsg,
  ];

  // After:
  // Trim history to fit context window (~16K chars ≈ 32K tokens)
  const maxHistoryChars = 16000;
  const trimmedHistory = trimHistory(history, maxHistoryChars);

  const messages: OllamaChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    userMsg,
  ];
```

**Step 3: 커밋**

```bash
git add src/lib/agent/agent-loop.ts
git commit -m "feat: 대화 히스토리 컨텍스트 트리밍 추가

긴 대화에서 모델 컨텍스트 윈도우 초과 방지.
최근 메시지 우선으로 16K 글자(~32K 토큰) 이내로 트리밍."
```

---

## Agent B: 채팅 UX 개선 (Task 7, 8)

### Task 7: 스트리밍 중단 표시

**Files:**
- Modify: `src/hooks/useChat.ts:117-131` (abort 시 메시지에 중단 플래그 추가)
- Modify: `src/types/message.ts` (aborted 필드 추가)
- Modify: `src/components/chat/MessageBubble.tsx` (중단 UI 추가)

**문제:** Stop/ESC로 생성을 중단하면 부분 응답이 남지만, 중단되었다는 시각적 표시가 없음.

**Step 1: message.ts에 aborted 필드 추가**

`src/types/message.ts` Message 인터페이스에 추가:

```typescript
  aborted?: boolean;
```

**Step 2: useChat.ts에서 abort 시 메시지에 aborted 플래그 설정**

`src/hooks/useChat.ts` 117~131행, catch 블록에서 AbortError 처리를 수정:

```typescript
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Mark message as aborted
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, aborted: true } : m
          )
        );
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, error: msg }
            : m
        )
      );
    } finally {
```

**Step 3: MessageBubble.tsx에 중단 표시 UI 추가**

`src/components/chat/MessageBubble.tsx`에서, 어시스턴트 메시지의 에러 UI 블록(`{!isUser && message.error && (`) 바로 앞에 중단 표시 추가:

```tsx
        {!isUser && message.aborted && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            </svg>
            <span>응답이 중단되었습니다</span>
          </div>
        )}
```

**Step 4: 커밋**

```bash
git add src/types/message.ts src/hooks/useChat.ts src/components/chat/MessageBubble.tsx
git commit -m "feat: 스트리밍 중단 시 '응답이 중단되었습니다' 표시 추가

Stop/ESC로 생성 중단 시 부분 응답에 시각적 표시를 추가하여
사용자가 응답이 완료된 것인지 중단된 것인지 구분 가능."
```

---

### Task 8: 시작 화면 추천 프롬프트

**Files:**
- Modify: `src/components/chat/MessageList.tsx:18-28` (빈 화면 대체)

**문제:** 빈 채팅 화면이 "무엇이든 물어보세요"만 표시. 새 사용자가 어떤 기능이 있는지 알기 어려움.

**Step 1: MessageList.tsx의 빈 화면을 추천 프롬프트 카드로 교체**

`src/components/chat/MessageList.tsx` 전체를 교체:

```tsx
'use client';

import { Message } from '@/types/message';
import MessageBubble from './MessageBubble';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
  onSend?: (content: string) => void;
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

export default function MessageList({ messages, isLoading, onEdit, onRegenerate, onSend }: MessageListProps) {
  const { ref } = useAutoScroll<HTMLDivElement>(messages);

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

  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {messages.map((message, idx) => (
          <MessageBubble
            key={message.id}
            message={message}
            onEdit={onEdit}
            onRegenerate={onRegenerate}
            onRetry={onRegenerate}
            isLast={idx === messages.length - 1}
          />
        ))}
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

핵심 변경:
- `onSend` prop 추가 (추천 프롬프트 클릭 시 메시지 전송)
- `SUGGESTIONS` 배열: 4개 추천 카드 (코드 작성, 파일 분석, 웹 검색, 문제 풀기)
- 2열 그리드 레이아웃, 호버 효과

**Step 2: ChatContainer.tsx에서 MessageList에 onSend 전달**

`src/components/chat/ChatContainer.tsx` 275행에서 MessageList props에 `onSend` 추가:

```tsx
        {/* Before: */}
        <MessageList messages={messages} isLoading={isLoading} onEdit={editMessage} onRegenerate={regenerate} />

        {/* After: */}
        <MessageList messages={messages} isLoading={isLoading} onEdit={editMessage} onRegenerate={regenerate} onSend={(msg) => handleSend(msg)} />
```

**Step 3: 커밋**

```bash
git add src/components/chat/MessageList.tsx src/components/chat/ChatContainer.tsx
git commit -m "feat: 시작 화면에 추천 프롬프트 카드 4개 추가

빈 채팅 화면에 코드 작성/파일 분석/웹 검색/문제 풀기 추천 카드 표시.
클릭 시 즉시 해당 프롬프트로 대화 시작."
```

---

## Agent C: 사이드바 + 설정 UX 개선 (Task 9, 10)

### Task 9: 메시지 타임스탬프 표시

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx` (타임스탬프 표시 추가)

**문제:** 메시지에 `timestamp` 필드가 있지만 UI에 표시되지 않아 언제 대화했는지 알 수 없음.

**Step 1: MessageBubble.tsx에 타임스탬프 표시 추가**

`src/components/chat/MessageBubble.tsx`에서 메시지 버블 내부, action buttons 바로 앞에 타임스탬프를 추가합니다.

사용자 메시지의 경우, 편집 버튼 영역(`{isUser && !isEditing && (`)의 div 안에 타임스탬프를 추가:

기존 `{isUser && !isEditing && (` 블록을 다음으로 교체:

```tsx
        {isUser && !isEditing && (
          <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
            <span className="text-[10px] text-white/40">{formatTime(message.timestamp)}</span>
            <button onClick={() => { setEditContent(message.content); setIsEditing(true); }} className="p-1 text-white/60 hover:text-white" title="편집">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        )}
```

어시스턴트 메시지의 action buttons(`{!isUser && message.content && (`) div 안, AudioPlayer 앞에 타임스탬프 추가:

기존 `{!isUser && message.content && (` 블록을 다음으로 교체:

```tsx
        {!isUser && message.content && (
          <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <span className="text-[10px] text-muted mr-1">{formatTime(message.timestamp)}</span>
            <AudioPlayer
              isSpeaking={isSpeaking}
              onSpeak={() => speak(message.content)}
              onStop={stopSpeaking}
            />
            {/* Copy button */}
            <button onClick={handleCopy} className="p-1 text-muted hover:text-foreground" title="복사">
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
            {isLast && onRegenerate && (
              <button onClick={onRegenerate} className="p-1 text-muted hover:text-foreground" title="재생성">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            )}
          </div>
        )}
```

그리고 컴포넌트 상단 (export default 앞)에 formatTime 헬퍼 함수 추가:

```typescript
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;

  const dateStr = date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  return `${dateStr} ${time}`;
}
```

**Step 2: 커밋**

```bash
git add src/components/chat/MessageBubble.tsx
git commit -m "feat: 메시지 호버 시 타임스탬프 표시

오늘 메시지는 시간만(오후 3:42), 이전 메시지는 날짜+시간(3월 5일 오후 3:42) 표시.
사용자/어시스턴트 메시지 모두 호버 시 표시."
```

---

### Task 10: 폴더 컬러 피커

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx:166-182` (새 폴더 입력 UI에 컬러 피커 추가)
- Modify: `src/components/sidebar/FolderGroup.tsx` (폴더 색상 변경 지원)

**문제:** 폴더 생성 시 색상이 `#6366f1`(indigo)로 고정. `FolderMeta.color` 필드가 있지만 UI에서 색상을 선택할 수 없음.

**Step 1: Sidebar.tsx의 새 폴더 입력에 컬러 피커 추가**

먼저 `src/components/sidebar/Sidebar.tsx`에 FOLDER_COLORS 상수와 state 추가:

컴포넌트 내부(fileInputRef 선언 뒤)에 추가:

```typescript
  const [newFolderColor, setNewFolderColor] = useState('#6366f1');
```

FOLDER_COLORS 상수를 컴포넌트 밖(SidebarProps 인터페이스 앞)에 추가:

```typescript
const FOLDER_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
];
```

`handleCreateFolder`를 수정:

```typescript
  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      onCreateFolder(trimmed, newFolderColor);
      setNewFolderName('');
      setNewFolderColor('#6366f1');
      setShowNewFolder(false);
    }
  };
```

새 폴더 입력 UI(`{showNewFolder && (`)를 교체:

```tsx
        {showNewFolder && (
          <div className="px-3 py-2 border-b border-border space-y-2">
            <div className="flex gap-2">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') setShowNewFolder(false);
                }}
                placeholder="폴더 이름..."
                className="flex-1 text-sm bg-card text-foreground placeholder:text-muted rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent border border-border"
                autoFocus
              />
              <button onClick={handleCreateFolder} className="text-xs text-accent hover:text-accent-hover">생성</button>
              <button onClick={() => setShowNewFolder(false)} className="text-xs text-muted hover:text-foreground">취소</button>
            </div>
            <div className="flex gap-1.5">
              {FOLDER_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewFolderColor(color)}
                  className={`w-5 h-5 rounded-full transition-all ${
                    newFolderColor === color ? 'ring-2 ring-offset-1 ring-offset-background ring-accent scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
```

**Step 2: 커밋**

```bash
git add src/components/sidebar/Sidebar.tsx
git commit -m "feat: 폴더 생성 시 컬러 피커 추가

8가지 프리셋 색상(indigo, pink, amber, emerald, blue, red, violet, cyan)에서 선택.
선택된 색상은 링 표시로 구분."
```

---

## 에이전트 구성

| 에이전트 | 작업 | 파일 |
|----------|------|------|
| **Agent A** (백엔드) | Task 6 | agent-loop.ts |
| **Agent B** (채팅 UX) | Task 7, 8 | useChat.ts, message.ts, MessageBubble.tsx (aborted만), MessageList.tsx, ChatContainer.tsx |
| **Agent C** (사이드바+설정) | Task 9, 10 | MessageBubble.tsx (timestamp만), Sidebar.tsx |

**파일 충돌 주의:**
- `MessageBubble.tsx`를 Agent B(aborted 표시)와 Agent C(timestamp) 모두 수정함
- Agent B는 aborted UI를 error UI 앞에 추가하고, Agent C는 action buttons에 timestamp를 추가하므로 수정 위치가 다름
- 단, 안전을 위해 **Agent B가 먼저 완료**된 후 Agent C가 MessageBubble.tsx를 수정하도록 순서 조정 필요
- **Agent A와 Agent C는 Agent B와 독립적이므로 병렬 실행 가능**

실행 순서:
1. Agent A + Agent C(Task 10만 먼저) 병렬 시작
2. Agent B 완료 후 Agent C가 Task 9 수행
3. 또는: Agent B와 Agent C를 모두 병렬 실행하되, 충돌 발생 시 수동 merge
