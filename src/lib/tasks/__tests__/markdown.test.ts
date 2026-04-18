import { describe, it, expect } from 'vitest';
import {
  renderTaskMarkdown,
  renderCheckpointMarkdown,
} from '../markdown';
import type { TaskRecord, TaskCheckpoint } from '@/types/task';

function buildTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    title: '샘플 Task',
    goal: 'Task Mode 구현',
    mode: 'task',
    status: 'active',
    createdAt: Date.UTC(2026, 3, 19, 0, 0, 0),
    updatedAt: Date.UTC(2026, 3, 19, 1, 0, 0),
    acceptanceCriteria: ['조건 A', '조건 B'],
    epics: [
      {
        id: 'e1',
        title: '저장소 구축',
        description: 'Task 저장소 설계',
        status: 'in_progress',
        taskIds: ['t1'],
      },
    ],
    tasks: [
      {
        id: 't1',
        epicId: 'e1',
        title: '스토리지 구현',
        description: 'atomic + lock 기반 저장소',
        status: 'done',
        priority: 'high',
        size: 'M',
        dependsOn: [],
        definitionOfDone: ['lint 통과', '테스트 통과'],
        subtasks: [
          { id: 's1', text: '경로 검증', checked: true },
          { id: 's2', text: 'RMW 구현', checked: false },
        ],
      },
      {
        id: 't2',
        epicId: 'e1',
        title: 'Markdown 렌더러',
        description: '',
        status: 'in_progress',
        priority: 'medium',
        size: 'S',
        dependsOn: ['t1'],
        definitionOfDone: [],
        subtasks: [],
        writeScope: ['src/lib/tasks/*'],
        allowedTools: ['write'],
        owner: 'coder',
      },
    ],
    decisions: [
      {
        id: 'd1',
        createdAt: Date.UTC(2026, 3, 19, 0, 30, 0),
        summary: 'file-lock을 유지',
        rationale: '동시성 안전 확보',
      },
    ],
    changedFiles: ['src/types/task.ts'],
    openQuestions: ['작업자 수를 어떻게 결정할까?'],
    ...overrides,
  };
}

function buildCheckpoint(overrides: Partial<TaskCheckpoint> = {}): TaskCheckpoint {
  return {
    id: 'cp-1',
    taskId: 'task-1',
    runId: 'run-9',
    createdAt: Date.UTC(2026, 3, 19, 2, 0, 0),
    summary: '첫 Sprint 완료',
    completedTaskIds: ['t1'],
    inProgressTaskIds: ['t2'],
    blockedTaskIds: [],
    changedFiles: ['src/types/task.ts'],
    decisions: ['파일 저장 유지'],
    openQuestions: ['서브에이전트 병렬 한도?'],
    nextActions: ['Markdown 렌더러 완성', '단위 테스트 추가'],
    resumePrompt: 't2 작업을 이어서 진행하라.',
    markdownPath: '/tmp/test-tasks/tasks/task-1/checkpoints/cp-1.md',
    ...overrides,
  };
}

describe('renderTaskMarkdown', () => {
  it('frontmatter에 필수 필드를 포함한다', () => {
    const md = renderTaskMarkdown(buildTask());
    const frontmatter = md.split('---')[1] ?? '';
    expect(frontmatter).toContain('taskId: task-1');
    expect(frontmatter).toContain('title: ');
    expect(frontmatter).toContain('status: active');
    expect(frontmatter).toContain('createdAt: ');
    expect(frontmatter).toContain('updatedAt: ');
  });

  it('모든 핵심 섹션을 포함한다', () => {
    const md = renderTaskMarkdown(buildTask());
    expect(md).toContain('## 목표');
    expect(md).toContain('## 수용 조건');
    expect(md).toContain('## Epic');
    expect(md).toContain('## Task');
    expect(md).toContain('## 결정 사항');
    expect(md).toContain('## 변경된 파일');
    expect(md).toContain('## 미해결 질문');
  });

  it('status별 Task 그룹을 렌더한다', () => {
    const md = renderTaskMarkdown(buildTask());
    expect(md).toContain('### 진행 중 (1)');
    expect(md).toContain('### 완료 (1)');
  });

  it('subtask 체크리스트를 GFM 형식으로 렌더한다', () => {
    const md = renderTaskMarkdown(buildTask());
    expect(md).toContain('- [x] 경로 검증');
    expect(md).toContain('- [ ] RMW 구현');
  });

  it('writeScope/allowedTools/owner가 있으면 표시한다', () => {
    const md = renderTaskMarkdown(buildTask());
    expect(md).toContain('쓰기 범위:');
    expect(md).toContain('허용 도구:');
    expect(md).toContain('Owner: coder');
  });

  it('빈 배열은 "없음"으로 표시한다', () => {
    const md = renderTaskMarkdown(
      buildTask({
        acceptanceCriteria: [],
        decisions: [],
        changedFiles: [],
        openQuestions: [],
      })
    );
    expect(md).toContain('_없음_');
  });
});

describe('renderCheckpointMarkdown', () => {
  it('frontmatter에 taskId/checkpointId/status/createdAt을 포함한다', () => {
    const md = renderCheckpointMarkdown(buildCheckpoint());
    const frontmatter = md.split('---')[1] ?? '';
    expect(frontmatter).toContain('taskId: task-1');
    expect(frontmatter).toContain('checkpointId: cp-1');
    expect(frontmatter).toContain('status: active');
    expect(frontmatter).toContain('createdAt: ');
    expect(frontmatter).toContain('runId: run-9');
  });

  it('설계 문서의 모든 섹션을 포함한다', () => {
    const md = renderCheckpointMarkdown(buildCheckpoint());
    expect(md).toContain('## 목표');
    expect(md).toContain('## 현재 상태');
    expect(md).toContain('## 완료된 Task');
    expect(md).toContain('## 진행 중 / 차단됨');
    expect(md).toContain('## 결정 사항');
    expect(md).toContain('## 변경된 파일');
    expect(md).toContain('## 미해결 질문');
    expect(md).toContain('## 다음 행동');
    expect(md).toContain('## Resume Prompt');
  });

  it('Resume Prompt를 코드 블록으로 감싼다', () => {
    const md = renderCheckpointMarkdown(buildCheckpoint());
    expect(md).toContain('```\nt2 작업을 이어서 진행하라.\n```');
  });

  it('taskId가 공백 문자열을 포함하면 따옴표로 감싼다', () => {
    const md = renderCheckpointMarkdown(
      buildCheckpoint({ summary: 'A: 복합 주제' })
    );
    expect(md).toContain('# Checkpoint: A: 복합 주제');
  });

  it('runId가 없으면 frontmatter에서 생략된다', () => {
    const cp = buildCheckpoint();
    delete cp.runId;
    const md = renderCheckpointMarkdown(cp);
    const frontmatter = md.split('---')[1] ?? '';
    expect(frontmatter).not.toContain('runId:');
  });

  it('모든 ID 목록이 비어도 렌더링은 "없음" 플레이스홀더로 완료된다', () => {
    const md = renderCheckpointMarkdown(
      buildCheckpoint({
        completedTaskIds: [],
        inProgressTaskIds: [],
        blockedTaskIds: [],
        changedFiles: [],
        decisions: [],
        openQuestions: [],
        nextActions: [],
      })
    );
    expect(md).toContain('## 완료된 Task');
    expect(md).toContain('_없음_');
  });

  it('현재 상태 섹션에 각 상태별 개수가 명시된다', () => {
    const md = renderCheckpointMarkdown(
      buildCheckpoint({
        completedTaskIds: ['a', 'b', 'c'],
        inProgressTaskIds: ['d'],
        blockedTaskIds: ['e', 'f'],
      })
    );
    expect(md).toContain('완료: 3개');
    expect(md).toContain('진행 중: 1개');
    expect(md).toContain('차단됨: 2개');
  });
});

describe('renderTaskMarkdown 추가 커버리지', () => {
  it('canonicalPlan이 있으면 "정본 계획" 섹션이 렌더된다', () => {
    const md = renderTaskMarkdown(
      buildTask({ canonicalPlan: '목표 달성 후 배포' })
    );
    expect(md).toContain('## 정본 계획');
    expect(md).toContain('목표 달성 후 배포');
  });

  it('canonicalPlan이 없으면 "정본 계획" 섹션이 빠진다', () => {
    const md = renderTaskMarkdown(buildTask({ canonicalPlan: undefined }));
    expect(md).not.toContain('## 정본 계획');
  });

  it('blocker와 resultSummary가 있으면 렌더된다', () => {
    const md = renderTaskMarkdown(
      buildTask({
        tasks: [
          {
            id: 't-b',
            epicId: 'e1',
            title: '차단된 Task',
            description: '',
            status: 'blocked',
            priority: 'high',
            size: 'L',
            dependsOn: [],
            definitionOfDone: [],
            subtasks: [],
            blocker: '의존 Task 미완료',
            resultSummary: '부분 완료',
          },
        ],
      })
    );
    expect(md).toContain('Blocker: 의존 Task 미완료');
    expect(md).toContain('결과: 부분 완료');
  });

  it('의존(dependsOn)이 있으면 의존 라인을 렌더한다', () => {
    const md = renderTaskMarkdown(buildTask());
    expect(md).toContain('의존: ');
    expect(md).toContain('`t1`');
  });

  it('Epic이 없으면 "_없음_" 플레이스홀더를 표시한다', () => {
    const md = renderTaskMarkdown(buildTask({ epics: [] }));
    expect(md).toContain('## Epic');
  });

  it('Task 목록이 완전히 비어 있으면 "_없음_" 플레이스홀더를 표시한다', () => {
    const md = renderTaskMarkdown(buildTask({ tasks: [] }));
    // 상태별 그룹 헤더가 전혀 없어야 함
    expect(md).not.toContain('### 진행 중');
    expect(md).not.toContain('### 완료');
    expect(md).toMatch(/## Task\n_없음_/);
  });

  it('결정 사항에 rationale이 없으면 구분자 — 없이 렌더된다', () => {
    const md = renderTaskMarkdown(
      buildTask({
        decisions: [
          {
            id: 'd-no-rationale',
            createdAt: Date.UTC(2026, 3, 19, 0, 30, 0),
            summary: '단순 결정',
          },
        ],
      })
    );
    expect(md).toContain('단순 결정');
    const lastLine = md.split('\n').find((l) => l.includes('단순 결정'))!;
    expect(lastLine).not.toContain(' — ');
  });

  it('특수 문자가 포함된 제목은 YAML 따옴표로 감싸진다', () => {
    const md = renderTaskMarkdown(buildTask({ title: '콜론 : 포함' }));
    expect(md).toContain('title: "콜론 : 포함"');
  });

  it('빈 goal은 "_미정의_" 플레이스홀더로 표시된다', () => {
    const md = renderTaskMarkdown(buildTask({ goal: '' }));
    expect(md).toContain('## 목표');
    expect(md).toContain('_미정의_');
  });
});
