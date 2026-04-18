import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TaskStatusBadge from '../TaskStatusBadge';

describe('TaskStatusBadge', () => {
  it('active 상태는 "진행 중" 라벨을 렌더한다', () => {
    render(<TaskStatusBadge status="active" />);
    expect(screen.getByText('진행 중')).toBeInTheDocument();
  });

  it('blocked 상태는 "차단됨" 라벨을 렌더한다', () => {
    render(<TaskStatusBadge status="blocked" />);
    expect(screen.getByText('차단됨')).toBeInTheDocument();
  });

  it('done 상태는 "완료" 라벨을 렌더한다', () => {
    render(<TaskStatusBadge status="done" />);
    expect(screen.getByText('완료')).toBeInTheDocument();
  });

  it('todo / in_progress / dropped / archived 라벨을 렌더한다', () => {
    const { rerender } = render(<TaskStatusBadge status="todo" />);
    expect(screen.getByText('대기')).toBeInTheDocument();
    rerender(<TaskStatusBadge status="in_progress" />);
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    rerender(<TaskStatusBadge status="dropped" />);
    expect(screen.getByText('취소')).toBeInTheDocument();
    rerender(<TaskStatusBadge status="archived" />);
    expect(screen.getByText('보관됨')).toBeInTheDocument();
  });

  it('className prop이 루트 span에 병합된다', () => {
    const { container } = render(
      <TaskStatusBadge status="done" className="custom-extra" />,
    );
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/custom-extra/);
  });
});
