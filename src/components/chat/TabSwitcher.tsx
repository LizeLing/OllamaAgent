'use client';

interface Tab<T extends string> {
  value: T;
  label: string;
}

interface TabSwitcherProps<T extends string> {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export default function TabSwitcher<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
}: TabSwitcherProps<T>) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-accent/20 text-accent'
                : 'text-muted hover:text-foreground hover:bg-card-hover'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
