'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center max-w-md px-6">
        <div className="text-6xl mb-4">⚠</div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          문제가 발생했습니다
        </h2>
        <p className="text-muted text-sm mb-6">
          {error.message || '예상치 못한 오류가 발생했습니다.'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
