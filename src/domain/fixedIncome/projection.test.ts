import { describe, expect, it } from 'vitest';
import { createDemoInvestments } from './demo';
import { summarizePortfolio } from './portfolio';
import { projectPortfolio } from './projection';
import { bundledMarket } from './testMarket';

let n = 0;
const market = bundledMarket();
const demo = createDemoInvestments('2026-11', () => `x${++n}`);
const today = '2026-11-17';
const summary = summarizePortfolio(demo.titulos, demo.lots, demo.redemptions, today, market);
const projection = projectPortfolio(summary, today, market);

describe('projectPortfolio', () => {
  it('starts today with the current net value and ends at the last maturity', () => {
    const first = projection.points[0]!;
    expect(first.date).toBe(today);
    expect(first.total).toBe(summary.today.net);
    expect(first.totalReal).toBe(first.total);
    expect(projection.points.at(-1)!.date).toBe('2035-05-15');
    expect(projection.points.map((p) => p.date)).toContain('2027-12-31');
  });

  it('moves maturities from held to received and grows over time', () => {
    const last = projection.points.at(-1)!;
    // Everything except Tesouro Reserva (no maturity) has matured by the end.
    expect(last.received).toBe(summary.rows.reduce((s, r) => s + (r.atMaturity?.net ?? 0), 0));
    for (let i = 1; i < projection.points.length; i++) {
      expect(projection.points[i]!.total).toBeGreaterThan(projection.points[i - 1]!.total);
      expect(projection.points[i]!.totalReal).toBeLessThan(projection.points[i]!.total);
    }
  });

  it('lists money returned per maturity year and a real return', () => {
    expect(projection.maturities.map((m) => m.year)).toEqual([2027, 2028, 2029, 2035]);
    expect(projection.realRate).toBeGreaterThan(0.03);
    expect(projection.realRate).toBeLessThan(summary.netRate!);
  });
});
