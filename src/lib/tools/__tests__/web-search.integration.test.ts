import { describe, it, expect, beforeAll } from 'vitest';
import { checkSearXNGAvailable } from '@/test/helpers/service-checker';
import { WebSearchTool } from '../web-search';

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888';
let searxngAvailable = false;

beforeAll(async () => {
  searxngAvailable = await checkSearXNGAvailable(SEARXNG_URL);
});

describe.skipIf(!searxngAvailable)('WebSearchTool Integration', () => {
  const tool = new WebSearchTool(SEARXNG_URL);

  beforeAll(async () => {
    searxngAvailable = await checkSearXNGAvailable(SEARXNG_URL);
  });

  it('real search returns results', async () => {
    const result = await tool.execute({ query: 'TypeScript programming language' });

    expect(result.success).toBe(true);
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output).not.toBe('No search results found.');
  }, 15000);

  it('results have expected format with numbering', async () => {
    const result = await tool.execute({ query: 'Node.js' });

    expect(result.success).toBe(true);
    // Results are formatted as "1. **Title**\n   URL: ...\n   ..."
    expect(result.output).toMatch(/\d+\.\s+\*\*/);
    expect(result.output).toContain('URL:');
  }, 15000);

  it('limit parameter restricts result count', async () => {
    const result = await tool.execute({ query: 'JavaScript', limit: 2 });

    expect(result.success).toBe(true);
    // Should have at most 2 results (numbered 1. and 2.)
    const resultCount = (result.output.match(/^\d+\./gm) || []).length;
    expect(resultCount).toBeLessThanOrEqual(2);
  }, 15000);

  it('returns error for empty query', async () => {
    const result = await tool.execute({ query: '' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('required');
  });

  it('handles query with special characters', async () => {
    const result = await tool.execute({ query: 'C++ std::vector<int>' });

    expect(result.success).toBe(true);
    // Should either return results or "No search results found."
    expect(result.output.length).toBeGreaterThan(0);
  }, 15000);

  it('limit is capped at 10', async () => {
    const result = await tool.execute({ query: 'Linux', limit: 50 });

    expect(result.success).toBe(true);
    const resultCount = (result.output.match(/^\d+\./gm) || []).length;
    expect(resultCount).toBeLessThanOrEqual(10);
  }, 15000);
});
