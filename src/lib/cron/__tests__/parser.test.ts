import { describe, it, expect, vi, afterEach } from 'vitest';
import { isValidCronExpression, shouldRunNow, getNextRunTime, describeCron } from '../parser';

describe('isValidCronExpression', () => {
  it('유효한 표현식을 허용한다', () => {
    expect(isValidCronExpression('* * * * *')).toBe(true);
    expect(isValidCronExpression('0 0 * * *')).toBe(true);
    expect(isValidCronExpression('*/5 * * * *')).toBe(true);
    expect(isValidCronExpression('0 9 1 1 *')).toBe(true);
    expect(isValidCronExpression('0 0 * * 0')).toBe(true);
    expect(isValidCronExpression('1,15,30 * * * *')).toBe(true);
    expect(isValidCronExpression('0-30 * * * *')).toBe(true);
    expect(isValidCronExpression('0-30/5 * * * *')).toBe(true);
  });

  it('유효하지 않은 표현식을 거부한다', () => {
    expect(isValidCronExpression('')).toBe(false);
    expect(isValidCronExpression('* * *')).toBe(false);
    expect(isValidCronExpression('* * * * * *')).toBe(false);
    expect(isValidCronExpression('60 * * * *')).toBe(false);
    expect(isValidCronExpression('* 24 * * *')).toBe(false);
    expect(isValidCronExpression('* * 0 * *')).toBe(false);
    expect(isValidCronExpression('* * * 13 *')).toBe(false);
    expect(isValidCronExpression('* * * * 7')).toBe(false);
    expect(isValidCronExpression('abc * * * *')).toBe(false);
  });

  it('범위 역전을 거부한다', () => {
    expect(isValidCronExpression('30-10 * * * *')).toBe(false);
  });

  it('스텝이 0인 경우를 거부한다', () => {
    expect(isValidCronExpression('*/0 * * * *')).toBe(false);
  });
});

describe('shouldRunNow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('현재 시간이 매치되면 true를 반환한다', () => {
    vi.useFakeTimers();
    // 2025-01-15 수요일 10:30
    vi.setSystemTime(new Date(2025, 0, 15, 10, 30, 0));

    expect(shouldRunNow('* * * * *')).toBe(true);
    expect(shouldRunNow('30 10 * * *')).toBe(true);
    expect(shouldRunNow('30 10 15 1 *')).toBe(true);
    expect(shouldRunNow('30 10 * * 3')).toBe(true); // 수요일=3
  });

  it('현재 시간이 매치되지 않으면 false를 반환한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 30, 0));

    expect(shouldRunNow('0 10 * * *')).toBe(false);  // minute 불일치
    expect(shouldRunNow('30 11 * * *')).toBe(false);  // hour 불일치
    expect(shouldRunNow('30 10 16 * *')).toBe(false); // day 불일치
    expect(shouldRunNow('30 10 * 2 *')).toBe(false);  // month 불일치
    expect(shouldRunNow('30 10 * * 1')).toBe(false);  // dow 불일치
  });

  it('같은 분 내 중복 실행을 방지한다', () => {
    vi.useFakeTimers();
    const now = new Date(2025, 0, 15, 10, 30, 0);
    vi.setSystemTime(now);

    // lastRunAt이 같은 분이면 false
    const lastRunAt = new Date(2025, 0, 15, 10, 30, 15).getTime();
    expect(shouldRunNow('* * * * *', lastRunAt)).toBe(false);
  });

  it('lastRunAt이 다른 분이면 실행을 허용한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 30, 0));

    const lastRunAt = new Date(2025, 0, 15, 10, 29, 0).getTime();
    expect(shouldRunNow('* * * * *', lastRunAt)).toBe(true);
  });

  it('유효하지 않은 표현식이면 false를 반환한다', () => {
    expect(shouldRunNow('invalid')).toBe(false);
  });
});

describe('getNextRunTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('매분 실행이면 다음 분을 반환한다', () => {
    vi.useFakeTimers();
    const from = new Date(2025, 0, 15, 10, 30, 0);
    vi.setSystemTime(from);

    const next = getNextRunTime('* * * * *', from);
    const nextDate = new Date(next);
    expect(nextDate.getMinutes()).toBe(31);
  });

  it('특정 시각의 다음 실행 시간을 반환한다', () => {
    const from = new Date(2025, 0, 15, 10, 30, 0);
    const next = getNextRunTime('0 12 * * *', from);
    const nextDate = new Date(next);
    expect(nextDate.getHours()).toBe(12);
    expect(nextDate.getMinutes()).toBe(0);
  });

  it('이미 지난 시각이면 다음 날을 반환한다', () => {
    const from = new Date(2025, 0, 15, 14, 0, 0);
    const next = getNextRunTime('0 9 * * *', from);
    const nextDate = new Date(next);
    expect(nextDate.getDate()).toBe(16);
    expect(nextDate.getHours()).toBe(9);
  });

  it('유효하지 않은 표현식이면 0을 반환한다', () => {
    expect(getNextRunTime('invalid')).toBe(0);
  });
});

describe('describeCron', () => {
  it('매분을 설명한다', () => {
    expect(describeCron('* * * * *')).toBe('매분');
  });

  it('N분마다를 설명한다', () => {
    expect(describeCron('*/5 * * * *')).toBe('5분마다');
    expect(describeCron('*/30 * * * *')).toBe('30분마다');
  });

  it('매시 정각을 설명한다', () => {
    expect(describeCron('0 * * * *')).toBe('매시 정각');
  });

  it('N시간마다를 설명한다', () => {
    expect(describeCron('0 */2 * * *')).toBe('2시간마다');
  });

  it('매일 특정 시각을 설명한다', () => {
    expect(describeCron('0 9 * * *')).toBe('매일 오전 9시');
    expect(describeCron('30 14 * * *')).toBe('매일 오후 2시 30분');
    expect(describeCron('0 0 * * *')).toBe('매일 자정');
  });

  it('매주 특정 요일을 설명한다', () => {
    expect(describeCron('0 9 * * 1')).toBe('매주 월요일 오전 9시');
    expect(describeCron('0 18 * * 5')).toBe('매주 금요일 오후 6시');
  });

  it('매월 특정 일을 설명한다', () => {
    expect(describeCron('0 9 1 * *')).toBe('매월 1일 오전 9시');
    expect(describeCron('0 0 15 * *')).toBe('매월 15일 오전 12시');
  });

  it('특정 날짜를 설명한다', () => {
    expect(describeCron('0 9 25 12 *')).toBe('12월 25일 오전 9시');
  });

  it('변환 불가능한 표현식은 원본을 반환한다', () => {
    expect(describeCron('invalid')).toBe('invalid');
  });
});
