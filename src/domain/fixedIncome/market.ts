import { addBusinessDays, businessDaysBetween } from '../businessDays';
import { addMonths } from '../dates';
import type { IsoDate, YearMonth } from '../types';
import { diFactor } from './di';
import { ipcaIndexAt, tesouroIpcaVna } from './ipca';
import { round } from './precision';
import { accumulatedDailyFactor, valuesBetween, type DailySeries, type MonthlyIndex } from './series';
import { selicVna } from './tesouro';

/** Assumptions for dates after the last published value. Rates are decimals. */
export interface Projection {
  /** Selic target (meta Copom, a.a.) in force on a future date. Must be constant within a calendar month. */
  selicTarget(date: IsoDate): number;
  /** Monthly IPCA for a month not yet published. */
  ipcaMonthly(month: YearMonth): number;
}

/** Selic over and CDI are both projected as the target minus 0,10 p.p. (decision D8). */
export const OVER_SPREAD = 0.001;

/** Published history plus the projection used beyond it. */
export interface MarketData {
  /** Selic over, % a.d. (SGS 11). */
  selic: DailySeries;
  /** CDI, % a.a. (SGS 4389). */
  cdi: DailySeries;
  /** Selic target, % a.a. (SGS 432): each row holds from its date until the next one (calendar days). */
  selicTarget: { lastDate: IsoDate; values: [IsoDate, number][] };
  ipca: MonthlyIndex;
  projection: Projection;
  /** Official Tesouro Reserva unit price on a date (from the Tesouro Direto site), when known. */
  reservaPrice?: { date: IsoDate; price: number } | null;
}

/** Flat projection: the current Selic target forever and a fixed annual IPCA. */
export function flatProjection(selicTarget: number, ipcaAnnual: number): Projection {
  const monthly = (1 + ipcaAnnual) ** (1 / 12) - 1;
  return { selicTarget: () => selicTarget, ipcaMonthly: () => monthly };
}

/** Daily Selic over (% a.d., 6 decimals as published) implied by a projected target. */
function projectedSelicDaily(target: number): number {
  return round(((1 + target - OVER_SPREAD) ** (1 / 252) - 1) * 100, 6);
}

/** Splits [from, to) into the published part and the projected business days after it. */
function split(series: DailySeries, from: IsoDate, to: IsoDate) {
  const firstProjected = addBusinessDays(series.lastDate, 1);
  const knownTo = to < firstProjected ? to : firstProjected;
  const projectedFrom = from > firstProjected ? from : firstProjected;
  return { knownTo, projectedFrom, hasKnown: from < knownTo, hasProjected: projectedFrom < to };
}

/** Splits [from, to) into calendar-month pieces: `fn(start, businessDays)` for each (projected part only). */
function eachMonth(from: IsoDate, to: IsoDate, fn: (start: IsoDate, businessDays: number) => void) {
  for (let start = from; start < to;) {
    const nextMonth = `${addMonths(start.slice(0, 7), 1)}-01`;
    const end = nextMonth < to ? nextMonth : to;
    const n = businessDaysBetween(start, end);
    if (n > 0) fn(start, n);
    start = end;
  }
}

/** Accumulated Selic factor over the business days in [from, to): published, then projected. */
export function selicFactor(market: MarketData, from: IsoDate, to: IsoDate): number {
  if (to <= from) return 1;
  const { knownTo, projectedFrom, hasKnown, hasProjected } = split(market.selic, from, to);
  let factor = hasKnown ? accumulatedDailyFactor(market.selic, from, knownTo) : 1;
  if (hasProjected) {
    eachMonth(projectedFrom, to, (start, n) => {
      factor *= (1 + projectedSelicDaily(market.projection.selicTarget(start)) / 100) ** n;
    });
  }
  return factor;
}

/** Tesouro Selic VNA on a date (factor since 01/07/2000). */
export function selicVnaAt(market: MarketData, date: IsoDate): number {
  return selicVna(selicFactor(market, '2000-07-01', date));
}

/** CDI rates (% a.a., 2 decimals) for each business day in [from, to): published, then projected. */
export function cdiRates(market: MarketData, from: IsoDate, to: IsoDate): number[] {
  if (to <= from) return [];
  const { knownTo, projectedFrom, hasKnown, hasProjected } = split(market.cdi, from, to);
  const rates = hasKnown ? valuesBetween(market.cdi, from, knownTo) : [];
  if (hasProjected) {
    eachMonth(projectedFrom, to, (start, n) => {
      const rate = round((market.projection.selicTarget(start) - OVER_SPREAD) * 100, 2);
      for (let i = 0; i < n; i++) rates.push(rate);
    });
  }
  return rates;
}

export function cdiFactor(market: MarketData, from: IsoDate, to: IsoDate, percentOfCdi = 100): number {
  return diFactor(cdiRates(market, from, to), percentOfCdi);
}

/** Tesouro IPCA+ VNA on a date, using Focus/flat IPCA for months not yet published. */
export function ipcaVnaAt(market: MarketData, date: IsoDate): number {
  return tesouroIpcaVna(date, market.ipca, market.projection.ipcaMonthly);
}

/** IPCA accumulated between two months' indexes (for real rates), projected where needed. */
export function ipcaBetweenMonths(market: MarketData, from: YearMonth, to: YearMonth): number {
  const index = (m: YearMonth) => ipcaIndexAt(market.ipca, m, market.projection.ipcaMonthly);
  return index(to) / index(from) - 1;
}

/** The Selic target published for a date, or the projection after the data ends. */
export function selicTargetOn(market: MarketData, date: IsoDate): number {
  const { values, lastDate } = market.selicTarget;
  if (date > lastDate || values.length === 0 || date < values[0]![0])
    return market.projection.selicTarget(date);
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (values[mid]![0] <= date) lo = mid;
    else hi = mid - 1;
  }
  return values[lo]![1] / 100;
}

/** Month of the last published IPCA and the next one to be projected. */
export function ipcaFrontier(market: MarketData): { last: YearMonth; next: YearMonth } {
  return { last: market.ipca.lastMonth, next: addMonths(market.ipca.lastMonth, 1) };
}
