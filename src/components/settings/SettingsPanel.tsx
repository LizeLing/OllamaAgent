'use client';

import { useState, useEffect } from 'react';
import { Settings } from '@/types/settings';
import GeneralTab from './tabs/GeneralTab';
import ModelTab from './tabs/ModelTab';
import SecurityTab from './tabs/SecurityTab';
import ExtensionsTab from './tabs/ExtensionsTab';
import AutomationTab from './tabs/AutomationTab';

interface SettingsPanelProps {
  onClose: () => void;
  settings: Settings | null;
  onSave: (updates: Partial<Settings>) => Promise<boolean>;
}

const TABS = [
  { id: 'general', label: '일반', icon: '\u2699\uFE0F' },
  { id: 'model', label: '모델', icon: '\uD83E\uDD16' },
  { id: 'security', label: '보안', icon: '\uD83D\uDD12' },
  { id: 'extensions', label: '확장', icon: '\uD83E\uDDE9' },
  { id: 'automation', label: '자동화', icon: '\u26A1' },
] as const;

type TabId = typeof TABS[number]['id'];

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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
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

        {/* Tab Bar */}
        <div className="flex border-b border-border mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors relative ${
                activeTab === tab.id
                  ? 'text-accent font-medium'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'general' && <GeneralTab draft={draft} onDraftChange={handleDraftChange} />}
        {activeTab === 'model' && <ModelTab draft={draft} onDraftChange={handleDraftChange} />}
        {activeTab === 'security' && <SecurityTab draft={draft} onDraftChange={handleDraftChange} />}
        {activeTab === 'extensions' && <ExtensionsTab draft={draft} onDraftChange={handleDraftChange} />}
        {activeTab === 'automation' && <AutomationTab />}

        {/* Save Button */}
        <div className="sticky bottom-0 pt-6 pb-2 bg-background">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
