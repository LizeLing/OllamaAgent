'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, MemoryCategoryConfig } from '@/types/settings';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface MemoryTabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
}

interface MemoryItem {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

const HELP = {
  embeddingModel: 'RAG 메모리 검색에 사용할 임베딩 모델입니다.',
  categoryPolicy: '카테고리별 검색 가중치와 메모리 만료 기간을 설정합니다.',
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: '기술',
  research: '리서치',
  preference: '선호',
  general: '일반',
};

const selectClass = 'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';

export default function MemoryTab({ draft, onDraftChange }: MemoryTabProps) {
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const ITEMS_PER_PAGE = 20;

  const fetchModels = useCallback(() => {
    setLoadingModels(true);
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const fetchMemories = useCallback(async () => {
    setLoadingMemories(true);
    try {
      const params = new URLSearchParams({
        list: 'true',
        page: currentPage.toString(),
        limit: ITEMS_PER_PAGE.toString(),
      });
      if (filterCategory) params.set('category', filterCategory);
      const res = await fetch(`/api/memory?${params}`);
      const data = await res.json();
      setMemories(data.items || []);
      setTotalCount(data.total || 0);
    } catch {
      setMemories([]);
    } finally {
      setLoadingMemories(false);
    }
  }, [currentPage, filterCategory]);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  const handleDeleteOne = async (id: string) => {
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    fetchMemories();
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    await fetch('/api/memory/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    fetchMemories();
  };

  const categories = draft.memoryCategories || {};

  const handleCategoryChange = (
    key: string,
    field: keyof MemoryCategoryConfig,
    value: number
  ) => {
    onDraftChange({
      memoryCategories: {
        ...categories,
        [key]: { ...categories[key], [field]: value },
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* 임베딩 모델 선택 */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium">임베딩 모델</label>
          <HelpTooltip text={HELP.embeddingModel} />
        </div>
        {loadingModels ? (
          <div className="text-sm text-muted py-1.5">Loading models...</div>
        ) : models.length > 0 ? (
          <div className="relative">
            <select
              value={draft.embeddingModel || ''}
              onChange={(e) => onDraftChange({ embeddingModel: e.target.value })}
              className={selectClass}
            >
              {!models.includes(draft.embeddingModel || '') && draft.embeddingModel && (
                <option value={draft.embeddingModel}>{draft.embeddingModel}</option>
              )}
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4.5L6 7.5L9 4.5"/></svg>
            </div>
          </div>
        ) : (
          <input
            value={draft.embeddingModel || ''}
            onChange={(e) => onDraftChange({ embeddingModel: e.target.value })}
            className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            placeholder="e.g. qwen3-embedding:8b"
          />
        )}
      </section>

      <hr className="border-border" />

      {/* 카테고리 정책 설정 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm font-medium">카테고리 정책</label>
          <HelpTooltip text={HELP.categoryPolicy} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="pb-2 pr-4">카테고리</th>
                <th className="pb-2 pr-4">가중치</th>
                <th className="pb-2">만료 (일)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(categories).map(([key, config]) => (
                <tr key={key} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium">{CATEGORY_LABELS[key] || key}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0.1}
                      max={3.0}
                      step={0.1}
                      value={config.weight}
                      onChange={(e) => handleCategoryChange(key, 'weight', parseFloat(e.target.value) || 1.0)}
                      className="w-20 bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={config.maxAgeDays}
                      onChange={(e) => handleCategoryChange(key, 'maxAgeDays', parseInt(e.target.value) || 30)}
                      className="w-20 bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-border" />

      {/* 저장된 메모리 테이블 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium">저장된 메모리</label>
          <button
            onClick={() => fetchMemories()}
            className="text-xs text-accent hover:text-accent-hover"
          >새로고침</button>
        </div>
        <div className="text-xs text-muted mb-3">
          총 {totalCount}개
          {memories.length > 0 && (() => {
            const counts: Record<string, number> = {};
            memories.forEach((m) => {
              const cat = (m.metadata?.category as string) || 'general';
              counts[cat] = (counts[cat] || 0) + 1;
            });
            return ' — ' + Object.entries(counts)
              .map(([k, v]) => `${CATEGORY_LABELS[k] || k} ${v}`)
              .join(' · ');
          })()}
        </div>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          />
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
            className="bg-card border border-border rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">전체</option>
            <option value="technical">기술</option>
            <option value="research">리서치</option>
            <option value="preference">선호</option>
            <option value="general">일반</option>
          </select>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="px-2 py-1.5 bg-card border border-border rounded-lg text-sm hover:bg-card-hover"
            title={sortAsc ? '오래된순' : '최신순'}
          >
            {sortAsc ? '↑' : '↓'}
          </button>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkDelete}
            className="mb-2 px-3 py-1 text-xs bg-error/10 text-error rounded-lg hover:bg-error/20"
          >
            선택 삭제 ({selectedIds.size}개)
          </button>
        )}
        {(() => {
          const displayed = memories
            .filter((m) => !searchQuery || m.text.toLowerCase().includes(searchQuery.toLowerCase()))
            .sort((a, b) => sortAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
          const allSelected = displayed.length > 0 && displayed.every((m) => selectedIds.has(m.id));

          return (
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted bg-card/50 border-b border-border">
                    <th className="p-2 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(displayed.map((m) => m.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        className="accent-accent"
                      />
                    </th>
                    <th className="p-2">내용</th>
                    <th className="p-2 w-20">카테고리</th>
                    <th className="p-2 w-28">생성일</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((m) => (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-card/30 cursor-pointer group">
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(m.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            e.target.checked ? next.add(m.id) : next.delete(m.id);
                            setSelectedIds(next);
                          }}
                          className="accent-accent"
                        />
                      </td>
                      <td
                        className="p-2 truncate max-w-xs"
                        onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                      >
                        {expandedId === m.id ? (
                          <div className="whitespace-pre-wrap text-xs">{m.text}</div>
                        ) : (
                          m.text.slice(0, 50)
                        )}
                      </td>
                      <td className="p-2">
                        <span className="px-1.5 py-0.5 rounded text-xs bg-accent/10 text-accent">
                          {CATEGORY_LABELS[(m.metadata?.category as string) || 'general'] || 'general'}
                        </span>
                      </td>
                      <td className="p-2 text-muted text-xs">
                        {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="p-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteOne(m.id); }}
                          className="text-error hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                  {displayed.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted">
                        {loadingMemories ? '로딩 중...' : '메모리가 없습니다.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })()}
        {(() => {
          const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
          if (totalPages <= 1) return null;
          return (
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs bg-card border border-border rounded disabled:opacity-30"
              >이전</button>
              <span className="text-xs text-muted">{currentPage} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs bg-card border border-border rounded disabled:opacity-30"
              >다음</button>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
