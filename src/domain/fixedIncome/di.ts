import { fixedToNumber, mulTrunc, numberToFixed, round, roundFixed } from './precision';

const SCALE = 16;
const ONE = 10n ** BigInt(SCALE);

/** Daily DI rate from the annual DI over (% a.a., 2 decimals), rounded to 8 decimals (B3 formula book). */
export function dailyDiRate(annualPercent: number): number {
  return round((1 + annualPercent / 100) ** (1 / 252) - 1, 8);
}

/**
 * Accumulated DI factor with a percentage of DI (B3 formula book for CDB/LC/LF/RDB, §6.1.2):
 * each daily factor 1 + TDI·p/100 is kept at 16 decimals without rounding, the running product is truncated
 * at 16 decimals after each day, and the final factor is rounded to 8 decimals.
 *
 * @param annualRates DI over (% a.a.) for each business day in the period, in order.
 * @param percentOfDi e.g. 110 for "110% do CDI".
 */
export function diFactor(annualRates: readonly number[], percentOfDi = 100): number {
  let acc = ONE;
  const p = numberToFixed(percentOfDi / 100, SCALE, 4); // p has 2 decimals
  for (const rate of annualRates) {
    const tdi = numberToFixed(dailyDiRate(rate), SCALE, 8);
    const daily = ONE + mulTrunc(tdi, p, SCALE);
    acc = mulTrunc(acc, daily, SCALE);
  }
  return fixedToNumber(roundFixed(acc, SCALE, 8), SCALE);
}

/** Fixed-rate (or spread) factor for `businessDays`, rounded to 9 decimals (B3 formula book). */
export function fixedRateFactor(annualRate: number, businessDays: number): number {
  return round((1 + annualRate) ** (businessDays / 252), 9);
}

/** DI factor combined with a spread ("CDI + x%"), rounded to 9 decimals. */
export function diWithSpreadFactor(diAccumulated: number, spreadFactor: number): number {
  return round(diAccumulated * spreadFactor, 9);
}
