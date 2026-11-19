import { businessDaysBetween } from '../businessDays';
import type { IsoDate } from '../types';

export interface CashFlow {
  date: IsoDate;
  /** Negative = money invested, positive = money received. */
  amount: number;
}

/**
 * Internal rate of return per year on a 252-business-day basis: solves Σ CF·(1+r)^(−DU/252) = 0, with DU counted
 * from the first flow. Newton's method with a bisection fallback. Returns null when there is no sign change.
 */
export function irr252(flows: CashFlow[]): number | null {
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const first = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0]!.date);
  const timed = flows.map((f) => ({ t: businessDaysBetween(first, f.date) / 252, amount: f.amount }));
  const npv = (r: number) => timed.reduce((s, f) => s + f.amount * (1 + r) ** -f.t, 0);
  const slope = (r: number) => timed.reduce((s, f) => s - f.t * f.amount * (1 + r) ** (-f.t - 1), 0);

  let r = 0.1;
  for (let i = 0; i < 50; i++) {
    const step = npv(r) / slope(r);
    if (!Number.isFinite(step)) break;
    r -= step;
    if (r <= -0.99) break;
    if (Math.abs(step) < 1e-12) return r;
  }
  // Fallback: bisection on [-0.99, 10].
  let lo = -0.99;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
