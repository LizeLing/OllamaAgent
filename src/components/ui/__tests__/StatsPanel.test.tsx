import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import StatsPanel from '../StatsPanel';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StatsPanel', () => {
  it('returns null when not open', () => {
    const { container } = render(<StatsPanel isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows loading state initially', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    render(<StatsPanel isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('renders stats data after fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        totalConversations: 10,
        totalMessages: 50,
        pinnedCount: 2,
        memoryCount: 5,
        tagCounts: { react: 3 },
        dailyActivity: { '2026-03-01': 5, '2026-03-02': 8 },
      }),
    });

    const { container } = render(<StatsPanel isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      const text = container.textContent;
      expect(text).toContain('10');
    });
    const text = container.textContent!;
    expect(text).toContain('50');
    expect(text).toContain('통계');
  });
});
