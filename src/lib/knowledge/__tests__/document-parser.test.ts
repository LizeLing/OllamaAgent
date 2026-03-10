import { describe, it, expect, vi, beforeEach } from 'vitest';

// mammoth mock
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({
      value: '# 제목\n\n첫 번째 단락입니다.\n\n## 섹션 1\n\n두 번째 단락입니다.',
    }),
  },
}));

// exceljs mock
vi.mock('exceljs', () => {
  const mockWorksheet = {
    name: 'Sheet1',
    eachRow: vi.fn((cb: (row: { values: (string | number | null)[] }, rowNumber: number) => void) => {
      cb({ values: [null, '이름', '레벨', '공격력'] }, 1);
      cb({ values: [null, '전사', 10, 150] }, 2);
      cb({ values: [null, '마법사', 8, 200] }, 3);
    }),
  };
  function MockWorkbook(this: unknown) {
    return {
      xlsx: {
        load: vi.fn().mockResolvedValue(undefined),
      },
      worksheets: [mockWorksheet],
    };
  }
  return {
    default: {
      Workbook: vi.fn().mockImplementation(MockWorkbook),
    },
  };
});

// jszip mock
vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn().mockResolvedValue({
      file: vi.fn().mockImplementation((name: string) => {
        if (name === 'ppt/slides/slide1.xml') {
          return {
            async: vi.fn().mockResolvedValue(
              '<p:sp><a:t>슬라이드 1 텍스트</a:t></p:sp>'
            ),
          };
        }
        if (name === 'ppt/slides/slide2.xml') {
          return {
            async: vi.fn().mockResolvedValue(
              '<p:sp><a:t>슬라이드 2 텍스트</a:t></p:sp>'
            ),
          };
        }
        return null;
      }),
      filter: vi.fn().mockReturnValue([
        { name: 'ppt/slides/slide1.xml' },
        { name: 'ppt/slides/slide2.xml' },
      ]),
    }),
  },
}));

describe('DocumentParser', () => {
  let parseDocument: typeof import('../document-parser').parseDocument;
  let detectFormat: typeof import('../document-parser').detectFormat;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../document-parser');
    parseDocument = mod.parseDocument;
    detectFormat = mod.detectFormat;
  });

  describe('detectFormat', () => {
    it('.md → markdown', () => expect(detectFormat('readme.md')).toBe('markdown'));
    it('.txt → text', () => expect(detectFormat('note.txt')).toBe('text'));
    it('.ts → code', () => expect(detectFormat('main.ts')).toBe('code'));
    it('.js → code', () => expect(detectFormat('app.js')).toBe('code'));
    it('.py → code', () => expect(detectFormat('script.py')).toBe('code'));
    it('.docx → docx', () => expect(detectFormat('doc.docx')).toBe('docx'));
    it('.xlsx → xlsx', () => expect(detectFormat('sheet.xlsx')).toBe('xlsx'));
    it('.pptx → pptx', () => expect(detectFormat('slides.pptx')).toBe('pptx'));
    it('알 수 없는 확장자 → text', () => expect(detectFormat('file.abc')).toBe('text'));
  });

  describe('parseDocument — markdown', () => {
    it('헤딩 기준으로 섹션을 분리한다', async () => {
      const content = Buffer.from('# 제목\n\n본문 1\n\n## 섹션\n\n본문 2');
      const sections = await parseDocument('doc.md', content);

      expect(sections.length).toBeGreaterThanOrEqual(2);
      expect(sections[0].source).toContain('제목');
    });
  });

  describe('parseDocument — code', () => {
    it('함수/클래스 단위로 분리한다', async () => {
      const code = `function hello() {\n  return 'world';\n}\n\nclass Foo {\n  bar() {}\n}`;
      const content = Buffer.from(code);
      const sections = await parseDocument('main.ts', content);

      expect(sections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parseDocument — docx', () => {
    it('mammoth으로 텍스트를 추출하고 섹션으로 분리한다', async () => {
      const content = Buffer.from('fake docx content');
      const sections = await parseDocument('doc.docx', content);

      expect(sections.length).toBeGreaterThanOrEqual(1);
      expect(sections.some(s => s.text.includes('단락'))).toBe(true);
    });
  });

  describe('parseDocument — xlsx', () => {
    it('시트별로 행 데이터를 텍스트로 추출한다', async () => {
      const content = Buffer.from('fake xlsx content');
      const sections = await parseDocument('data.xlsx', content);

      expect(sections.length).toBeGreaterThanOrEqual(1);
      expect(sections[0].source).toContain('Sheet1');
    });
  });

  describe('parseDocument — pptx', () => {
    it('슬라이드별로 텍스트를 추출한다', async () => {
      const content = Buffer.from('fake pptx content');
      const sections = await parseDocument('slides.pptx', content);

      expect(sections).toHaveLength(2);
      expect(sections[0].source).toContain('슬라이드 1');
      expect(sections[0].text).toContain('슬라이드 1 텍스트');
    });
  });
});
