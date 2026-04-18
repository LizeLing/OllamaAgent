import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { setupTestDataDir } from '@/test/helpers/test-cleanup';
import { createConversation, createMessage } from '@/test/helpers/test-data-factory';

let cleanup: () => Promise<void>;
let dataDir: string;

let saveConversation: typeof import('../storage').saveConversation;
let getConversation: typeof import('../storage').getConversation;
let listConversations: typeof import('../storage').listConversations;
let rewindConversation: typeof import('../storage').rewindConversation;
let forkConversation: typeof import('../storage').forkConversation;

async function reloadModule() {
  vi.resetModules();
  const mod = await import('../storage');
  saveConversation = mod.saveConversation;
  getConversation = mod.getConversation;
  listConversations = mod.listConversations;
  rewindConversation = mod.rewindConversation;
  forkConversation = mod.forkConversation;
}

function makeMessages(n: number) {
  return Array.from({ length: n }, (_, i) =>
    createMessage({
      id: `m-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
      timestamp: 1_000_000 + i,
    })
  );
}

describe('Rewind / Fork Integration', () => {
  beforeEach(async () => {
    const setup = await setupTestDataDir();
    dataDir = setup.dataDir;
    cleanup = setup.cleanup;
    await reloadModule();
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('rewindConversation', () => {
    it('실제 파일 시스템에서 messageIndex 포함까지 유지한다', async () => {
      const conv = createConversation({
        id: 'int-rw-1',
        title: 'Integration Rewind',
        messages: makeMessages(10),
      });
      await saveConversation(conv);

      const result = await rewindConversation('int-rw-1', 5);

      // inclusive: index 5까지 6개
      expect(result.messages).toHaveLength(6);
      expect(result.messages[5].id).toBe('m-5');

      // 디스크에서 다시 읽어도 동일해야 함
      const reread = await getConversation('int-rw-1');
      expect(reread).toBeDefined();
      expect(reread!.messages).toHaveLength(6);
      expect(reread!.rewoundFrom?.previousLength).toBe(10);
    });

    it('인덱스 파일의 messageCount가 rewind 후 갱신된다', async () => {
      const conv = createConversation({
        id: 'int-rw-idx',
        title: 'Rewind Index',
        messages: makeMessages(8),
      });
      await saveConversation(conv);

      await rewindConversation('int-rw-idx', 3);

      const list = await listConversations();
      const meta = list.find((m) => m.id === 'int-rw-idx');
      expect(meta).toBeDefined();
      expect(meta!.messageCount).toBe(4);
      expect(meta!.rewoundFrom).toBeDefined();
    });

    it('존재하지 않는 id이면 파일 읽기 단계에서 에러가 발생한다', async () => {
      await expect(rewindConversation('int-rw-missing', 0)).rejects.toThrow();
    });

    it('messageIndex가 범위를 초과하면 에러를 던진다', async () => {
      const conv = createConversation({
        id: 'int-rw-over',
        title: 'Over',
        messages: makeMessages(3),
      });
      await saveConversation(conv);

      await expect(rewindConversation('int-rw-over', 3)).rejects.toThrow(/messageIndex/);
      await expect(rewindConversation('int-rw-over', 99)).rejects.toThrow(/messageIndex/);
    });

    it('음수/비정수 messageIndex를 거부한다', async () => {
      await expect(rewindConversation('any-id', -1)).rejects.toThrow(/Invalid messageIndex/);
      await expect(rewindConversation('any-id', 2.5)).rejects.toThrow(/Invalid messageIndex/);
    });
  });

  describe('forkConversation', () => {
    it('원본 대화의 파일은 변경되지 않는다', async () => {
      const conv = createConversation({
        id: 'int-fk-src',
        title: 'Fork Source',
        messages: makeMessages(10),
      });
      await saveConversation(conv);

      const filePath = path.join(dataDir, 'conversations', 'int-fk-src.json');
      const beforeContent = await fs.readFile(filePath, 'utf-8');

      const forked = await forkConversation('int-fk-src', 4, { newId: 'int-fk-child' });

      const afterContent = await fs.readFile(filePath, 'utf-8');
      // 원본 파일 내용이 바이트 단위로 동일해야 함
      expect(afterContent).toBe(beforeContent);

      // 원본 대화 불변: 메시지 수 그대로
      const original = await getConversation('int-fk-src');
      expect(original!.messages).toHaveLength(10);

      // 포크 대화는 새 파일로 존재
      const child = await getConversation('int-fk-child');
      expect(child).toBeDefined();
      expect(child!.id).toBe(forked.id);
      expect(child!.messages).toHaveLength(5);
    });

    it('새 대화가 listConversations 결과에 포함되고 forkedFrom 메타를 보존한다', async () => {
      const conv = createConversation({
        id: 'int-fk-list',
        title: 'Parent',
        messages: makeMessages(6),
      });
      await saveConversation(conv);

      const forked = await forkConversation('int-fk-list', 2, { newId: 'int-fk-list-c' });

      const list = await listConversations();
      const childMeta = list.find((m) => m.id === 'int-fk-list-c');
      expect(childMeta).toBeDefined();
      expect(childMeta!.forkedFrom).toBeDefined();
      expect(childMeta!.forkedFrom!.conversationId).toBe('int-fk-list');
      expect(childMeta!.forkedFrom!.messageIndex).toBe(2);
      expect(forked.forkedFrom!.forkedAt).toBeGreaterThan(0);
    });

    it('title 미지정 시 "제목 (분기)" 형태로 저장된다', async () => {
      const conv = createConversation({
        id: 'int-fk-title',
        title: 'Elegant',
        messages: makeMessages(3),
      });
      await saveConversation(conv);

      const forked = await forkConversation('int-fk-title', 0, { newId: 'int-fk-title-c' });

      expect(forked.title).toBe('Elegant (분기)');

      const child = await getConversation('int-fk-title-c');
      expect(child!.title).toBe('Elegant (분기)');
    });

    it('존재하지 않는 원본 id이면 명시적으로 not found 에러를 던진다', async () => {
      await expect(
        forkConversation('int-fk-missing', 0, { newId: 'child' })
      ).rejects.toThrow(/not found/);
    });
  });

  describe('동시성 (file-lock)', () => {
    it('같은 대화에 rewind와 fork를 병렬 호출해도 원본 파일이 손상되지 않는다', async () => {
      const conv = createConversation({
        id: 'int-cc-1',
        title: 'Concurrency',
        messages: makeMessages(12),
      });
      await saveConversation(conv);

      const [rewound, forked] = await Promise.all([
        rewindConversation('int-cc-1', 5),
        forkConversation('int-cc-1', 3, { newId: 'int-cc-1-fork' }),
      ]);

      // 두 호출 모두 성공적으로 완료됨
      expect(rewound.messages).toHaveLength(6);
      expect(forked.messages).toHaveLength(4);
      expect(forked.id).toBe('int-cc-1-fork');

      // 원본 파일 JSON 파싱이 깨지지 않음
      const filePath = path.join(dataDir, 'conversations', 'int-cc-1.json');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();

      // 최종 상태 검증: rewind 결과가 반영되어 messages 6개
      const finalOrig = await getConversation('int-cc-1');
      expect(finalOrig).toBeDefined();
      expect(finalOrig!.messages.length).toBe(6);

      // 포크 대화 파일도 정상
      const forkRead = await getConversation('int-cc-1-fork');
      expect(forkRead).toBeDefined();
      expect(forkRead!.forkedFrom!.conversationId).toBe('int-cc-1');
    });

    it('인덱스 파일이 동시 쓰기 후에도 유효한 JSON을 유지한다', async () => {
      const conv = createConversation({
        id: 'int-cc-idx',
        title: 'IndexSafe',
        messages: makeMessages(8),
      });
      await saveConversation(conv);

      // rewind 1건 + fork 3건을 동시에 실행
      await Promise.all([
        rewindConversation('int-cc-idx', 2),
        forkConversation('int-cc-idx', 1, { newId: 'int-cc-idx-a' }),
        forkConversation('int-cc-idx', 1, { newId: 'int-cc-idx-b' }),
        forkConversation('int-cc-idx', 1, { newId: 'int-cc-idx-c' }),
      ]);

      const indexPath = path.join(dataDir, 'conversations', 'index.json');
      const raw = await fs.readFile(indexPath, 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();

      const list = await listConversations();
      const ids = list.map((m) => m.id).sort();
      expect(ids).toContain('int-cc-idx');
      expect(ids).toContain('int-cc-idx-a');
      expect(ids).toContain('int-cc-idx-b');
      expect(ids).toContain('int-cc-idx-c');
    });

    it('다수의 rewind 병렬 호출이 직렬화되어 최종 상태가 일관된다', async () => {
      const conv = createConversation({
        id: 'int-cc-multi-rw',
        title: 'MultiRewind',
        messages: makeMessages(10),
      });
      await saveConversation(conv);

      // 여러 rewind 호출을 동시에 (순서가 보장되지 않아도 최종 파일은 유효해야 함)
      const results = await Promise.all([
        rewindConversation('int-cc-multi-rw', 7),
        rewindConversation('int-cc-multi-rw', 5),
        rewindConversation('int-cc-multi-rw', 3),
      ]);

      // 모두 성공
      for (const r of results) {
        expect(r.messages.length).toBeGreaterThan(0);
      }

      // 최종 파일 JSON 손상 없음
      const filePath = path.join(dataDir, 'conversations', 'int-cc-multi-rw.json');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();

      const final = await getConversation('int-cc-multi-rw');
      expect(final).toBeDefined();
      expect(final!.messages.length).toBeLessThanOrEqual(8);
    });
  });
});
