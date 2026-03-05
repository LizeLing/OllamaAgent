# Settings 탭 페이지 설계

## 개요

현재 740줄짜리 단일 스크롤 SettingsPanel을 5개 탭으로 분리하여 항목별로 정리한다.

## 탭 구성

| 탭 | ID | 아이콘 | 포함 항목 |
|---|---|---|---|
| 일반 | general | ⚙️ | 프리셋, System Prompt, 도구 승인 모드, SearXNG URL, TTS Voice, 설정 백업 |
| 모델 | model | 🤖 | Ollama URL, 모델 선택, Fallback 모델, 모델 파라미터, Max Iterations |
| 보안 | security | 🔒 | Allowed Paths, Denied Paths, Webhook API 키 |
| 확장 | extensions | 🧩 | 커스텀 도구, MCP 서버, 스킬, 서브에이전트 |
| 자동화 | automation | ⚡ | 이벤트 훅, 예약 작업(Cron) |

## 파일 구조

```
src/components/settings/
  SettingsPanel.tsx          -- 탭 바 + 탭 라우팅 + Save 버튼 (~100줄)
  tabs/
    GeneralTab.tsx           -- 프리셋, System Prompt, 도구 승인, SearXNG, TTS, 백업
    ModelTab.tsx             -- Ollama URL, 모델, Fallback, 파라미터, Max Iterations
    SecurityTab.tsx          -- Allowed/Denied Paths, Webhook API 키
    ExtensionsTab.tsx        -- 커스텀 도구, MCP 서버, 스킬, 서브에이전트
    AutomationTab.tsx        -- 이벤트 훅, 예약 작업
```

## 상태 관리

- SettingsPanel이 `draft` 상태와 `setDraft`를 소유
- 각 탭 컴포넌트는 공통 props 인터페이스를 받음:

```typescript
interface TabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
}
```

- Save 버튼은 SettingsPanel 하단에 고정 (모든 탭에서 공통)
- 탭 전환 시 draft 유지, 저장은 명시적 Save 클릭 시에만

## 탭 바 UI

- 수평 탭 바, 상단 고정
- 아이콘 + 텍스트, 선택 탭은 accent 색상 하단 보더
- 모바일: 아이콘만 표시, 텍스트 숨김 (sm breakpoint 이하)

## 탭 전환

```typescript
const TABS = [
  { id: 'general', label: '일반', icon: '⚙️' },
  { id: 'model', label: '모델', icon: '🤖' },
  { id: 'security', label: '보안', icon: '🔒' },
  { id: 'extensions', label: '확장', icon: '🧩' },
  { id: 'automation', label: '자동화', icon: '⚡' },
] as const;

type TabId = typeof TABS[number]['id'];
const [activeTab, setActiveTab] = useState<TabId>('general');
```

## 각 탭 세부

### GeneralTab
- 프리셋 선택기 (PresetSelector)
- 도구 승인 모드 (라디오 버튼 3개)
- System Prompt (SystemPromptEditor)
- SearXNG URL (input)
- TTS Voice (select, 자체 voices fetch)
- 설정 백업 (내보내기/가져오기 버튼)

### ModelTab
- Ollama URL (input)
- Model (select, 자체 models fetch)
- Fallback 모델 (정렬 가능 목록)
- Max Iterations (number input)
- 모델 파라미터 (ModelOptionsSliders)

### SecurityTab
- Allowed Paths (PathConfigEditor)
- Denied Paths (PathConfigEditor)
- Webhook API 키 (목록 + 생성 폼, 자체 webhookKeys fetch)

### ExtensionsTab
- 커스텀 도구 (CustomToolEditor, draft.customTools)
- MCP 서버 (McpServerManager, draft.mcpServers)
- 스킬 (SkillEditor, 독립)
- 서브에이전트 (정보 표시, 독립)

### AutomationTab
- 이벤트 훅 (EventHookEditor, 독립)
- 예약 작업 (CronJobEditor, 독립)
