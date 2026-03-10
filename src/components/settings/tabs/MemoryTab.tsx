'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, MemoryCategoryConfig } from '@/types/settings';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface MemoryTabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
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

  const fetchModels = useCallback(() => {
    setLoadingModels(true);
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => setModels(data.models || []))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

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
    </div>
  );
}
