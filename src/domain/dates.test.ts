import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dateInMonth,
  formatDateBR,
  formatMonthLong,
  formatMonthShort,
  isIsoDate,
  monthEnd,
  monthRange,
  monthsBetween,
  todayIso,
} from './dates';

describe('dates', () => {
  it('adds months across year boundaries', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-05', 0)).toBe('2026-05');
  });

  it('counts months between', () => {
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
    expect(monthsBetween('2026-02', '2025-11')).toBe(-3);
  });

  it('clamps day to month length', () => {
    expect(dateInMonth('2026-02', 31)).toBe('2026-02-28');
    expect(dateInMonth('2028-02', 30)).toBe('2028-02-29');
    expect(dateInMonth('2026-04', 31)).toBe('2026-04-30');
  });

  it('knows month end (spreadsheet EOMONTH)', () => {
    expect(monthEnd('2026-10')).toBe('2026-10-31');
    expect(monthEnd('2026-11')).toBe('2026-11-30');
  });

  it('builds inclusive month ranges', () => {
    expect(monthRange('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthRange('2026-11', '2026-10')).toEqual([]);
  });

  it('uses the local calendar date for today', () => {
    expect(todayIso(new Date(2026, 10, 18, 23, 59))).toBe('2026-11-18');
  });

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('18/11/2026')).toBe(false);
  });

  it('formats in pt-BR', () => {
    expect(formatDateBR('2026-11-08')).toBe('08/11/2026');
    expect(formatMonthLong('2026-10')).toBe('outubro de 2026');
    expect(formatMonthShort('2026-10')).toBe('out/26');
  });
});
