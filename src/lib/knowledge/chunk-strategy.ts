import type { ParsedSection } from './document-parser';

const MIN_CHUNK_SIZE = 200;
const MAX_CHUNK_SIZE = 1000;
const SPLIT_SIZE = 500;
const OVERLAP_SIZE = 100;
const MAX_NORMALIZE_ROUNDS = 2;

export interface Chunk {
  text: string;
  source: string;
  chunkIndex: number;
}

export function chunkSections(sections: ParsedSection[]): Chunk[] {
  const nonEmpty = sections.filter((s) => s.text.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  let items: { text: string; source: string }[] = nonEmpty.map((s) => ({
    text: s.text,
    source: s.source,
  }));

  for (let round = 0; round < MAX_NORMALIZE_ROUNDS; round++) {
    const normalized = normalizePass(items);
    if (normalized.length === items.length) break;
    items = normalized;
  }

  return items.map((item, i) => ({
    text: item.text,
    source: item.source,
    chunkIndex: i,
  }));
}

function normalizePass(items: { text: string; source: string }[]): { text: string; source: string }[] {
  const result: { text: string; source: string }[] = [];

  let i = 0;
  while (i < items.length) {
    let current = items[i];

    if (current.text.length < MIN_CHUNK_SIZE && i + 1 < items.length) {
      const next = items[i + 1];
      const mergedSource = next.text.length > current.text.length ? next.source : current.source;
      current = {
        text: current.text + '\n\n' + next.text,
        source: mergedSource,
      };
      i += 2;
    } else {
      i += 1;
    }

    if (current.text.length > MAX_CHUNK_SIZE) {
      const splits = splitWithOverlap(current.text, SPLIT_SIZE, OVERLAP_SIZE);
      for (const splitText of splits) {
        result.push({ text: splitText, source: current.source });
      }
    } else {
      result.push(current);
    }
  }

  return result;
}

function splitWithOverlap(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }

  return chunks;
}
