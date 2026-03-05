'use client';

import { useState, useEffect } from 'react';
import { AgentSkill, SkillStep } from '@/types/skills';
import { v4 as uuidv4 } from 'uuid';

const AVAILABLE_TOOLS = [
  'filesystem_read',
  'filesystem_write',
  'filesystem_list',
  'filesystem_search',
  'web_search',
  'http_request',
  'code_execute',
];

export default function SkillEditor() {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [triggerCommand, setTriggerCommand] = useState('');
  const [systemPromptOverride, setSystemPromptOverride] = useState('');
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [maxIterations, setMaxIterations] = useState(10);
  const [workflow, setWorkflow] = useState<SkillStep[]>([]);

  const inputClass =
    'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';

  useEffect(() => {
    fetch('/api/skills')
      .then((r) => r.json())
      .then((data) => setSkills(data.skills || data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setName('');
    setDescription('');
    setIcon('');
    setTriggerCommand('');
    setSystemPromptOverride('');
    setEnabledTools([]);
    setMaxIterations(10);
    setWorkflow([]);
  };

  const handleAdd = async () => {
    if (!name.trim()) return;

    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          icon: icon.trim() || undefined,
          triggerCommand: triggerCommand.trim() || undefined,
          systemPromptOverride: systemPromptOverride.trim() || undefined,
          enabledTools,
          maxIterations,
          workflow,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSkills((prev) => [...prev, data.skill || data]);
        resetForm();
        setShowForm(false);
      }
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSkills((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      // silently fail
    }
  };

  const toggleTool = (tool: string) => {
    setEnabledTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const addStep = () => {
    setWorkflow((prev) => [...prev, { id: uuidv4(), instruction: '' }]);
  };

  const updateStep = (id: string, instruction: string) => {
    setWorkflow((prev) => prev.map((s) => (s.id === id ? { ...s, instruction } : s)));
  };

  const removeStep = (id: string) => {
    setWorkflow((prev) => prev.filter((s) => s.id !== id));
  };

  if (loading) {
    return <p className="text-xs text-muted">로딩 중...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={() => {
            if (showForm) resetForm();
            setShowForm(!showForm);
          }}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {showForm ? '취소' : '+ 스킬 추가'}
        </button>
      </div>

      {skills.length > 0 && (
        <div className="space-y-2 mb-3">
          {skills.map((skill) => (
            <div key={skill.id} className="flex items-center justify-between bg-card rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">{skill.icon || '\uD83D\uDCCB'}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{skill.name}</span>
                    {skill.isBuiltin && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-border rounded text-muted flex-shrink-0">
                        내장
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {skill.description || '설명 없음'}
                    <span className="ml-2 text-muted">
                      단계 {skill.workflow.length}개
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(skill.id)}
                disabled={skill.isBuiltin}
                className="text-xs text-muted hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 ml-2"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {skills.length === 0 && !showForm && (
        <p className="text-xs text-muted">등록된 스킬이 없습니다.</p>
      )}

      {showForm && (
        <div className="space-y-3 bg-card rounded-lg p-3">
          <input
            placeholder="스킬 이름 *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
          <div className="flex gap-2">
            <input
              placeholder="아이콘 (이모지)"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className={inputClass + ' !w-32'}
              maxLength={2}
            />
            <input
              placeholder="트리거 명령어 (예: /deploy)"
              value={triggerCommand}
              onChange={(e) => setTriggerCommand(e.target.value)}
              className={inputClass}
            />
          </div>

          <textarea
            placeholder="시스템 프롬프트 오버라이드 (선택)"
            value={systemPromptOverride}
            onChange={(e) => setSystemPromptOverride(e.target.value)}
            rows={3}
            className={inputClass + ' resize-none'}
          />

          {/* Enabled Tools */}
          <div>
            <label className="text-xs text-muted block mb-1.5">사용 가능 도구</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOOLS.map((tool) => (
                <label key={tool} className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledTools.includes(tool)}
                    onChange={() => toggleTool(tool)}
                    className="rounded border-border accent-accent"
                  />
                  <span className="font-mono">{tool}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Workflow Steps */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted">워크플로우 단계</label>
              <button onClick={addStep} className="text-xs text-accent hover:text-accent-hover">
                + 단계 추가
              </button>
            </div>
            {workflow.length > 0 && (
              <div className="space-y-2">
                {workflow.map((step, idx) => (
                  <div key={step.id} className="flex items-start gap-2">
                    <span className="text-xs text-muted mt-2 flex-shrink-0 w-5 text-right">
                      {idx + 1}.
                    </span>
                    <input
                      placeholder={`단계 ${idx + 1} 지시사항`}
                      value={step.instruction}
                      onChange={(e) => updateStep(step.id, e.target.value)}
                      className={inputClass}
                    />
                    <button
                      onClick={() => removeStep(step.id)}
                      className="text-error hover:text-red-400 text-xs mt-2 flex-shrink-0"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Max Iterations */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted flex-shrink-0">최대 반복</label>
            <input
              type="number"
              value={maxIterations}
              onChange={(e) => setMaxIterations(Number(e.target.value) || 10)}
              min={1}
              max={100}
              className={inputClass + ' !w-24'}
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            저장
          </button>
        </div>
      )}
    </div>
  );
}
