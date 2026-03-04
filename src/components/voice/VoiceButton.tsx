'use client';

import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface VoiceButtonProps {
  isRecording: boolean;
  isTranscribing: boolean;
  onStart: () => void;
  onStop: () => void;
}

export default function VoiceButton({
  isRecording,
  isTranscribing,
  onStart,
  onStop,
}: VoiceButtonProps) {
  if (isTranscribing) {
    return (
      <button disabled className="p-2.5 text-muted rounded-lg opacity-50">
        <LoadingSpinner size={18} />
      </button>
    );
  }

  return (
    <button
      onClick={isRecording ? onStop : onStart}
      className={`p-2.5 rounded-lg transition-colors ${
        isRecording
          ? 'bg-error text-white animate-pulse'
          : 'text-muted hover:text-foreground hover:bg-card'
      }`}
      title={isRecording ? 'Stop recording' : 'Start voice input'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isRecording ? (
          <rect x="6" y="6" width="12" height="12" rx="2" />
        ) : (
          <>
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </>
        )}
      </svg>
    </button>
  );
}
