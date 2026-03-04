'use client';

import { Message } from '@/types/message';
import MessageBubble from './MessageBubble';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
}

export default function MessageList({ messages, isLoading, onEdit, onRegenerate }: MessageListProps) {
  const { ref } = useAutoScroll<HTMLDivElement>(messages);

  if (messages.length === 0) {
    return (
      <div ref={ref} className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="text-center text-muted">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-lg font-medium text-foreground mb-2">OllamaAgent</h2>
          <p className="text-sm">무엇이든 물어보세요</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {messages.map((message, idx) => (
          <MessageBubble
            key={message.id}
            message={message}
            onEdit={onEdit}
            onRegenerate={onRegenerate}
            isLast={idx === messages.length - 1}
          />
        ))}
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
