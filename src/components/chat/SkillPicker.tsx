'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentSkill } from '@/types/skills';

interface SkillPickerProps {
  visible: boolean;
  onSelect: (skillId: string, skillName: string) => void;
  onClose: () => void;
  filter?: string;
}

export default function SkillPicker({ visible, onSelect, onClose, filter }: SkillPickerProps) {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevFilter, setPrevFilter] = useState(filter);
  const listRef = useRef<HTMLDivElement>(null);

  // filter가 바뀌면 선택 인덱스를 0으로 리셋 (render 중 직전 값 비교 패턴)
  let activeIndex = selectedIndex;
  if (prevFilter !== filter) {
    setPrevFilter(filter);
    setSelectedIndex(0);
    activeIndex = 0;
  }

  useEffect(() => {
    if (!visible) return;
    fetch('/api/skills')
      .then((r) => r.json())
      .then((data) => setSkills(data.skills || data))
      .catch(() => {});
  }, [visible]);

  const filtered = skills.filter((s) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.triggerCommand && s.triggerCommand.toLowerCase().includes(q))
    );
  });

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-skill-item]');
    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const skill = filtered[activeIndex];
        if (skill) onSelect(skill.id, skill.name);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [visible, filtered, activeIndex, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto z-50"
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted">
          {skills.length === 0 ? '스킬을 불러오는 중...' : '일치하는 스킬이 없습니다'}
        </div>
      ) : (
        filtered.map((skill, idx) => (
          <button
            key={skill.id}
            data-skill-item
            onClick={() => onSelect(skill.id, skill.name)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-border/50 transition-colors ${
              idx === activeIndex ? 'bg-border/50' : ''
            }`}
          >
            <span className="text-base flex-shrink-0">{skill.icon || '\uD83D\uDCCB'}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{skill.name}</div>
              {skill.description && (
                <div className="text-xs text-muted truncate">{skill.description}</div>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
