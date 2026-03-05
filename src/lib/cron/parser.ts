const FIELD_NAMES = ['minute', 'hour', 'day-of-month', 'month', 'day-of-week'] as const;
const FIELD_RANGES: [number, number][] = [
  [0, 59],  // minute
  [0, 23],  // hour
  [1, 31],  // day-of-month
  [1, 12],  // month
  [0, 6],   // day-of-week (0=Sunday)
];

function parseField(field: string, [min, max]: [number, number]): number[] | null {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(\*|\d+-\d+)\/(\d+)$/);
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);

    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      if (step <= 0) return null;
      let start = min;
      let end = max;
      if (stepMatch[1] !== '*') {
        const rm = stepMatch[1].match(/^(\d+)-(\d+)$/);
        if (!rm) return null;
        start = parseInt(rm[1], 10);
        end = parseInt(rm[2], 10);
      }
      if (start < min || end > max || start > end) return null;
      for (let i = start; i <= end; i += step) values.add(i);
    } else if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start < min || end > max || start > end) return null;
      for (let i = start; i <= end; i++) values.add(i);
    } else {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < min || num > max) return null;
      values.add(num);
    }
  }

  return values.size > 0 ? Array.from(values).sort((a, b) => a - b) : null;
}

function parseExpression(expr: string): number[][] | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const fields: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const parsed = parseField(parts[i], FIELD_RANGES[i]);
    if (!parsed) return null;
    fields.push(parsed);
  }
  return fields;
}

export function isValidCronExpression(expr: string): boolean {
  return parseExpression(expr) !== null;
}

export function shouldRunNow(expr: string, lastRunAt?: number): boolean {
  const fields = parseExpression(expr);
  if (!fields) return false;

  const now = new Date();

  // Prevent duplicate run within the same minute
  if (lastRunAt) {
    const lastRun = new Date(lastRunAt);
    if (
      lastRun.getFullYear() === now.getFullYear() &&
      lastRun.getMonth() === now.getMonth() &&
      lastRun.getDate() === now.getDate() &&
      lastRun.getHours() === now.getHours() &&
      lastRun.getMinutes() === now.getMinutes()
    ) {
      return false;
    }
  }

  const [minutes, hours, doms, months, dows] = fields;
  return (
    minutes.includes(now.getMinutes()) &&
    hours.includes(now.getHours()) &&
    doms.includes(now.getDate()) &&
    months.includes(now.getMonth() + 1) &&
    dows.includes(now.getDay())
  );
}

export function getNextRunTime(expr: string, from?: Date): number {
  const fields = parseExpression(expr);
  if (!fields) return 0;

  const [minutes, hours, doms, months, dows] = fields;
  const start = from ? new Date(from) : new Date();
  // Start from next minute
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // Search up to 366 days ahead
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (
      minutes.includes(start.getMinutes()) &&
      hours.includes(start.getHours()) &&
      doms.includes(start.getDate()) &&
      months.includes(start.getMonth() + 1) &&
      dows.includes(start.getDay())
    ) {
      return start.getTime();
    }
    start.setMinutes(start.getMinutes() + 1);
  }

  return 0;
}

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minute, hour, dom, month, dow] = parts;

  // "* * * * *" → 매분
  if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return '매분';
  }

  // "*/N * * * *" → N분마다
  const minStep = minute.match(/^\*\/(\d+)$/);
  if (minStep && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `${minStep[1]}분마다`;
  }

  // "0 * * * *" → 매시 정각
  if (minute === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return '매시 정각';
  }

  // "*/N * * * *" with specific hour handled above

  const minVal = parseInt(minute, 10);
  const hourVal = parseInt(hour, 10);
  const domVal = parseInt(dom, 10);
  const dowVal = parseInt(dow, 10);

  const dowNames = ['일', '월', '화', '수', '목', '금', '토'];
  const timeStr = (h: number, m: number) => {
    const period = h < 12 ? '오전' : '오후';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0
      ? `${period} ${displayH}시`
      : `${period} ${displayH}시 ${m}분`;
  };

  // Specific minute and hour
  if (!isNaN(minVal) && !isNaN(hourVal)) {
    // "M H D M *" → 특정 날짜
    if (!isNaN(domVal) && month !== '*' && dow === '*') {
      const monthVal = parseInt(month, 10);
      if (!isNaN(monthVal)) {
        return `${monthVal}월 ${domVal}일 ${timeStr(hourVal, minVal)}`;
      }
    }
    // "M H D * *" → 매월 D일
    if (!isNaN(domVal) && month === '*' && dow === '*') {
      return `매월 ${domVal}일 ${timeStr(hourVal, minVal)}`;
    }
    // "M H * * D" → 매주 요일
    if (dom === '*' && month === '*' && !isNaN(dowVal)) {
      return `매주 ${dowNames[dowVal]}요일 ${timeStr(hourVal, minVal)}`;
    }
    // "M H * * *" → 매일
    if (dom === '*' && month === '*' && dow === '*') {
      if (hourVal === 0 && minVal === 0) return '매일 자정';
      return `매일 ${timeStr(hourVal, minVal)}`;
    }
  }

  // "0 */N * * *" → N시간마다
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (minute === '0' && hourStep && dom === '*' && month === '*' && dow === '*') {
    return `${hourStep[1]}시간마다`;
  }

  return expr;
}
