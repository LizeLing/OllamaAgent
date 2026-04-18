'use client';

import { useRef, useState } from 'react';
import type { KnowledgeDocument } from '@/types/knowledge';

interface DocumentListProps {
  documents: KnowledgeDocument[];
  loading: boolean;
  onUpload: (files: FileList) => void;
  onDelete: (id: string) => void;
  onAddDirectory: (directoryPath: string) => void;
}

const ACCEPTED_FORMATS = '.md,.txt,.ts,.tsx,.js,.jsx,.py,.java,.go,.rs,.c,.cpp,.h,.css,.html,.json,.yaml,.yml,.docx,.xlsx,.pptx';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

const FORMAT_ICONS: Record<string, string> = {
  markdown: '📝', text: '📄', code: '💻',
  docx: '📘', xlsx: '📊', pptx: '📙',
};

export default function DocumentList({ documents, loading, onUpload, onDelete, onAddDirectory }: DocumentListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDirInput, setShowDirInput] = useState(false);
  const [dirPath, setDirPath] = useState('');

  const handleAddDirectory = () => {
    const trimmed = dirPath.trim();
    if (!trimmed) return;
    onAddDirectory(trimmed);
    setDirPath('');
    setShowDirInput(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{documents.length}개 문서</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDirInput((v) => !v)}
            disabled={loading}
            className="px-2 py-1 text-xs bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            {showDirInput ? '취소' : '+ 디렉토리'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="px-2 py-1 text-xs bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            {loading ? '처리 중...' : '+ 파일'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              onUpload(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {showDirInput && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={dirPath}
            onChange={(e) => setDirPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddDirectory(); }}
            placeholder="/path/to/directory"
            className="flex-1 px-2 py-1.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:border-accent"
            autoFocus
          />
          <button
            onClick={handleAddDirectory}
            disabled={loading || !dirPath.trim()}
            className="px-2 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            추가
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-xs text-muted mt-2">문서 파싱 및 임베딩 중...</p>
        </div>
      )}

      {documents.length === 0 && !loading ? (
        <p className="text-xs text-muted py-8 text-center">
          문서가 없습니다. &quot;+ 문서 추가&quot;를 클릭하여 파일을 업로드하세요.
        </p>
      ) : (
        <div className="space-y-1">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-card hover:bg-card-hover transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm shrink-0">{FORMAT_ICONS[doc.format] || '📄'}</span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{doc.filename}</p>
                  <p className="text-[10px] text-muted">
                    {doc.chunkCount}청크 · {formatFileSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onDelete(doc.id)}
                className="text-xs text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
