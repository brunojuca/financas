import { addDays, addMonths, monthEnd, monthOf } from '../dates';
import type { Cents, IsoDate, YearMonth } from '../types';
import type { MarketData } from './market';
import { positionOn } from './redemption';
import type { Lot, Redemption, Titulo } from './types';
import { lotGrossValue } from './valuation';

export interface MonthEarnings {
  month: YearMonth;
  /** Gross earnings "na curva" in the month (before IR, IOF, custody), in cents. */
  earnings: Cents;
  /** Money that was earning in the month: value at the start (or when bought, if later). */
  base: Cents;
  /** earnings ÷ base. */
  rate: number;
  /** True for months after `today` (or partly after): uses the projection (Focus/scenario). */
  projected: boolean;
}

/**
 * Gross earnings on the curve, month by month: for each lot held at the end of the month (after redemptions),
 * value at the end minus value at the start of the month (or at purchase). Past months use published indexes;
 * later months the market projection. Taxes are left out: they depend on when you redeem.
 */
export function monthlyEarnings(
  titulos: Titulo[],
  lots: Lot[],
  redemptions: Redemption[],
  months: YearMonth[],
  today: IsoDate,
  market: MarketData,
): MonthEarnings[] {
  return months.map((month) => {
    const start = `${month}-01`;
    const nextStart = addDays(monthEnd(month), 1);
    let earnings = 0;
    let base = 0;
    for (const titulo of titulos) {
      if (titulo.maturity && titulo.maturity <= start) continue;
      const end = titulo.maturity && titulo.maturity < nextStart ? titulo.maturity : nextStart;
      const held = positionOn(
        titulo,
        lots.filter((l) => l.tituloId === titulo.id),
        redemptions.filter((r) => r.tituloId === titulo.id),
        addDays(end, -1),
        market,
      );
      for (const lot of held) {
        if (lot.date >= end) continue;
        const from = lot.date > start ? lot.date : start;
        const v0 = lotGrossValue(titulo, lot, from, market);
        const v1 = lotGrossValue(titulo, lot, end, market);
        earnings += v1 - v0;
        base += v0;
      }
    }
    return {
      month,
      earnings: Math.round(earnings * 100),
      base: Math.round(base * 100),
      rate: base > 0 ? earnings / base : 0,
      projected: nextStart > addDays(today, 1),
    };
  });
}

/** `count` months before the month of `today` (inclusive of it) and `ahead` months after it. */
export function monthsAround(today: IsoDate, back: number, ahead: number): YearMonth[] {
  const current = monthOf(today);
  const months: YearMonth[] = [];
  for (let i = -back; i <= ahead; i++) months.push(addMonths(current, i));
  return months;
}
