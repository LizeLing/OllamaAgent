'use client';

import { Message } from '@/types/message';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import ToolCallDisplay from './ToolCallDisplay';
import ImageDisplay from './ImageDisplay';
import AudioPlayer from '@/components/voice/AudioPlayer';
import { useVoice } from '@/hooks/useVoice';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const { isSpeaking, speak, stopSpeaking } = useVoice();

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? 'bg-accent text-white rounded-2xl rounded-br-md px-4 py-2.5'
            : 'bg-card rounded-2xl rounded-bl-md px-4 py-3'
        }`}
      >
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {!isUser && message.images && message.images.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.images.map((img, i) => (
              <ImageDisplay key={i} image={img} />
            ))}
          </div>
        )}

        {/* TTS button for assistant messages */}
        {!isUser && message.content && (
          <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <AudioPlayer
              isSpeaking={isSpeaking}
              onSpeak={() => speak(message.content)}
              onStop={stopSpeaking}
            />
          </div>
        )}
      </div>
    </div>
  );
}
