'use client';

interface AudioPlayerProps {
  isSpeaking: boolean;
  onSpeak: () => void;
  onStop: () => void;
}

export default function AudioPlayer({ isSpeaking, onSpeak, onStop }: AudioPlayerProps) {
  return (
    <button
      onClick={isSpeaking ? onStop : onSpeak}
      className={`p-1.5 rounded transition-colors ${
        isSpeaking
          ? 'text-accent animate-pulse'
          : 'text-muted hover:text-foreground'
      }`}
      title={isSpeaking ? 'Stop' : 'Read aloud'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isSpeaking ? (
          <>
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </>
        ) : (
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </>
        )}
      </svg>
    </button>
  );
}
