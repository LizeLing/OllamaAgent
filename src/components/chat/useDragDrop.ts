'use client';

import { useState, useCallback, useRef } from 'react';
import { addToast } from '@/hooks/useToast';

export function useDragDrop(handleSend: (msg: string, imgs?: string[]) => void) {
  const [isDragOverPage, setIsDragOverPage] = useState(false);
  const dragCounterRef = useRef(0);

  const handleFileDrop = useCallback(async (files: FileList) => {
    for (const file of Array.from(files).slice(0, 5)) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.status === 429) {
          addToast('warning', '업로드 요청이 너무 많습니다.');
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.content) {
            handleSend(`파일 "${data.originalName}"의 내용입니다:\n\n\`\`\`\n${data.content}\n\`\`\``);
          } else if (data.imageBase64) {
            handleSend(`이미지 "${data.originalName}"을 분석해주세요.`, [data.imageBase64]);
          } else {
            handleSend(`파일 "${data.originalName}"을 업로드했습니다. (경로: ${data.path})`);
          }
        } else {
          const err = await res.json().catch(() => ({ error: 'Upload failed' }));
          addToast('error', err.error || '업로드 실패');
        }
      } catch (err) {
        console.error('[handleFileDrop]', err);
        addToast('error', '파일 업로드에 실패했습니다.');
      }
    }
  }, [handleSend]);

  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOverPage(true);
    }
  }, []);

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOverPage(false);
    }
  }, []);

  const handlePageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOverPage(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileDrop(files);
    }
  }, [handleFileDrop]);

  return {
    isDragOverPage,
    handleFileDrop,
    handlePageDragEnter,
    handlePageDragLeave,
    handlePageDrop,
  };
}
