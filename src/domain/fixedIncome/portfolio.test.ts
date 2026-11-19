import { describe, expect, it } from 'vitest';
import { createDemoInvestments } from './demo';
import { summarizePortfolio } from './portfolio';
import { bundledMarket } from './testMarket';
import { CUSTODY_EXEMPTION_CENTS } from './valuation';

let n = 0;
const newId = () => `p${++n}`;
const market = bundledMarket();
const demo = createDemoInvestments('2026-11', newId);
const summary = summarizePortfolio(demo.titulos, demo.lots, demo.redemptions, '2026-11-17', market);
const row = (name: string) => summary.rows.find((r) => r.titulo.name.startsWith(name))!;

describe('summarizePortfolio (demo portfolio on 17/11/2026)', () => {
  it('values every título today and at maturity', () => {
    expect(summary.rows).toHaveLength(6);
    for (const r of summary.rows) {
      expect(r.today.gross).toBeGreaterThan(r.today.invested);
      expect(r.today.net).toBeLessThanOrEqual(r.today.gross);
      if (r.atMaturity) expect(r.atMaturity.net).toBeGreaterThan(r.today.net);
    }
    expect(row('Tesouro Reserva').atMaturity).toBeNull();
    expect(row('LCI').today.ir).toBe(0); // exempt
  });

  it('applies partial redemptions before valuing', () => {
    const cdb = row('CDB');
    expect(cdb.today.invested).toBeLessThan(1_000_000);
    expect(cdb.redeemedNet).toBeGreaterThan(190_000);
    expect(cdb.redeemedNet).toBeLessThan(200_000); // R$ 2.000 gross minus IR
  });

  it('shares the Tesouro Selic exemption across its lots', () => {
    const selic = row('Tesouro Selic');
    expect(selic.lots).toHaveLength(2);
    // Two lots worth ≈ R$ 14.900 today: only ≈ R$ 4.900 pays custody.
    const taxable = selic.today.gross - CUSTODY_EXEMPTION_CENTS;
    expect(taxable).toBeGreaterThan(0);
    expect(selic.today.custody).toBeLessThan(selic.today.gross * 0.002 * 2);
  });

  it('computes totals and annual returns', () => {
    const sum = summary.rows.reduce((s, r) => s + r.today.net, 0);
    expect(summary.today.net).toBe(sum);
    expect(summary.netRate).toBeGreaterThan(0.08);
    expect(summary.netRate).toBeLessThan(0.16);
    expect(row('LCI').netRate).toBeCloseTo(0.125, 2); // exempt fixed 12,5%: net = gross rate
    expect(summary.lastMaturity).toBe('2035-05-15');
  });

  it('drops matured títulos from current totals', () => {
    const later = summarizePortfolio(demo.titulos, demo.lots, demo.redemptions, '2027-12-01', market);
    const lci = later.rows.find((r) => r.titulo.product === 'lci')!;
    expect(lci.matured).toBe(true);
    expect(later.rows.filter((r) => !r.matured).reduce((s, r) => s + r.today.net, 0)).toBe(later.today.net);
  });
});

describe('returns', () => {
  it('splits past (since purchase) and projected (to maturity) returns, gross and net', () => {
    const lci = row('LCI');
    // Exempt fixed 12,5%: gross = net, and both match the contract rate.
    expect(lci.returns.toMaturity.net.perYear).toBeCloseTo(0.125, 2);
    expect(lci.returns.toMaturity.gross.perYear).toBeCloseTo(0.125, 2);
    expect(lci.returns.sincePurchase.net.perYear).toBeCloseTo(0.125, 2);
    const cdb = row('CDB');
    expect(cdb.returns.sincePurchase.gross.perYear!).toBeGreaterThan(cdb.returns.sincePurchase.net.perYear!);
    expect(cdb.returns.sincePurchase.gross.total).toBeGreaterThan(0.1);
    expect(cdb.irRateToday).toEqual([0.175, 0.175]); // ~19 months held
    expect(row('LCI').irRateToday).toBeNull();
  });

  it('does not annualize very short holdings', async () => {
    const recent = summarizePortfolio(demo.titulos, demo.lots, demo.redemptions, '2026-06-20', market);
    const reserva = recent.rows.find((r) => r.titulo.product === 'tesouroReserva')!; // bought 02/06
    expect(reserva.returns.sincePurchase.net.perYear).toBeNull();
    expect(reserva.returns.fromToday).toBeNull(); // no maturity to hold to
  });

  it('computes portfolio totals from all flows', () => {
    const r = summary.returns;
    expect(r.toMaturity.net.perYear).toBeCloseTo(summary.netRate!, 6);
    expect(r.sincePurchase.net.perYear).toBeGreaterThan(0.05);
    expect(r.fromToday).toBeGreaterThan(0.05);
    expect(r.sincePurchase.marketNet).toBeNull(); // no prices in this test
  });
});

describe('distribution', () => {
  it('groups the held títulos by product and by indexer, by net value today', async () => {
    const { distribution } = await import('./distribution');
    const d = distribution(summary);
    expect(d.byProduct.map((s) => s.key).sort()).toEqual(
      ['cdb', 'lci', 'tesouroIpca', 'tesouroPrefixado', 'tesouroReserva', 'tesouroSelic'].sort(),
    );
    expect(d.byIndexer.map((s) => s.key).sort()).toEqual(['cdi', 'ipca', 'pre', 'selic']);
    expect(d.byIndexer.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10);
    // Selic group = Tesouro Selic + Tesouro Reserva.
    const selic = d.byIndexer.find((s) => s.key === 'selic')!.value;
    expect(selic).toBe(row('Tesouro Selic').today.net + row('Tesouro Reserva').today.net);
  });
});
