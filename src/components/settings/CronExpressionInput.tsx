'use client';

interface CronExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
}

function validateCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const patterns = [
    /^(\*|(\d+|\*)(\/\d+)?)(,(\d+|\*)(\/\d+)?)*$/, // minute
    /^(\*|(\d+|\*)(\/\d+)?)(,(\d+|\*)(\/\d+)?)*$/, // hour
    /^(\*|(\d+|\*)(\/\d+)?)(,(\d+|\*)(\/\d+)?)*$/, // day
    /^(\*|(\d+|\*)(\/\d+)?)(,(\d+|\*)(\/\d+)?)*$/, // month
    /^(\*|(\d+|\*)(\/\d+)?)(,(\d+|\*)(\/\d+)?)*$/, // weekday
  ];
  return parts.every((p, i) => patterns[i].test(p));
}

export function describeCron(expr: string): string {
  if (expr === '* * * * *') return '매분';
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return expr;
  if (parts[0].startsWith('*/')) return `${parts[0].slice(2)}분마다`;
  if (parts[0] === '0' && parts[1] === '*') return '매시 정각';
  if (parts[0] === '0' && parts[1] !== '*') return `매일 ${parts[1]}시`;
  return '커스텀 스케줄';
}

const presets = [
  { label: '매분', value: '* * * * *' },
  { label: '5분마다', value: '*/5 * * * *' },
  { label: '매시 정각', value: '0 * * * *' },
  { label: '매일 자정', value: '0 0 * * *' },
  { label: '매일 오전 3시', value: '0 3 * * *' },
  { label: '매주 월요일', value: '0 0 * * 1' },
];

export default function CronExpressionInput({ value, onChange }: CronExpressionInputProps) {
  const inputClass =
    'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';

  const isValid = value.trim().length > 0 && validateCron(value);
  const hasInput = value.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="* * * * * (분 시 일 월 요일)"
          className={inputClass}
        />
        {hasInput && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
            {isValid ? (
              <span className="text-green-500">&#10003;</span>
            ) : (
              <span className="text-red-500">&#10007;</span>
            )}
          </span>
        )}
      </div>

      {hasInput && isValid && (
        <p className="text-xs text-muted">{describeCron(value)}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              value === preset.value
                ? 'bg-accent text-white border-accent'
                : 'bg-card border-border text-muted hover:border-accent hover:text-foreground'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
