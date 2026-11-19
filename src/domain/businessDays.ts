import { addDays, epochDay, fromEpochDay, toIsoDate, weekday } from './dates';
import type { IsoDate } from './types';

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIsoDate(year, month, day);
}

/**
 * National holidays used by the financial market (ANBIMA calendar): fixed dates, Carnaval (Monday and
 * Tuesday), Sexta-feira Santa and Corpus Christi; Consciência Negra (20/11) from 2024.
 */
export function nationalHolidays(year: number): IsoDate[] {
  const easter = easterSunday(year);
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (year >= 2024) fixed.push('11-20');
  return [
    ...fixed.map((md) => `${year}-${md}`),
    addDays(easter, -48),
    addDays(easter, -47),
    addDays(easter, -2),
    addDays(easter, 60),
  ].sort();
}

// Business-day counting is O(log n): weekdays by arithmetic, minus weekday holidays found by binary search.
const FIRST_YEAR = 1990;
const LAST_YEAR = 2150;
let holidayDays: number[] | null = null;

function weekdayHolidays(): number[] {
  if (!holidayDays) {
    const days: number[] = [];
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
      for (const h of nationalHolidays(y)) {
        const wd = weekday(h);
        if (wd !== 0 && wd !== 6) days.push(epochDay(h));
      }
    }
    holidayDays = [...new Set(days)].sort((a, b) => a - b);
  }
  return holidayDays;
}

/** Number of elements of the sorted array that are < x. */
function countBelow(sorted: number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Monday–Friday days in [0, day) counted from 1970-01-01 (a Thursday). */
function weekdaysBefore(day: number): number {
  // Shift so that index 0 is a Monday (1970-01-05 is epoch day 4).
  const shifted = day - 4;
  const weeks = Math.floor(shifted / 7);
  const rest = shifted - weeks * 7;
  return weeks * 5 + Math.min(rest, 5);
}

function businessIndex(day: number): number {
  return weekdaysBefore(day) - countBelow(weekdayHolidays(), day);
}

function checkRange(iso: IsoDate) {
  const year = Number(iso.slice(0, 4));
  if (year < FIRST_YEAR || year > LAST_YEAR) throw new RangeError(`Date out of calendar range: ${iso}`);
}

export function isBusinessDay(iso: IsoDate): boolean {
  checkRange(iso);
  const wd = weekday(iso);
  if (wd === 0 || wd === 6) return false;
  const day = epochDay(iso);
  const holidays = weekdayHolidays();
  const i = countBelow(holidays, day);
  return holidays[i] !== day;
}

/**
 * Business days (DU) in [from, to): `from` counts, `to` does not — the market convention between
 * settlement and maturity. Negative when `to` is before `from`.
 */
export function businessDaysBetween(from: IsoDate, to: IsoDate): number {
  checkRange(from);
  checkRange(to);
  return businessIndex(epochDay(to)) - businessIndex(epochDay(from));
}

/** The date itself if it is a business day, else the next one. */
export function nextBusinessDay(iso: IsoDate): IsoDate {
  let day = epochDay(iso);
  while (!isBusinessDay(fromEpochDay(day))) day++;
  return fromEpochDay(day);
}

/** Adds `n` business days (n ≥ 0) to a business day. */
export function addBusinessDays(iso: IsoDate, n: number): IsoDate {
  let day = epochDay(nextBusinessDay(iso));
  for (let left = n; left > 0;) {
    day++;
    if (isBusinessDay(fromEpochDay(day))) left--;
  }
  return fromEpochDay(day);
}
