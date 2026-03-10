import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center max-w-md px-6">
        <div className="text-6xl mb-4 text-muted">404</div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-muted text-sm mb-6">
          요청하신 페이지가 존재하지 않습니다.
        </p>
        <Link
          href="/"
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors inline-block"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
