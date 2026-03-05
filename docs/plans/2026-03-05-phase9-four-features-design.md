# Phase 9: 4가지 기능 설계서

> 날짜: 2026-03-05
> 기능: 채팅 명령어 시스템, 모델 Failover, Webhook 트리거, 도구 루프 감지

---

## 1. 채팅 명령어 시스템

### 1.1 개요

채팅 입력에서 `/`로 시작하는 명령어를 인식하여 빠른 조작을 제공한다.
클라이언트 전용 명령어와 서버 위임 명령어를 하이브리드로 처리한다.

### 1.2 아키텍처

```
ChatInput (/ 입력 감지)
  |
  +-- 자동완성 드롭다운 표시
  |
  +-- Enter 시 명령어 파싱
       |
       +-- 클라이언트 명령어 --> ChatContainer 콜백 직접 실행
       |
       +-- 서버 명령어 -------> 전용 API 호출 후 결과 표시
```

### 1.3 신규 파일

- `src/lib/commands/registry.ts` — 명령어 등록, 파싱, 자동완성 검색
- `src/lib/commands/definitions.ts` — 전체 명령어 정의 (이름, 설명, 인자, 타입)

### 1.4 수정 파일

- `src/components/chat/ChatInput.tsx` — `/` 감지, 자동완성 UI, 명령어 분기
- `src/components/chat/ChatContainer.tsx` — 클라이언트 명령어 핸들러 연결
- `src/hooks/useChat.ts` — 서버 명령어 결과를 시스템 메시지로 표시

### 1.5 명령어 정의

```typescript
interface CommandDefinition {
  name: string;           // '/new'
  description: string;    // '새 대화 시작'
  args?: CommandArg[];    // 선택적 인자
  type: 'client' | 'server';
  execute?: (ctx: CommandContext) => void;  // 클라이언트 명령어용
  endpoint?: string;      // 서버 명령어용 API 경로
}

interface CommandArg {
  name: string;
  description: string;
  required: boolean;
  choices?: string[];     // 자동완성용
}

interface CommandContext {
  // 클라이언트 명령어가 접근하는 컨텍스트
  clearMessages: () => void;
  setActiveId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedModel: (model: string | null) => void;
  availableModels: string[];
  activeId: string | null;
  addSystemMessage: (content: string) => void;
}
```

#### 클라이언트 명령어

| 명령어 | 인자 | 동작 |
|--------|------|------|
| `/new` | - | clearMessages() + setActiveId(null) |
| `/clear` | - | clearMessages() |
| `/model` | `<name>` | setSelectedModel(name), choices=availableModels |
| `/help` | - | addSystemMessage(명령어 목록) |
| `/stats` | - | addSystemMessage(토큰 사용량, 메시지 수 등) |

#### 서버 명령어

| 명령어 | 인자 | API | 동작 |
|--------|------|-----|------|
| `/export` | `[format]` | GET /api/conversations/[id]/export | 대화 내보내기 |
| `/system` | `<prompt>` | PUT /api/settings | 시스템 프롬프트 변경 |
| `/compact` | - | POST /api/conversations/[id]/compact (신규) | 컨텍스트 요약 |

### 1.6 자동완성 UI

- ChatInput에서 입력값이 `/`로 시작하면 드롭다운 표시
- 입력에 따라 필터링 (예: `/mo` -> `/model`)
- 화살표 키로 탐색, Enter로 선택, Escape로 닫기
- 선택 시 명령어 이름 + 공백 자동 입력 (인자가 있는 경우)

### 1.7 결과 표시

명령어 실행 결과는 대화에 시스템 메시지로 표시한다.
```typescript
// useChat에 추가
function addSystemMessage(content: string) {
  const msg: Message = {
    id: uuidv4(),
    role: 'system',
    content,
    timestamp: Date.now(),
  };
  setMessages(prev => [...prev, msg]);
}
```

---

## 2. 모델 Failover (Ollama 내 모델 간)

### 2.1 개요

기본 모델이 실패하면 설정된 fallback 모델 목록에서 순서대로 시도한다.
Ollama 프로바이더 내에서만 작동하며, 모델 관련 에러에만 failover한다.

### 2.2 아키텍처

```
chat() 호출
  |
  +-- 기본 모델 시도
  |     |
  |     +-- 성공 --> 결과 반환
  |     |
  |     +-- 모델 에러 (404, 로드 실패)
  |           |
  |           +-- fallbackModels[0] 시도
  |           |     |
  |           |     +-- 성공 --> 결과 반환 + model_fallback 이벤트
  |           |     +-- 실패 --> fallbackModels[1] 시도 ...
  |           |
  |           +-- 모든 모델 실패 --> 에러 반환
  |
  +-- 네트워크 에러 --> 기존 fetchWithRetry 로직
```

### 2.3 신규 파일

- `src/lib/ollama/failover.ts` — failover 로직

### 2.4 수정 파일

- `src/lib/ollama/client.ts` — chatWithFailover() 래퍼 추가
- `src/lib/agent/agent-loop.ts` — chatWithFailover 사용
- `src/types/settings.ts` — fallbackModels 필드 추가
- `src/lib/config/constants.ts` — 기본값 추가
- `src/components/settings/SettingsPanel.tsx` — Fallback 모델 목록 UI

### 2.5 타입 정의

```typescript
// settings.ts에 추가
interface Settings {
  // ... 기존 필드
  fallbackModels: string[];  // 우선순위 순서
}

// failover.ts
interface FailoverResult<T> {
  result: T;
  usedModel: string;       // 실제 사용된 모델
  failedModels: string[];  // 실패한 모델 목록
}
```

### 2.6 Failover 조건

failover를 트리거하는 에러:
- HTTP 404 (모델 없음)
- Ollama 모델 로드 실패 메시지
- 모델 메모리 부족 에러

failover하지 않는 에러 (기존 재시도 로직 사용):
- 네트워크 연결 실패 (Ollama 서버 다운)
- 타임아웃
- 잘못된 요청 (400)

### 2.7 SSE 이벤트

```
event: model_fallback
data: {"originalModel":"qwen3","usedModel":"llama3","reason":"model not found"}
```

클라이언트에서 이 이벤트를 받으면 토스트로 "모델이 qwen3에서 llama3으로 전환되었습니다" 알림.

---

## 3. Webhook 트리거 (API 키 인증)

### 3.1 개요

외부 서비스가 HTTP POST로 에이전트를 실행할 수 있는 엔드포인트를 제공한다.
API 키 기반 인증으로 보호한다.

### 3.2 아키텍처

```
외부 서비스 (GitHub, Zapier 등)
  |
  POST /api/webhooks
  Authorization: Bearer <api-key>
  |
  +-- API 키 검증
  |
  +-- 설정 로드 + 도구 초기화
  |
  +-- runAgentLoop() 실행
  |
  +-- 응답 방식 선택
       |
       +-- 동기: JSON 결과 직접 반환
       |
       +-- 비동기: callbackUrl로 POST
```

### 3.3 신규 파일

- `src/app/api/webhooks/route.ts` — POST: 트리거 실행
- `src/app/api/webhooks/keys/route.ts` — GET/POST/DELETE: API 키 관리
- `src/lib/webhooks/auth.ts` — API 키 생성, 해싱, 검증
- `src/lib/webhooks/storage.ts` — 키 저장/로드 (data/webhook-keys.json)

### 3.4 수정 파일

- `src/components/settings/SettingsPanel.tsx` — Webhook 탭 추가
- `src/types/settings.ts` — webhook 관련 타입 (별도 저장이므로 최소 변경)

### 3.5 타입 정의

```typescript
// 요청
interface WebhookRequest {
  message: string;              // 필수: 프롬프트
  model?: string;               // 선택: 모델 오버라이드
  conversationId?: string;      // 선택: 기존 대화에 추가
  callbackUrl?: string;         // 선택: 비동기 결과 전송
  systemPrompt?: string;        // 선택: 프롬프트 오버라이드
}

// 동기 응답
interface WebhookResponse {
  success: boolean;
  response: string;             // 에이전트 최종 응답
  model: string;
  toolCalls: { tool: string; input: unknown; output: string }[];
  tokenUsage?: TokenUsage;
  conversationId?: string;
}

// API 키
interface WebhookApiKey {
  id: string;
  name: string;                 // 사용자 지정 라벨
  keyHash: string;              // SHA-256 해시 (원본 저장 안 함)
  keyPrefix: string;            // 'oa_xxxx' 앞 8자 (식별용)
  createdAt: number;
  lastUsedAt?: number;
}
```

### 3.6 API 키 관리

- 생성 시 `oa_` 접두사 + 32바이트 랜덤 = `oa_abc123...` 형태
- 원본 키는 생성 직후 한 번만 표시, 이후 해시만 저장
- 키별 이름(라벨) 지정 가능
- 최대 10개 키 제한

### 3.7 보안

- 속도 제한: IP당 10req/min
- 요청 본문 크기 제한: 10KB
- message 필수 검증, 길이 제한 (10,000자)
- callbackUrl은 HTTPS만 허용, 내부 IP 차단 (기존 SSRF 방어 재사용)

### 3.8 Webhook 설정 UI

SettingsPanel에 "Webhook" 섹션 추가:
- API 키 목록 (이름, 접두사, 생성일, 마지막 사용일)
- "새 키 생성" 버튼 → 모달에 원본 키 표시 (복사 버튼)
- 키 삭제 버튼

---

## 4. 도구 루프 감지 + 컨텍스트 주입

### 4.1 개요

에이전트 루프 내에서 동일 도구+입력의 반복 호출을 감지한다.
2회 반복 시 LLM에 컨텍스트를 주입하여 방향 전환을 유도하고,
3회 반복 시 루프를 강제 종료한다.

### 4.2 아키텍처

```
agent-loop 반복
  |
  +-- 도구 호출 요청
  |
  +-- ToolCallTracker.check(toolName, args)
       |
       +-- 해시 계산: SHA-256(toolName + JSON.stringify(sortedArgs))
       |
       +-- 호출 횟수 확인
            |
            +-- 1회째: 정상 실행, 결과 캐시
            |
            +-- 2회째: 캐시 결과 반환 + LLM 메시지 주입
            |   "이 도구를 동일 입력으로 이미 호출했습니다.
            |    결과: [캐시 결과]. 다른 접근을 시도하세요."
            |
            +-- 3회째: 루프 강제 종료
                yield { type: 'loop_detected', ... }
```

### 4.3 신규 파일

- `src/lib/agent/tool-call-tracker.ts` — 호출 추적, 중복 감지, 캐시

### 4.4 수정 파일

- `src/lib/agent/agent-loop.ts` — ToolCallTracker 통합
- `src/hooks/useChat.ts` — loop_detected SSE 이벤트 처리

### 4.5 타입 정의

```typescript
interface ToolCallRecord {
  hash: string;
  toolName: string;
  args: Record<string, unknown>;
  output: string;
  count: number;
  firstIteration: number;
}

type CheckResult =
  | { action: 'execute' }                           // 첫 호출
  | { action: 'inject'; cachedOutput: string }      // 2회 반복
  | { action: 'abort'; cachedOutput: string }        // 3회+ 반복

class ToolCallTracker {
  private records: Map<string, ToolCallRecord>;

  check(toolName: string, args: Record<string, unknown>): CheckResult;
  record(toolName: string, args: Record<string, unknown>, output: string): void;
  getPatternLoops(): boolean;  // A->B->A->B 패턴 감지
  reset(): void;
}
```

### 4.6 교차 패턴 감지

단순 동일 호출뿐 아니라 A->B->A->B 교차 반복도 감지한다.
최근 6회 호출 이력에서 길이 2-3의 반복 패턴을 검사한다.

```typescript
// 예: [read, write, read, write, read, write] → 패턴 감지
function detectRepeatingPattern(history: string[], windowSize: number = 6): boolean {
  // 최근 windowSize개에서 길이 2, 3의 부분 시퀀스 반복 확인
}
```

### 4.7 SSE 이벤트

```
event: loop_detected
data: {
  "toolName": "http_request",
  "count": 3,
  "message": "동일 도구 반복 호출이 감지되어 에이전트를 중단했습니다."
}
```

클라이언트에서 토스트 경고로 표시.

### 4.8 LLM 주입 메시지 형식

```
[시스템] 도구 반복 호출 감지: '{toolName}'을 동일한 입력으로 이미 호출했습니다.
이전 결과: {cachedOutput (최대 500자)}
동일한 도구 호출을 반복하지 말고 다른 접근 방식을 시도하세요.
```

이 메시지는 tool role 메시지로 히스토리에 추가되어 LLM이 인식하게 한다.

---

## 구현 순서

1. **도구 루프 감지** — 가장 독립적, agent-loop만 수정
2. **모델 Failover** — ollama 레이어 수정, agent-loop에 연결
3. **채팅 명령어 시스템** — 프론트엔드 중심 + 일부 API
4. **Webhook 트리거** — 신규 API 엔드포인트, 기존 코드 영향 최소

---

## 변경 영향 요약

| 영역 | 신규 파일 | 수정 파일 |
|------|----------|----------|
| 도구 루프 감지 | 1 | 2 |
| 모델 Failover | 1 | 5 |
| 채팅 명령어 | 2 | 3 |
| Webhook 트리거 | 4 | 2 |
| **합계** | **8** | **12** (중복 제거 시 ~9) |
