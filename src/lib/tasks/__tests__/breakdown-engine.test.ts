import { describe, it, expect } from 'vitest';
import {
  buildBreakdownPrompt,
  parseBreakdownResponse,
  draftToTaskRecord,
  BreakdownParseError,
} from '../breakdown-engine';

describe('breakdown-engine / buildBreakdownPrompt', () => {
  it('목표, 제약, 참조 파일을 모두 포함한다', () => {
    const { system, user } = buildBreakdownPrompt({
      goal: 'Task Mode 구현',
      title: 'TASK 모드',
      constraints: ['한국어 사용'],
      contextFiles: [{ path: 'docs/plan.md', content: '요약 내용' }],
    });
    expect(system).toMatch(/Epic/);
    expect(system).toMatch(/JSON/);
    expect(user).toContain('Task Mode 구현');
    expect(user).toContain('한국어 사용');
    expect(user).toContain('docs/plan.md');
    expect(user).toContain('요약 내용');
  });

  it('참조 파일은 3000자 이상이면 잘린다', () => {
    const long = 'a'.repeat(5000);
    const { user } = buildBreakdownPrompt({
      goal: 'G',
      contextFiles: [{ path: 'big.md', content: long }],
    });
    expect(user).toContain('이하 생략');
    expect(user.length).toBeLessThan(long.length + 2000);
  });

  it('source를 포함한다', () => {
    const { user } = buildBreakdownPrompt({
      goal: 'G',
      source: { type: 'spec', ref: 'docs/spec.md' },
    });
    expect(user).toContain('type: spec');
    expect(user).toContain('ref: docs/spec.md');
  });
});

describe('breakdown-engine / parseBreakdownResponse', () => {
  const VALID_JSON = JSON.stringify({
    title: '샘플',
    goal: '목표',
    acceptanceCriteria: ['완료 조건 1'],
    epics: [{ title: 'Epic 1', description: 'desc' }],
    tasks: [
      {
        epicIndex: 0,
        title: 'Task A',
        description: 'A desc',
        priority: 'high',
        size: 'L',
        owner: 'coder',
        dependsOn: [],
        definitionOfDone: ['DoD'],
        subtasks: ['s1', 's2'],
      },
    ],
  });

  it('순수 JSON을 파싱한다', () => {
    const draft = parseBreakdownResponse(VALID_JSON);
    expect(draft.title).toBe('샘플');
    expect(draft.epics).toHaveLength(1);
    expect(draft.tasks[0].priority).toBe('high');
    expect(draft.tasks[0].subtasks).toEqual(['s1', 's2']);
  });

  it('마크다운 코드펜스를 벗긴다', () => {
    const wrapped = '다음은 결과입니다.\n```json\n' + VALID_JSON + '\n```\n끝.';
    const draft = parseBreakdownResponse(wrapped);
    expect(draft.title).toBe('샘플');
  });

  it('선행 텍스트가 있어도 { ... } 만 추출한다', () => {
    const wrapped = '안녕하세요\n' + VALID_JSON + '\n감사합니다';
    const draft = parseBreakdownResponse(wrapped);
    expect(draft.title).toBe('샘플');
  });

  it('필수 필드 누락 시 throw', () => {
    const bad = JSON.stringify({ goal: 'g', epics: [{ title: 'E' }], tasks: [] });
    expect(() => parseBreakdownResponse(bad)).toThrow(BreakdownParseError);
  });

  it('epics 비어있으면 throw', () => {
    const bad = JSON.stringify({ title: 't', goal: 'g', epics: [], tasks: [{ epicIndex: 0, title: 'T' }] });
    expect(() => parseBreakdownResponse(bad)).toThrow(/epics 배열/);
  });

  it('priority 잘못 입력되면 medium으로 보정', () => {
    const lenient = JSON.stringify({
      title: 't',
      goal: 'g',
      epics: [{ title: 'E', description: '' }],
      tasks: [{ epicIndex: 0, title: 'T', priority: 'urgent', size: 'XL' }],
    });
    const draft = parseBreakdownResponse(lenient);
    expect(draft.tasks[0].priority).toBe('medium');
    expect(draft.tasks[0].size).toBe('M');
  });

  it('epicIndex가 범위 벗어나면 0으로 보정', () => {
    const lenient = JSON.stringify({
      title: 't',
      goal: 'g',
      epics: [{ title: 'E', description: '' }],
      tasks: [{ epicIndex: 99, title: 'T' }],
    });
    const draft = parseBreakdownResponse(lenient);
    expect(draft.tasks[0].epicIndex).toBe(0);
  });

  it('JSON 아닌 텍스트는 throw', () => {
    expect(() => parseBreakdownResponse('not json')).toThrow(BreakdownParseError);
  });

  it('epics가 3개 초과면 3개로 자른다', () => {
    const many = JSON.stringify({
      title: 't',
      goal: 'g',
      epics: [
        { title: 'E1', description: '' },
        { title: 'E2', description: '' },
        { title: 'E3', description: '' },
        { title: 'E4', description: '' },
      ],
      tasks: [{ epicIndex: 0, title: 'T' }],
    });
    const draft = parseBreakdownResponse(many);
    expect(draft.epics).toHaveLength(3);
  });
});

describe('breakdown-engine / draftToTaskRecord', () => {
  it('id가 부여되고 dependsOn이 인덱스→id로 변환된다', () => {
    const draft = parseBreakdownResponse(JSON.stringify({
      title: 't',
      goal: 'g',
      epics: [{ title: 'E', description: '' }],
      tasks: [
        { epicIndex: 0, title: 'T0' },
        { epicIndex: 0, title: 'T1', dependsOn: [0] },
      ],
    }));
    const record = draftToTaskRecord(draft, { goal: 'g' });
    expect(record.id).toMatch(/^task_/);
    expect(record.tasks[1].dependsOn).toEqual([record.tasks[0].id]);
    expect(record.tasks[0].status).toBe('todo');
    expect(record.epics[0].taskIds).toEqual([record.tasks[0].id, record.tasks[1].id]);
  });

  it('자기 참조 dependsOn은 제거된다', () => {
    const draft = parseBreakdownResponse(JSON.stringify({
      title: 't',
      goal: 'g',
      epics: [{ title: 'E', description: '' }],
      tasks: [{ epicIndex: 0, title: 'T0', dependsOn: [0] }],
    }));
    const record = draftToTaskRecord(draft, { goal: 'g' });
    expect(record.tasks[0].dependsOn).toEqual([]);
  });

  it('subtasks는 ChecklistItem으로 변환', () => {
    const draft = parseBreakdownResponse(JSON.stringify({
      title: 't',
      goal: 'g',
      epics: [{ title: 'E', description: '' }],
      tasks: [{ epicIndex: 0, title: 'T0', subtasks: ['체크1', '체크2'] }],
    }));
    const record = draftToTaskRecord(draft, { goal: 'g' });
    expect(record.tasks[0].subtasks).toHaveLength(2);
    expect(record.tasks[0].subtasks[0].checked).toBe(false);
    expect(record.tasks[0].subtasks[0].text).toBe('체크1');
  });

  it('input.title이 있으면 title로 사용', () => {
    const draft = parseBreakdownResponse(JSON.stringify({
      title: 'LLM이 제안한 이름',
      goal: 'g',
      epics: [{ title: 'E', description: '' }],
      tasks: [{ epicIndex: 0, title: 'T0' }],
    }));
    const record = draftToTaskRecord(draft, { goal: 'g', title: '사용자 지정' });
    expect(record.title).toBe('사용자 지정');
  });
});
