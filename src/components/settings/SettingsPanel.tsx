'use client';

import { useState, useEffect } from 'react';
import { Settings } from '@/types/settings';
import GeneralTab from './tabs/GeneralTab';
import ModelTab from './tabs/ModelTab';
import SecurityTab from './tabs/SecurityTab';
import ExtensionsTab from './tabs/ExtensionsTab';
import AutomationTab from './tabs/AutomationTab';
import SkillEditor from './SkillEditor';
import CronJobEditor from './CronJobEditor';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface SettingsPanelProps {
  onClose: () => void;
  settings: Settings | null;
  onSave: (updates: Partial<Settings>) => Promise<boolean>;
}

const SETTING_TABS = [
  { id: 'general', label: '일반', icon: '\u2699\uFE0F' },
  { id: 'model', label: '모델', icon: '\uD83E\uDD16' },
  { id: 'security', label: '보안', icon: '\uD83D\uDD12' },
  { id: 'extensions', label: '확장', icon: '\uD83E\uDDE9' },
  { id: 'automation', label: '자동화', icon: '\u26A1' },
] as const;

const STANDALONE_TABS = [
  { id: 'skills', label: '스킬', icon: '\uD83D\uDCCB' },
  { id: 'cron', label: '예약 작업', icon: '\u23F0' },
] as const;

type TabId = typeof SETTING_TABS[number]['id'] | typeof STANDALONE_TABS[number]['id'];

const isSettingsTab = (id: TabId): id is typeof SETTING_TABS[number]['id'] =>
  SETTING_TABS.some((t) => t.id === id);

export default function SettingsPanel({ onClose, settings, onSave }: SettingsPanelProps) {
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('general');

  useEffect(() => {
    if (settings) setDraft({ ...settings });
  }, [settings]);

  const handleDraftChange = (updates: Partial<Settings>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    onClose();
  };

  if (!settings) return null;

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralTab draft={draft} onDraftChange={handleDraftChange} />;
      case 'model':
        return <ModelTab draft={draft} onDraftChange={handleDraftChange} />;
      case 'security':
        return <SecurityTab draft={draft} onDraftChange={handleDraftChange} />;
      case 'extensions':
        return <ExtensionsTab draft={draft} onDraftChange={handleDraftChange} />;
      case 'automation':
        return <AutomationTab />;
      case 'skills':
        return (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold">스킬 관리</h3>
              <HelpTooltip text="다단계 워크플로우를 정의하여 에이전트가 복잡한 작업을 체계적으로 수행하도록 합니다.\n\n/skill 명령어로 실행합니다." />
            </div>
            <SkillEditor />
          </div>
        );
      case 'cron':
        return (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold">예약 작업</h3>
              <HelpTooltip text="주기적으로 자동 실행되는 예약 작업을 관리합니다.\n\n작업 유형: 에이전트 실행, HTTP 요청, 메모리 정리, 건강 체크" />
            </div>
            <CronJobEditor />
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Sidebar Tabs */}
      <nav className="w-48 shrink-0 border-r border-border bg-card/50 overflow-y-auto py-4 px-2 hidden md:block">
        <div className="mb-1 px-2">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">설정</span>
        </div>
        {SETTING_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
              activeTab === tab.id
                ? 'bg-accent/10 text-accent font-medium'
                : 'text-muted hover:text-foreground hover:bg-card'
            }`}
          >
            <span className="text-base w-5 text-center">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}

        <div className="my-3 mx-2 border-t border-border" />

        <div className="mb-1 px-2">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">도구</span>
        </div>
        {STANDALONE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
              activeTab === tab.id
                ? 'bg-accent/10 text-accent font-medium'
                : 'text-muted hover:text-foreground hover:bg-card'
            }`}
          >
            <span className="text-base w-5 text-center">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Mobile Tab Bar (horizontal, visible only on small screens) */}
      <div className="md:hidden absolute top-0 left-0 right-0 z-10 flex overflow-x-auto border-b border-border bg-background px-2 py-1 gap-1">
        {[...SETTING_TABS, ...STANDALONE_TABS].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-accent/10 text-accent font-medium'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 md:py-8 mt-10 md:mt-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Settings</h2>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-muted hover:text-foreground bg-card hover:bg-card-hover rounded-lg transition-colors"
            >
              돌아가기
            </button>
          </div>

          {/* Tab Content */}
          {renderContent()}

          {/* Save Button (only for settings tabs) */}
          {isSettingsTab(activeTab) && (
            <div className="sticky bottom-0 pt-6 pb-2 bg-background">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
