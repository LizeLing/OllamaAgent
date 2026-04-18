# Task Mode 사용 가이드

Task Mode는 장기 코딩 작업을 **Task 상태**로 보존하고 여러 세션에 걸쳐 이어가는 실행 모드다. 일반 Chat Mode(대화 중심)와 달리, 세션이 끝나도 **Task State + Checkpoint**가 정본으로 남아 다음 세션에서 전체 transcript 없이 재개할 수 있다.

> 설계 상세: [`docs/plans/2026-04-19-task-mode-design.md`](../plans/2026-04-19-task-mode-design.md)

## 언제 Task Mode를 쓰는가

- 여러 파일을 수정해야 하고 한 세션에 다 못 끝낼 때
- 작업을 Epic / Task / SubTask 구조로 분해하고 진행률을 추적하고 싶을 때
- 서브에이전트에게 Task를 위임하고 결과를 구조화된 형태로 받고 싶을 때
- 세션 간 재개가 필요할 때 (다음 날, 다른 기기에서 이어서)

짧은 질문, 단발성 도구 호출, 자유 대화는 **Chat Mode**를 그대로 쓴다.

## 사용법 1: UI (권장)

1. 사이드바 상단의 **Chats / Tasks** 탭에서 `Tasks` 선택
2. 채팅 입력창에 슬래시 명령어 입력:
   - `/task new <목표>` — 새 Task 생성. LLM이 Breakdown 엔진으로 Epic/Task/SubTask 초안을 만들어 `task.json` + `task.md`로 저장
   - `/task open <taskId>` — 기존 Task 재개. Resume context가 system prompt에 주입되어 이어서 대화
   - `/task checkpoint` — 현재 Task 상태로 checkpoint 생성 (세션 중단 전에 찍어두면 재개 편함)
   - `/task replan` — Breakdown 재조정 (기존 Task ID 최대한 유지)
   - `/task done` — Task 종료 (status: done)
3. Tasks 탭의 Task 목록에서 아이템 클릭 → TaskDetail에서 Epic/Task/SubTask 진행률 확인

## 사용법 2: REST API (스크립트/자동화)

### Task 생성

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "사용자 입력 기반 간단한 계산기 모듈을 만들고 테스트 추가",
    "constraints": ["src/calculator.ts 한 파일로 제한", "테스트는 vitest"],
    "model": "gemma4:26b"
  }'
# 201 { id, title, epics, tasks, ... }
```

`model` 필드는 선택. 생략하면 `settings.json`의 `ollamaModel` 사용. 모델 미설치 시 404가 반환되므로 `curl http://localhost:11434/api/tags`로 먼저 확인.

### 목록/상세 조회

```bash
curl http://localhost:3000/api/tasks
curl http://localhost:3000/api/tasks/<taskId>
```

### Task 실행 (SSE 스트리밍)

```bash
curl -N -X POST http://localhost:3000/api/tasks/<taskId>/execute \
  -H "Content-Type: application/json" -d '{}'
```

이벤트 순서:

```
task_pick          → Coordinator가 다음 TaskItem 선택
subagent_start     → Sub-agent(coder/researcher/analyst/verifier/planner) 기동
subagent_tool_*    → 도구 호출 (filesystem_write, webSearch 등)
subagent_thinking_token → 모델 reasoning 스트림 (있을 때만)
subagent_token     → 모델 응답 토큰 스트림
subagent_end       → Sub-agent 종료
subagent_done      → payload.workerResult 포함
task_update        → TaskItem 상태 갱신 (completed/blocked/failed)
done               → 이번 execute 요청 종료
```

한 번의 execute 호출은 **한 개 TaskItem**만 처리한다. 다음 TaskItem을 돌리려면 execute를 다시 호출. 모든 의존성이 해제된 item이 없으면 `task_idle` 이벤트가 나오고 바로 `done`.

### Checkpoint 생성 / 목록

```bash
# 생성
curl -X POST http://localhost:3000/api/tasks/<taskId>/checkpoint
# 201 { id, summary, completedTaskIds, nextActions, markdownPath, ... }

# 목록
curl http://localhost:3000/api/tasks/<taskId>/checkpoint
```

Checkpoint는 `data/tasks/<taskId>/checkpoints/<cpId>.json` + `.md` 두 파일로 동시 저장된다.

### Resume Context

```bash
curl -X POST http://localhost:3000/api/tasks/<taskId>/resume \
  -H "Content-Type: application/json" -d '{}'
# 200 { taskId, checkpointId, systemPrompt, userMessage, metadata }
```

옵션:

```json
{ "options": { "includeMemory": true, "includeKnowledge": true } }
```

기본값은 둘 다 `false`. 활성화하면 memory/knowledge 검색 결과를 metadata에 포함한다.

### Chat Mode에서 Task 제어 (SSE)

`/api/chat`은 `taskMode: 'task'`를 받으면 Task 명령어 분기로 흐른다:

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [],
    "taskMode": "task",
    "command": "new",
    "goal": "목표..."
  }'
# SSE: task_created → done
```

`command`: `new` | `open` | `checkpoint` | `execute`. UI의 `/task` 슬래시 명령어가 내부적으로 이 경로를 호출한다.

## writeScope 제한 (중요)

각 `TaskItem.writeScope`는 **서브에이전트가 filesystem 도구로 쓸 수 있는 경로**를 제한한다. Breakdown 엔진이 자동 설정하고, 필요하면 `task.json`을 직접 편집해 조정 가능.

**중요한 이중 제한**:

1. writeScope에 명시된 경로에만 write 허용 (matches glob)
2. **프로젝트 cwd 하위 경로만 허용** — `/tmp/...` 같은 시스템 절대경로는 writeScope에 포함되어 있어도 "writeScope 밖 (cwd 바깥)" 에러로 차단됨

따라서 격리 샌드박스가 필요하면 프로젝트 내 경로(예: `sandbox/`, `build/`, `tmp/`)를 쓰자. 이는 안전측 기본값으로, 서브에이전트가 사용자 시스템의 임의 경로를 조작하지 못하게 한다.

## 저장 구조

```
data/tasks/<taskId>/
├── task.json          # 기계용 정본 (TaskRecord)
├── task.md            # 사람이 읽는 요약 (Goal / Epics / Tasks / ...)
├── runs/
│   └── <runId>.json   # 세션 실행 기록 (TaskRun)
├── checkpoints/
│   ├── <cpId>.json    # 구조화 체크포인트
│   └── <cpId>.md      # handoff 문서
└── artifacts/         # 산출물 (현재 비어 있음)
```

`task.md`만 편집하면 재개 시 무시된다. 정본은 `task.json`이다.

## Sub-agent WorkerResult 포맷

Task Mode에서 서브에이전트는 작업 후 반드시 `<worker-result>` 태그로 구조화된 결과를 반환해야 한다:

```xml
<worker-result>
{
  "taskId": "ti_...",
  "status": "completed" | "blocked" | "failed",
  "summary": "한 줄 요약",
  "completedSubtaskIds": ["st_..."],
  "changedFiles": ["sandbox/foo.ts"],
  "blocker": "blocked일 때만 채움",
  "followupSuggestions": []
}
</worker-result>
```

파싱 실패 시 `{ status: 'completed', summary: rawText, ...empty }`로 fallback. 이 구조는 Coordinator.integrateWorkerResult가 TaskItem 상태로 반영한다.

## 명령어 요약

| 명령어 | 설명 |
|--------|------|
| `/task new <goal>` | 새 Task 생성 + breakdown |
| `/task open <taskId>` | 기존 Task 재개 (resume context) |
| `/task checkpoint` | 현재 상태 checkpoint |
| `/task replan` | breakdown 재조정 |
| `/task done` | Task 종료 |
| `/task execute` | 다음 TaskItem 실행 (UI에서 버튼으로도 가능) |

## 흔한 실수

- **writeScope에 절대경로(/tmp 등)를 넣으면 차단됨** → 프로젝트 cwd 하위 경로 사용
- **같은 TaskItem을 여러 번 execute** → Coordinator는 status로 필터링하니 문제 없지만, 중복 실행을 원하면 status를 `todo`로 직접 되돌려야 함
- **`task.md`를 직접 편집 후 재개 기대** → 정본은 `task.json`. md는 읽기용 렌더
- **큰 Ollama 모델 + tool use 미지원 모델** → Breakdown/Execute에서 JSON 출력 파싱 실패 가능. `gemma4:26b`, `qwen3.6:35b` 같은 tool-capable 모델 권장

## 통합 테스트

Task Mode 전체 흐름은 다음 테스트로 자동 검증된다:

- `src/lib/tasks/__tests__/task-mode.integration.test.ts` — breakdown → save → pick → integrate → checkpoint → resume 6 시나리오
- `src/app/api/tasks/__tests__/execute-sse.integration.test.ts` — execute API SSE 이벤트 순서

```bash
pnpm test:integration
```
