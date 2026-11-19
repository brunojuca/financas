import { describe, expect, it } from 'vitest';
import { createDemoInvestments } from './demo';
import { monthlyEarnings, monthsAround } from './monthly';
import { bundledMarket } from './testMarket';
import type { Lot, Titulo } from './types';

const market = bundledMarket();

describe('monthlyEarnings', () => {
  const lci: Titulo = {
    id: 'l',
    name: 'LCI',
    product: 'lci',
    maturity: '2027-09-15',
    indexer: 'pre',
    rate: 0.12,
    cdiPercent: 100,
    redemptionOrder: 'fifo',
    issuer: '',
    accountId: null,
    archived: false,
  };
  const lot: Lot = {
    id: 'a',
    tituloId: 'l',
    date: '2026-03-02',
    amountCents: 1_000_000,
    quantity: null,
    unitPrice: null,
    rate: null,
  };

  it('splits a fixed-rate título into monthly earnings that add up to the total', () => {
    const months = ['2026-03', '2026-04', '2026-05', '2026-06'];
    const result = monthlyEarnings([lci], [lot], [], months, '2026-11-18', market);
    // A full month of a 12% a.a. (252) título earns ≈ 0,9–1,0%.
    expect(result[1]!.rate).toBeGreaterThan(0.008);
    expect(result[1]!.rate).toBeLessThan(0.011);
    expect(result[0]!.base).toBe(1_000_000); // bought during March: base = amount
    expect(result.every((m) => !m.projected)).toBe(true);
    // Sum of months = value at the start of July − amount (within rounding).
    const sum = result.reduce((s, m) => s + m.earnings, 0);
    const july = result[3]!.base + result[3]!.earnings;
    expect(Math.abs(sum - (july - 1_000_000))).toBeLessThan(5);
  });

  it('marks future months as projected and ignores months after maturity', () => {
    const result = monthlyEarnings(
      [lci],
      [lot],
      [],
      ['2026-11', '2027-08', '2027-09', '2027-10'],
      '2026-11-18',
      market,
    );
    expect(result.map((m) => m.projected)).toEqual([true, true, true, true]);
    expect(result[2]!.earnings).toBeGreaterThan(0); // up to 15/09
    expect(result[2]!.earnings).toBeLessThan(result[1]!.earnings);
    expect(result[3]!.earnings).toBe(0);
  });

  it('runs over the demo portfolio', () => {
    let n = 0;
    const demo = createDemoInvestments('2026-11', () => `d${++n}`);
    const months = monthsAround('2026-11-18', 12, 12);
    expect(months).toHaveLength(25);
    const result = monthlyEarnings(demo.titulos, demo.lots, demo.redemptions, months, '2026-11-18', market);
    for (const m of result.filter((r) => r.base > 0)) {
      expect(m.rate).toBeGreaterThan(0);
      expect(m.rate).toBeLessThan(0.03);
    }
  });
});
