import { addDays } from '../dates';
import { businessDaysBetween, isBusinessDay } from '../businessDays';
import type { IsoDate, YearMonth } from '../types';
import { fixedToNumber, numberToFixed } from './precision';

/** A daily series stored run-length encoded: each row's value holds until the next row (business days only). */
export interface RleSeries {
  firstDate: IsoDate;
  lastDate: IsoDate;
  /** Number of business days in the original data, used to check the calendar. */
  days?: number;
  values: [IsoDate, number][];
}

/** A daily series expanded to one value per business day from `firstDate` to `lastDate` (inclusive). */
export interface DailySeries {
  firstDate: IsoDate;
  lastDate: IsoDate;
  values: number[];
}

export function expandDaily(rle: RleSeries): DailySeries {
  const values: number[] = [];
  let next = 0;
  let current = NaN;
  for (let date = rle.firstDate; date <= rle.lastDate; date = addDays(date, 1)) {
    if (!isBusinessDay(date)) {
      if (rle.values[next]?.[0] === date)
        throw new Error(`Series has a value on a non-business day: ${date}`);
      continue;
    }
    if (rle.values[next]?.[0] === date) current = rle.values[next++]![1];
    values.push(current);
  }
  if (next !== rle.values.length) throw new Error(`Series row not on the calendar: ${rle.values[next]?.[0]}`);
  return { firstDate: rle.firstDate, lastDate: rle.lastDate, values };
}

/** Position of the first business day on or after `date` (may be past the end of the data). */
export function dayIndex(series: DailySeries, date: IsoDate): number {
  return businessDaysBetween(series.firstDate, date);
}

/** Values for the business days in [from, to). Throws if the range is not covered by the data. */
export function valuesBetween(series: DailySeries, from: IsoDate, to: IsoDate): number[] {
  const a = dayIndex(series, from);
  const b = dayIndex(series, to);
  if (a < 0 || b > series.values.length) throw new RangeError(`No data for ${from} → ${to}`);
  return series.values.slice(a, b);
}

// ---------- accumulated Selic factor (exact) ----------

const SCALE = 30;
const prefixCache = new WeakMap<DailySeries, bigint[]>();

/** Running products of daily factors (1 + v/100), v in % a.d. with up to 6 decimals, at 30 decimals. */
function prefixProducts(series: DailySeries): bigint[] {
  let prefix = prefixCache.get(series);
  if (!prefix) {
    const one = 10n ** BigInt(SCALE);
    prefix = [one];
    for (const v of series.values) {
      const factor = one + numberToFixed(v / 100, SCALE, 10);
      prefix.push((prefix[prefix.length - 1]! * factor) / one);
    }
    prefixCache.set(series, prefix);
  }
  return prefix;
}

/**
 * Product of the daily factors (1 + rate % a.d.) for the business days in [from, to), as a number with
 * full float precision. Used for the Tesouro Selic VNA (factor since 01/07/2000).
 */
export function accumulatedDailyFactor(series: DailySeries, from: IsoDate, to: IsoDate): number {
  const prefix = prefixProducts(series);
  const a = dayIndex(series, from);
  const b = dayIndex(series, to);
  if (a < 0 || b >= prefix.length) throw new RangeError(`No data for ${from} → ${to}`);
  const ratio = (prefix[b]! * 10n ** BigInt(SCALE)) / prefix[a]!;
  return fixedToNumber(ratio, SCALE);
}

// ---------- monthly index (IPCA) ----------

export interface MonthlyIndex {
  lastMonth: YearMonth;
  values: Map<YearMonth, number>;
}

export function monthlyIndex(rows: { lastDate: YearMonth; values: [YearMonth, number][] }): MonthlyIndex {
  return { lastMonth: rows.lastDate, values: new Map(rows.values) };
}
