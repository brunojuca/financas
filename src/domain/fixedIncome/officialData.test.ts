import { describe, expect, it } from 'vitest';
import cdiJson from '../../reference/cdi.json';
import ipcaJson from '../../reference/ipca.json';
import selicJson from '../../reference/selic.json';
import { addBusinessDays, businessDaysBetween } from '../businessDays';
import { trunc } from './precision';
import { irr252 } from './irr';
import { tesouroIpcaVna } from './ipca';
import { accumulatedDailyFactor, expandDaily, monthlyIndex, valuesBetween, type RleSeries } from './series';
import { prefixadoPrice, priceFromQuote, selicVna, singlePaymentQuote } from './tesouro';
import { diFactor } from './di';

const selicRle = selicJson as unknown as RleSeries;
const cdiRle = cdiJson as unknown as RleSeries;
const selic = expandDaily(selicRle);
const cdi = expandDaily(cdiRle);
const ipca = monthlyIndex(ipcaJson as unknown as { lastDate: string; values: [string, number][] });

describe('bundled reference data', () => {
  it('has exactly the business days of our holiday calendar since 2000 (decision D9)', () => {
    expect(selic.values).toHaveLength(selicRle.days!);
    expect(cdi.values).toHaveLength(cdiRle.days!);
  });

  it('reproduces the Tesouro Selic VNA of the methodology example (20/05/2008)', () => {
    expect(selicVna(accumulatedDailyFactor(selic, '2000-07-01', '2008-05-20'))).toBe(3449.694215);
  });

  it('reproduces the Tesouro IPCA+ VNA of the methodology example (15/05/2008 and 21/05/2008)', () => {
    const projection = () => 0.0046; // the example's projected IPCA for May 2008
    // On the 15th only published indexes matter (April 2008 ÷ June 2000).
    expect(tesouroIpcaVna('2008-05-15', ipca, projection)).toBe(1726.926459);
    // On 21/05/2008 May's IPCA was not published yet: hide it so the example's projection is used.
    const withExampleProjection = {
      ...ipca,
      values: new Map([...ipca.values].filter(([m]) => m < '2008-05')),
    };
    expect(tesouroIpcaVna('2008-05-21', { ...withExampleProjection, lastMonth: '2008-04' }, projection)).toBe(
      1728.461136,
    );
  });
});

// Rows from the Tesouro Transparente price file (PrecoTaxaTesouroDireto.csv): título, maturity, date, buy rate (%), buy price.
// Prices there are truncated at 2 decimals and rates rounded at 2 decimals; settlement is the next business day.
const PREFIXADO: [string, string, number, number][] = [
  ['2028-01-01', '2026-11-17', 14.43, 860.44],
  ['2031-01-01', '2026-11-17', 15.27, 559.43],
  ['2032-01-01', '2026-11-17', 15.35, 483.61],
  ['2027-01-01', '2026-11-16', 13.55, 984.48],
  ['2029-01-01', '2026-11-16', 14.75, 748.73],
];
const SELIC: [string, string, number, number][] = [
  ['2031-03-01', '2026-11-17', 0.11, 20231.37],
  ['2029-03-01', '2026-11-17', 0.05, 20300.05],
  ['2028-03-01', '2026-11-16', 0.03, 20305.89],
  ['2027-03-01', '2026-11-16', 0.03, 20312.8],
];

describe('Tesouro prices vs. published prices', () => {
  it('Tesouro Prefixado matches to the cent (published price is truncated)', () => {
    for (const [maturity, date, rate, published] of PREFIXADO) {
      const settlement = addBusinessDays(date, 1);
      expect(trunc(prefixadoPrice(rate / 100, businessDaysBetween(settlement, maturity)), 2)).toBe(published);
    }
  });

  it('Tesouro Selic falls within the range allowed by the rate rounded at 2 decimals', () => {
    for (const [maturity, date, rate, published] of SELIC) {
      const settlement = addBusinessDays(date, 1);
      const vna = selicVna(accumulatedDailyFactor(selic, '2000-07-01', settlement));
      const du = businessDaysBetween(settlement, maturity);
      const price = (r: number) => priceFromQuote(singlePaymentQuote(r / 100, du), vna);
      expect(published).toBeLessThanOrEqual(price(rate - 0.005) + 0.01);
      expect(published).toBeGreaterThanOrEqual(price(rate + 0.005) - 0.01);
    }
  });
});

describe('CDI accumulation on real data', () => {
  it('accumulates 2025 at 100% and 110% of CDI', () => {
    const rates = valuesBetween(cdi, '2025-01-01', '2026-01-01');
    expect(rates).toHaveLength(businessDaysBetween('2025-01-01', '2026-01-01'));
    const full = diFactor(rates);
    expect(full).toBeGreaterThan(1.13);
    expect(full).toBeLessThan(1.15);
    expect(diFactor(rates, 110) - 1).toBeCloseTo((full - 1) * 1.1, 2);
  });
});

describe('irr252', () => {
  it('finds the rate of a single investment', () => {
    const du = businessDaysBetween('2025-03-10', '2028-03-10');
    const final = 10_000 * 1.12 ** (du / 252);
    expect(
      irr252([
        { date: '2025-03-10', amount: -10_000 },
        { date: '2028-03-10', amount: final },
      ]),
    ).toBeCloseTo(0.12, 10);
  });

  it('handles several flows and returns null without a sign change', () => {
    const r = irr252([
      { date: '2025-01-02', amount: -1000 },
      { date: '2025-07-01', amount: -1000 },
      { date: '2027-01-04', amount: 2400 },
    ]);
    expect(r).toBeGreaterThan(0.08);
    expect(r).toBeLessThan(0.12);
    expect(irr252([{ date: '2025-01-02', amount: -1000 }])).toBeNull();
  });
});
