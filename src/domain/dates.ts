import type { IsoDate, YearMonth } from './types';

// All helpers work on strings / integer parts. Never `new Date('YYYY-MM-DD')` (parsed as UTC → off-by-one in Brazil).

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parseIsoDate(iso: IsoDate): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y ?? 0, month: m ?? 0, day: d ?? 0 };
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseIsoDate(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function isYearMonth(value: unknown): value is YearMonth {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function currentMonth(now: Date = new Date()): YearMonth {
  return monthOf(todayIso(now));
}

export function monthOf(iso: IsoDate): YearMonth {
  return iso.slice(0, 7);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y ?? 0, month: m ?? 0 };
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const { year, month } = parseYearMonth(ym);
  const index = year * 12 + (month - 1) + n;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`;
}

/** Number of months from `a` to `b` (b − a). */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  const pa = parseYearMonth(a);
  const pb = parseYearMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

export function monthStart(ym: YearMonth): IsoDate {
  return `${ym}-01`;
}

export function monthEnd(ym: YearMonth): IsoDate {
  const { year, month } = parseYearMonth(ym);
  return toIsoDate(year, month, daysInMonth(year, month));
}

/** Day `day` of the month, clamped to the month's last day (31 → 28/29/30). */
export function dateInMonth(ym: YearMonth, day: number): IsoDate {
  const { year, month } = parseYearMonth(ym);
  return toIsoDate(year, month, Math.min(Math.max(1, day), daysInMonth(year, month)));
}

/** Inclusive list of months from `from` to `to`. */
export function monthRange(from: YearMonth, to: YearMonth): YearMonth[] {
  const count = monthsBetween(from, to);
  return Array.from({ length: Math.max(0, count + 1) }, (_, i) => addMonths(from, i));
}

/** `18/11/2026` */
export function formatDateBR(iso: IsoDate): string {
  const { year, month, day } = parseIsoDate(iso);
  return `${pad(day)}/${pad(month)}/${pad(year, 4)}`;
}

const monthLong = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** `novembro de 2026` */
export function formatMonthLong(ym: YearMonth): string {
  const { year, month } = parseYearMonth(ym);
  return monthLong.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** `nov. de 26` → `nov/26` */
export function formatMonthShort(ym: YearMonth): string {
  const { year, month } = parseYearMonth(ym);
  return monthShort
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace('.', '')
    .replace(' de ', '/');
}

/** Days since 1970-01-01 (UTC arithmetic only, so no timezone effects). */
export function epochDay(iso: IsoDate): number {
  const { year, month, day } = parseIsoDate(iso);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function fromEpochDay(days: number): IsoDate {
  const d = new Date(days * 86_400_000);
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return fromEpochDay(epochDay(iso) + n);
}

/** Calendar days from `a` to `b` (b − a). */
export function calendarDaysBetween(a: IsoDate, b: IsoDate): number {
  return epochDay(b) - epochDay(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: IsoDate): number {
  return (epochDay(iso) + 4) % 7; // 1970-01-01 was a Thursday
}
