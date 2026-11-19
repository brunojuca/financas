import { addMonths, calendarDaysBetween, monthOf, parseIsoDate } from '../dates';
import type { IsoDate, YearMonth } from '../types';
import type { MonthlyIndex } from './series';
import { ipcaVnaOn15th, projectIpcaVna } from './tesouro';

/** IPCA number index of June 2000: base of the Tesouro IPCA+ VNA (15/07/2000 = R$ 1.000). */
const BASE_MONTH = '2000-06';

/** Monthly IPCA (decimal) assumed for months not yet published. */
export type IpcaProjection = (month: YearMonth) => number;

/** Index for a month, chaining projections after the last published month. */
export function ipcaIndexAt(index: MonthlyIndex, month: YearMonth, projection: IpcaProjection): number {
  const known = index.values.get(month);
  if (known !== undefined) return known;
  if (month <= index.lastMonth) throw new RangeError(`IPCA index missing for ${month}`);
  return ipcaIndexAt(index, addMonths(month, -1), projection) * (1 + projection(month));
}

/** Monthly IPCA variation (decimal): published if available, else the projection. */
export function ipcaVariation(index: MonthlyIndex, month: YearMonth, projection: IpcaProjection): number {
  const current = index.values.get(month);
  const previous = index.values.get(addMonths(month, -1));
  return current !== undefined && previous !== undefined ? current / previous - 1 : projection(month);
}

/**
 * Tesouro IPCA+ VNA on any date: the VNA of the last 15th (IPCA accumulated since June 2000 up to the month
 * before it), carried pro rata by calendar days with the accruing month's IPCA — published or projected.
 */
export function tesouroIpcaVna(date: IsoDate, index: MonthlyIndex, projection: IpcaProjection): number {
  const { day } = parseIsoDate(date);
  const accruing = day >= 15 ? monthOf(date) : addMonths(monthOf(date), -1);
  const last15th = `${accruing}-15`;
  const next15th = `${addMonths(accruing, 1)}-15`;
  const base = index.values.get(BASE_MONTH)!;
  const vna15 = ipcaVnaOn15th(ipcaIndexAt(index, addMonths(accruing, -1), projection) / base);
  return projectIpcaVna(
    vna15,
    ipcaVariation(index, accruing, projection),
    calendarDaysBetween(last15th, date),
    calendarDaysBetween(last15th, next15th),
  );
}
