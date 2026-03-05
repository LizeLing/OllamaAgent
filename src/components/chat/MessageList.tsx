'use client';

import { Message } from '@/types/message';
import MessageBubble from './MessageBubble';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useState, useEffect, useRef } from 'react';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
  onSend?: (content: string) => void;
  onBranch?: (messageId: string) => void;
}

const SUGGESTIONS = [
  {
    icon: '💻',
    title: '코드 작성',
    prompt: 'Python으로 간단한 웹 스크래퍼를 만들어주세요',
  },
  {
    icon: '📄',
    title: '파일 분석',
    prompt: '현재 디렉토리의 파일 목록을 보여주세요',
  },
  {
    icon: '🔍',
    title: '웹 검색',
    prompt: '최신 AI 뉴스를 검색해주세요',
  },
  {
    icon: '🧮',
    title: '문제 풀기',
    prompt: '피보나치 수열의 10번째 값을 구하는 코드를 작성하고 실행해주세요',
  },
];

const VIRTUAL_THRESHOLD = 100;
const RENDER_BUFFER = 20;

export default function MessageList({ messages, isLoading, onEdit, onRegenerate, onSend, onBranch }: MessageListProps) {
  const { ref } = useAutoScroll<HTMLDivElement>(messages);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: messages.length });
  const useVirtual = messages.length >= VIRTUAL_THRESHOLD;
  const sentinelTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!useVirtual) {
      setVisibleRange({ start: 0, end: messages.length });
      return;
    }
    setVisibleRange({
      start: Math.max(0, messages.length - RENDER_BUFFER * 2),
      end: messages.length,
    });
  }, [messages.length, useVirtual]);

  useEffect(() => {
    if (!useVirtual || !sentinelTopRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleRange.start > 0) {
          setVisibleRange((prev) => ({
            start: Math.max(0, prev.start - RENDER_BUFFER),
            end: prev.end,
          }));
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelTopRef.current);
    return () => observer.disconnect();
  }, [useVirtual, visibleRange.start]);

  if (messages.length === 0) {
    return (
      <div ref={ref} className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="text-center max-w-lg px-4">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-lg font-medium text-foreground mb-2">OllamaAgent</h2>
          <p className="text-sm text-muted mb-6">무엇이든 물어보세요</p>
          <div className="grid grid-cols-2 gap-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                onClick={() => onSend?.(s.prompt)}
                className="text-left p-3 bg-card hover:bg-card-hover border border-border rounded-xl transition-colors group"
              >
                <div className="text-lg mb-1">{s.icon}</div>
                <div className="text-xs font-medium text-foreground mb-0.5">{s.title}</div>
                <div className="text-[11px] text-muted leading-snug line-clamp-2">{s.prompt}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const visibleMessages = useVirtual
    ? messages.slice(visibleRange.start, visibleRange.end)
    : messages;

  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {useVirtual && visibleRange.start > 0 && (
          <div ref={sentinelTopRef} className="h-4 flex items-center justify-center">
            <span className="text-[10px] text-muted">이전 메시지 {visibleRange.start}개 ...</span>
          </div>
        )}

        {visibleMessages.map((message, idx) => {
          const globalIdx = useVirtual ? visibleRange.start + idx : idx;
          return (
            <MessageBubble
              key={message.id}
              message={message}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
              onRetry={onRegenerate}
              onBranch={onBranch}
              isLast={globalIdx === messages.length - 1}
            />
          );
        })}
        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="flex items-center gap-2 text-muted text-sm ml-1 mb-4">
            <LoadingSpinner size={16} />
            <span>생각하고 있습니다...</span>
          </div>
        )}
      </div>
    </div>
  );
}
