import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export interface ParsedSection {
  text: string;
  source: string;
}

const FORMAT_MAP: Record<string, string> = {
  '.md': 'markdown',
  '.txt': 'text',
  '.ts': 'code', '.tsx': 'code', '.js': 'code', '.jsx': 'code',
  '.py': 'code', '.java': 'code', '.go': 'code', '.rs': 'code',
  '.c': 'code', '.cpp': 'code', '.h': 'code',
  '.css': 'code', '.html': 'code', '.json': 'code', '.yaml': 'code', '.yml': 'code',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
};

export function detectFormat(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return FORMAT_MAP[ext] || 'text';
}

export async function parseDocument(filename: string, content: Buffer): Promise<ParsedSection[]> {
  const format = detectFormat(filename);

  switch (format) {
    case 'markdown':
    case 'text':
      return parseMarkdownOrText(content.toString('utf-8'), filename);
    case 'code':
      return parseCode(content.toString('utf-8'), filename);
    case 'docx':
      return parseDocx(content);
    case 'xlsx':
      return parseXlsx(content);
    case 'pptx':
      return parsePptx(content);
    default:
      return [{ text: content.toString('utf-8'), source: filename }];
  }
}

function parseMarkdownOrText(text: string, filename: string): ParsedSection[] {
  const lines = text.split('\n');
  const sections: ParsedSection[] = [];
  let currentTitle = filename;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (currentLines.length > 0) {
        const sectionText = currentLines.join('\n').trim();
        if (sectionText) {
          sections.push({ text: sectionText, source: currentTitle });
        }
      }
      currentTitle = headingMatch[2].trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const sectionText = currentLines.join('\n').trim();
    if (sectionText) {
      sections.push({ text: sectionText, source: currentTitle });
    }
  }

  return sections.length > 0 ? sections : [{ text: text.trim(), source: filename }];
}

function parseCode(text: string, filename: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const patterns = [
    /^(?:export\s+)?(?:async\s+)?function\s+\w+/m,
    /^(?:export\s+)?class\s+\w+/m,
    /^(?:export\s+)?(?:const|let)\s+\w+\s*=/m,
    /^def\s+\w+/m,
    /^class\s+\w+/m,
    /^func\s+\w+/m,
  ];

  const lines = text.split('\n');
  let currentName = filename;
  let currentLines: string[] = [];

  for (const line of lines) {
    let isDeclaration = false;
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        isDeclaration = true;
        break;
      }
    }

    if (isDeclaration && currentLines.length > 0) {
      const sectionText = currentLines.join('\n').trim();
      if (sectionText) {
        sections.push({ text: sectionText, source: currentName });
      }
      currentName = line.trim().slice(0, 80);
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const sectionText = currentLines.join('\n').trim();
    if (sectionText) {
      sections.push({ text: sectionText, source: currentName });
    }
  }

  return sections.length > 0 ? sections : [{ text, source: filename }];
}

async function parseDocx(content: Buffer): Promise<ParsedSection[]> {
  try {
    const result = await mammoth.extractRawText({ buffer: content });
    return parseMarkdownOrText(result.value, 'docx');
  } catch (err) {
    throw new Error(`DOCX 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function parseXlsx(content: Buffer): Promise<ParsedSection[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);

    const sections: ParsedSection[] = [];

    for (const worksheet of workbook.worksheets) {
      const rows: string[] = [];
      worksheet.eachRow((row) => {
        const values = (row.values as (string | number | null)[])
          .slice(1)
          .map((v) => (v != null ? String(v) : ''))
          .join('\t');
        rows.push(values);
      });

      if (rows.length > 0) {
        sections.push({
          text: rows.join('\n'),
          source: worksheet.name,
        });
      }
    }

    return sections;
  } catch (err) {
    throw new Error(`XLSX 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function parsePptx(content: Buffer): Promise<ParsedSection[]> {
  try {
    const zip = await JSZip.loadAsync(content);
    const slideFiles = zip.filter((_relativePath, file) =>
      file.name.match(/^ppt\/slides\/slide\d+\.xml$/) !== null
    );

    slideFiles.sort((a, b) => {
      const numA = parseInt(a.name.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.name.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

    const sections: ParsedSection[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const file = zip.file(slideFiles[i].name);
      if (!file) continue;

      const xml = await file.async('text');
      const texts: string[] = [];
      const regex = /<a:t>([^<]*)<\/a:t>/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        if (match[1].trim()) {
          texts.push(match[1].trim());
        }
      }

      if (texts.length > 0) {
        sections.push({
          text: texts.join(' '),
          source: `슬라이드 ${i + 1}`,
        });
      }
    }

    return sections;
  } catch (err) {
    throw new Error(`PPTX 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}
