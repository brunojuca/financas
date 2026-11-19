import { addMonths, epochDay, monthEnd, monthOf } from '../dates';
import type { IsoDate, YearMonth } from '../types';
import type { Projection } from './market';
import type { MonthlyIndex } from './series';

/** Latest Focus survey (BCB "Expectativas de Mercado"), medians of all respondents, in % as published. */
export interface FocusSurvey {
  /** Survey date. */
  date: IsoDate;
  /** Selic target expected at the end of each year (% a.a.). */
  selicYearEnd: [number, number][];
  /** IPCA expected for each calendar year (%). */
  ipcaAnnual: [number, number][];
  /** IPCA expected for each month (% a.m.). */
  ipcaMonthly: [YearMonth, number][];
}

/** User-selectable assumption set (decision D8). Shifts are in percentage points a.a. */
export type Scenario =
  { kind: 'focus'; selicShift: number; ipcaShift: number } | { kind: 'custom'; selic: number; ipca: number };

export const DEFAULT_SCENARIO: Scenario = { kind: 'focus', selicShift: 0, ipcaShift: 0 };

/** Shifts an annual rate by `shift` (decimal) and returns the matching monthly rate. */
function shiftMonthly(monthly: number, shift: number): number {
  return Math.max(0, (1 + monthly) ** 12 + shift) ** (1 / 12) - 1;
}

/**
 * Projection from the Focus survey:
 * - Selic target: linear path from the current target (at the end of the published data) to each year-end
 *   expectation, then flat after the last year. Constant within a month, at the month-end value (keeps long
 *   projections fast and makes December equal the year-end expectation).
 * - IPCA: monthly expectations where available; for the rest of a year with an annual expectation, the
 *   monthly rate that completes that year's total (given published and monthly-expected months); after the
 *   last year, its monthly equivalent.
 */
export function focusProjection(
  survey: FocusSurvey,
  current: { date: IsoDate; selicTarget: number },
  ipca: MonthlyIndex,
  shifts: { selic: number; ipca: number } = { selic: 0, ipca: 0 },
): Projection {
  const points: [number, number][] = [[epochDay(current.date), current.selicTarget]];
  for (const [year, value] of [...survey.selicYearEnd].sort((a, b) => a[0] - b[0])) {
    const day = epochDay(`${year}-12-31`);
    if (day > points[points.length - 1]![0]) points.push([day, value / 100]);
  }
  const selicAt = (day: number): number => {
    if (day <= points[0]![0]) return points[0]![1];
    for (let i = 1; i < points.length; i++) {
      const [d1, v1] = points[i]!;
      if (day <= d1) {
        const [d0, v0] = points[i - 1]!;
        return v0 + ((v1 - v0) * (day - d0)) / (d1 - d0);
      }
    }
    return points[points.length - 1]![1];
  };

  const monthlyFocus = new Map(survey.ipcaMonthly.map(([m, v]) => [m, v / 100]));
  const annual = new Map(survey.ipcaAnnual.map(([y, v]) => [y, v / 100]));
  const lastAnnualYear = Math.max(...annual.keys());
  const published = (m: YearMonth): number | undefined => {
    const cur = ipca.values.get(m);
    const prev = ipca.values.get(addMonths(m, -1));
    return cur !== undefined && prev !== undefined ? cur / prev - 1 : undefined;
  };
  const residualCache = new Map<number, number>();
  /** Monthly rate filling the months of `year` not covered by published or monthly-Focus values. */
  const residual = (year: number): number => {
    const cached = residualCache.get(year);
    if (cached !== undefined) return cached;
    const total = annual.get(year)!;
    let known = 1;
    let missing = 0;
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`;
      const value = published(month) ?? monthlyFocus.get(month);
      if (value === undefined) missing++;
      else known *= 1 + value;
    }
    const rate = missing === 0 ? 0 : Math.max(0, (1 + total) / known) ** (1 / missing) - 1;
    residualCache.set(year, rate);
    return rate;
  };

  const ipcaMonthly = (month: YearMonth): number => {
    const year = Number(month.slice(0, 4));
    const base =
      monthlyFocus.get(month) ??
      (annual.has(year) ? residual(year) : (1 + annual.get(lastAnnualYear)!) ** (1 / 12) - 1);
    return shifts.ipca ? shiftMonthly(base, shifts.ipca) : base;
  };

  return {
    // Constant within a month, at the month's end value: December matches the year-end expectation.
    selicTarget: (date) => Math.max(0, selicAt(epochDay(monthEnd(monthOf(date)))) + shifts.selic),
    ipcaMonthly,
  };
}
