'use client';

import { useState } from 'react';
import { Message } from '@/types/message';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import ToolCallDisplay from './ToolCallDisplay';
import ImageDisplay from './ImageDisplay';
import AudioPlayer from '@/components/voice/AudioPlayer';
import { useVoice } from '@/hooks/useVoice';

function ThinkingToggle({ content, duration }: { content: string; duration?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const durationText = duration ? `${(duration / 1000).toFixed(1)}초` : '';

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
        >
          <polyline points="9,18 15,12 9,6" />
        </svg>
        <span>Thinking{durationText ? ` (${durationText})` : ''}</span>
      </button>
      {isOpen && (
        <div className="mt-1 pl-4 border-l-2 border-border text-xs text-muted leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onBranch?: (messageId: string) => void;
  isLast?: boolean;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;

  const dateStr = date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  return `${dateStr} ${time}`;
}

export default function MessageBubble({ message, onEdit, onRegenerate, onRetry, onBranch, isLast }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const { isSpeaking, speak, stopSpeaking } = useVoice();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? 'bg-accent text-white rounded-2xl rounded-br-md px-4 py-2.5'
            : 'bg-card rounded-2xl rounded-bl-md px-4 py-3'
        }`}
      >
        {!isUser && message.thinkingContent && (
          <ThinkingToggle
            content={message.thinkingContent}
            duration={message.thinkingDuration}
          />
        )}

        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-2">
            {message.toolCalls.map((tc) => (
              <ToolCallDisplay key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {isUser && message.attachedImages && message.attachedImages.length > 0 && (
          <div className="mb-2 flex gap-2 flex-wrap">
            {message.attachedImages.map((img, i) => (
              <img
                key={i}
                src={`data:image/png;base64,${img}`}
                alt={`첨부 이미지 ${i + 1}`}
                className="max-w-[200px] max-h-[200px] object-cover rounded-lg"
              />
            ))}
          </div>
        )}

        {isUser ? (
          isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                className="w-full bg-transparent border border-white/20 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-white/40"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setIsEditing(false)} className="px-3 py-1 text-xs text-white/60 hover:text-white">취소</button>
                <button onClick={() => { onEdit?.(message.id, editContent); setIsEditing(false); }} className="px-3 py-1 text-xs bg-white/20 rounded hover:bg-white/30">저장 및 전송</button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          )
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {!isUser && message.aborted && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            </svg>
            <span>응답이 중단되었습니다</span>
          </div>
        )}

        {!isUser && message.error && (
          <div className="mt-2 p-2 bg-error/10 border border-error/30 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-error text-sm shrink-0">&#x26A0;</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-error">{message.error}</p>
              </div>
            </div>
            {isLast && onRetry && (
              <button
                onClick={onRetry}
                className="mt-1.5 px-3 py-1 text-xs bg-error/20 text-error rounded hover:bg-error/30 transition-colors"
              >
                재시도
              </button>
            )}
          </div>
        )}

        {!isUser && message.images && message.images.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.images.map((img, i) => (
              <ImageDisplay key={i} image={img} />
            ))}
          </div>
        )}

        {/* Action buttons for user messages (edit) */}
        {isUser && !isEditing && (
          <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <span className="text-[10px] text-white/40">{formatTime(message.timestamp)}</span>
            <button onClick={() => { setEditContent(message.content); setIsEditing(true); }} className="p-1 text-white/60 hover:text-white" title="편집">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        )}

        {/* TTS + regenerate button for assistant messages */}
        {!isUser && message.content && (
          <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <span className="text-[10px] text-muted mr-1">{formatTime(message.timestamp)}</span>
            <AudioPlayer
              isSpeaking={isSpeaking}
              onSpeak={() => speak(message.content)}
              onStop={stopSpeaking}
            />
            {/* Copy button */}
            <button onClick={handleCopy} className="p-1 text-muted hover:text-foreground" title="복사">
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
            {isLast && onRegenerate && (
              <button onClick={onRegenerate} className="p-1 text-muted hover:text-foreground" title="재생성">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            )}
            {onBranch && (
              <button onClick={() => onBranch(message.id)} className="p-1 text-muted hover:text-foreground" title="여기서 분기">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
