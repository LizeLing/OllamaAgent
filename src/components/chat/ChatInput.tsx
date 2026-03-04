'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import VoiceButton from '@/components/voice/VoiceButton';
import { useVoice } from '@/hooks/useVoice';

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  disabled?: boolean;
  onDrop?: (files: FileList) => void;
}

export default function ChatInput({ onSend, disabled, onDrop }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoice();

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && attachedImages.length === 0) || disabled) return;
    onSend(trimmed || '이 이미지를 분석해주세요.', attachedImages.length > 0 ? attachedImages : undefined);
    setInput('');
    setAttachedImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  const handleVoiceStop = useCallback(async () => {
    const text = await stopRecording();
    if (text) {
      setInput((prev) => (prev ? prev + ' ' + text : text));
    }
  }, [stopRecording]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const imageFiles: File[] = [];
    const otherFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        imageFiles.push(file);
      } else {
        otherFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      processImageFiles(imageFiles);
    }
    if (otherFiles.length > 0 && onDrop) {
      const dt = new DataTransfer();
      otherFiles.forEach((f) => dt.items.add(f));
      onDrop(dt.files);
    }
  }, [onDrop]);

  const processImageFiles = (files: File[]) => {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // Extract base64 data without the data URI prefix
        const base64 = result.split(',')[1];
        if (base64) {
          setAttachedImages((prev) => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processImageFiles(Array.from(files));
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      processImageFiles(imageFiles);
    }
  }, []);

  return (
    <div
      className={`border-t border-border bg-background p-4 ${isDragOver ? 'bg-accent/5' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto">
        {/* Attached images preview */}
        {attachedImages.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachedImages.map((img, i) => (
              <div key={i} className="relative group/img">
                <img
                  src={`data:image/png;base64,${img}`}
                  alt={`첨부 이미지 ${i + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <VoiceButton
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            onStart={startRecording}
            onStop={handleVoiceStop}
          />
          {/* Image attach button */}
          <button
            onClick={handleImageSelect}
            disabled={disabled}
            className="p-3 text-muted hover:text-foreground hover:bg-card rounded-xl transition-colors disabled:opacity-40 shrink-0"
            title="이미지 첨부"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                handleInput();
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={isDragOver ? '파일을 여기에 드롭하세요...' : attachedImages.length > 0 ? '이미지에 대해 질문하세요...' : '메시지를 입력하세요...'}
              disabled={disabled}
              rows={1}
              className="w-full resize-none bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent placeholder:text-muted disabled:opacity-50 transition-colors"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={disabled || (!input.trim() && attachedImages.length === 0)}
            className="p-3 bg-accent hover:bg-accent-hover text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
