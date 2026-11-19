import { calendarDaysBetween, monthOf } from '../dates';
import type { Cents, IsoDate } from '../types';
import { ipcaBetweenMonths, type MarketData } from './market';
import type { PortfolioSummary } from './portfolio';
import { valueLot } from './valuation';

export interface ProjectionPoint {
  date: IsoDate;
  /** Net value, if redeemed on that date, of what is still held. */
  held: Cents;
  /** Net received from maturities between today and that date (not reinvested). */
  received: Cents;
  /** held + received, in money of that date. */
  total: Cents;
  /** `total` in today's money (deflated by IPCA, projected). */
  totalReal: Cents;
}

export interface MaturityYear {
  year: number;
  /** Net received at maturities in that year. */
  net: Cents;
}

export interface PortfolioProjection {
  points: ProjectionPoint[];
  maturities: MaturityYear[];
  /** Portfolio net return above IPCA (a.a.), from today to the last maturity. */
  realRate: number | null;
}

/**
 * Projects the current positions (held to maturity, nothing reinvested) to each year-end until the last
 * maturity: values "na curva" with the market projection (Focus scenario) after the published data.
 */
export function projectPortfolio(
  summary: PortfolioSummary,
  today: IsoDate,
  market: MarketData,
): PortfolioProjection {
  const rows = summary.rows.filter((r) => !r.matured);
  const lastMaturity = summary.lastMaturity && summary.lastMaturity > today ? summary.lastMaturity : null;
  const lastYear = Number((lastMaturity ?? today).slice(0, 4));
  const dates = [today];
  for (let year = Number(today.slice(0, 4)); year <= lastYear; year++) {
    const end = `${year}-12-31`;
    if (end > today && (!lastMaturity || end < lastMaturity)) dates.push(end);
  }
  if (lastMaturity) dates.push(lastMaturity);

  const deflator = (date: IsoDate) => 1 + ipcaBetweenMonths(market, monthOf(today), monthOf(date));
  const points = dates.map((date): ProjectionPoint => {
    let held = 0;
    let received = 0;
    for (const row of rows) {
      for (const lot of row.lots) {
        if (row.titulo.maturity && row.titulo.maturity <= date) received += lot.atMaturity!.net;
        else held += valueLot(row.titulo, lot.lot, date, market, lot.exemption).net;
      }
    }
    const total = held + received;
    return { date, held, received, total, totalReal: Math.round(total / deflator(date)) };
  });

  const byYear = new Map<number, number>();
  for (const row of rows) {
    if (!row.titulo.maturity || !row.atMaturity) continue;
    const year = Number(row.titulo.maturity.slice(0, 4));
    byYear.set(year, (byYear.get(year) ?? 0) + row.atMaturity.net);
  }
  const maturities = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, net]) => ({ year, net }));

  let realRate: number | null = null;
  if (summary.netRate !== null && lastMaturity) {
    const years = calendarDaysBetween(today, lastMaturity) / 365;
    const ipcaYearly = deflator(lastMaturity) ** (1 / years) - 1;
    realRate = (1 + summary.netRate) / (1 + ipcaYearly) - 1;
  }
  return { points, maturities, realRate };
}
