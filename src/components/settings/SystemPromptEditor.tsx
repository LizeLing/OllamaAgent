'use client';

interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SystemPromptEditor({ value, onChange }: SystemPromptEditorProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">System Prompt</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        className="w-full bg-[#111] border border-border rounded-lg px-3 py-2 text-sm font-[family-name:var(--font-jetbrains)] resize-y focus:outline-none focus:border-accent"
      />
    </div>
  );
}
