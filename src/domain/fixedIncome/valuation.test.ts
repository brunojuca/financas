import { describe, expect, it } from 'vitest';
import { addBusinessDays, businessDaysBetween } from '../businessDays';
import { ipcaVnaAt, selicFactor } from './market';
import { trunc } from './precision';
import { applyRedemptions } from './redemption';
import { bundledMarket } from './testMarket';
import { priceFromQuote, singlePaymentQuote } from './tesouro';
import type { Lot, Redemption, Titulo } from './types';
import { CUSTODY_EXEMPTION_CENTS, lotGrossValue, lotRate, tesouroUnitPrice, valueLot } from './valuation';

const market = bundledMarket(); // flat projection: Selic target 13,75%, IPCA 4,5% a.a.

const titulo = (
  product: Titulo['product'],
  maturity: string | null,
  extra: Partial<Titulo> = {},
): Titulo => ({
  id: product,
  name: product,
  product,
  maturity,
  indexer: null,
  rate: 0,
  cdiPercent: 100,
  redemptionOrder: 'fifo',
  issuer: '',
  accountId: null,
  archived: false,
  ...extra,
});
const lot = (id: string, date: string, amountCents: number, extra: Partial<Lot> = {}): Lot => ({
  id,
  tituloId: 't',
  date,
  amountCents,
  quantity: null,
  unitPrice: null,
  rate: null,
  ...extra,
});

describe('spreadsheet reference values (base date 17/11/2026), recomputed with the official methods', () => {
  // The spreadsheet's values are in the comments; differences come from the methods listed in the plan doc.
  it('CDB 110% do CDI: same to the cent except B3 truncation (−0,01)', () => {
    const cdb = titulo('cdb', '2028-03-10', { indexer: 'cdi', cdiPercent: 110 });
    const purchase = lot('a', '2025-03-10', 1_000_000);
    const now = valueLot(cdb, purchase, '2026-11-17', market);
    expect(now.gross).toBe(1_285_264); // spreadsheet 12.852,65
    const maturity = valueLot(cdb, purchase, '2028-03-10', market);
    expect(maturity).toMatchObject({ businessDays: 754, calendarDays: 1096, gross: 1_544_522, ir: 81_678 });
    // spreadsheet: gross 15.445,23, IR 816,78, net 14.628,45
    expect(maturity.net).toBe(1_462_844);
  });

  it('Tesouro Selic 2029 (+0,05%): same gross; custody with the R$ 10k exemption', () => {
    const selic = titulo('tesouroSelic', '2029-03-01');
    const purchase = lot('a', '2025-06-02', 1_500_000, { rate: 0.0005 });
    expect(valueLot(selic, purchase, '2026-11-17', market).gross).toBe(1_830_153); // spreadsheet 18.301,55
    const maturity = valueLot(selic, purchase, '2029-03-01', market, CUSTODY_EXEMPTION_CENTS);
    expect(maturity.gross).toBe(2_447_212); // spreadsheet 24.472,12
    expect(maturity.custody / 100).toBeCloseTo(70.1, -1); // spreadsheet 70,10 (average-balance estimate)
  });

  it('Tesouro IPCA+ 2035 (6,80%): calendar-day pro rata adds R$ 0,56 today; maturity within R$ 0,02', () => {
    const ipca = titulo('tesouroIpca', '2035-05-15');
    const purchase = lot('a', '2025-08-15', 800_000, { rate: 0.068 });
    expect(valueLot(ipca, purchase, '2026-11-17', market).gross).toBe(913_171); // spreadsheet 9.131,15
    const maturity = valueLot(ipca, purchase, '2035-05-15', market);
    expect(maturity.gross).toBe(2_311_331); // spreadsheet 23.113,33
    expect(Math.abs(maturity.custody - 27_787)).toBeLessThan(100); // spreadsheet 277,87
  });
});

describe('Tesouro IPCA+ vs. published prices (Tesouro Transparente, 16–17/11/2026)', () => {
  const rows: [string, string, number, number][] = [
    ['2050-08-15', '2026-11-16', 7.49, 868.48],
    ['2035-05-15', '2026-11-17', 7.76, 2543.22],
    ['2029-05-15', '2026-11-17', 7.49, 3997.43],
  ];
  it('falls within the band of the rate rounded at 2 decimals', () => {
    for (const [maturity, date, rate, published] of rows) {
      const settlement = addBusinessDays(date, 1);
      const du = businessDaysBetween(settlement, maturity);
      const vna = ipcaVnaAt(market, settlement);
      const price = (r: number) => trunc(priceFromQuote(singlePaymentQuote(r / 100, du), vna), 2);
      expect(published).toBeLessThanOrEqual(price(rate - 0.005));
      expect(published).toBeGreaterThanOrEqual(price(rate + 0.005));
    }
    // The 2050 título matches exactly at the published rate.
    const s = addBusinessDays('2026-11-16', 1);
    expect(
      trunc(
        priceFromQuote(
          singlePaymentQuote(0.0749, businessDaysBetween(s, '2050-08-15')),
          ipcaVnaAt(market, s),
        ),
        2,
      ),
    ).toBe(868.48);
  });
});

describe('Tesouro lots by unit price', () => {
  it('derives the contracted rate and quantity from the price paid', () => {
    const pre = titulo('tesouroPrefixado', '2031-01-01');
    const price = tesouroUnitPrice(pre, 0.1527, '2026-11-18', market);
    const purchase = lot('a', '2026-11-18', Math.round(price * 2.5 * 100), {
      quantity: 2.5,
      unitPrice: price,
    });
    expect(lotRate(pre, purchase, market)).toBeCloseTo(0.1527, 6);
    expect(lotGrossValue(pre, purchase, '2031-01-01', market)).toBe(2500); // 2,5 × R$ 1.000 at maturity
  });

  it('uses the contracted rate from the statement when given with the price', () => {
    const ipca = titulo('tesouroIpca', '2032-08-15');
    const price = tesouroUnitPrice(ipca, 0.08, '2026-08-24', market);
    const purchase = lot('a', '2026-08-24', Math.round(price * 100), { quantity: 1, unitPrice: price });
    expect(lotRate(ipca, purchase, market)).toBeCloseTo(0.08, 6);
    expect(lotRate(ipca, { ...purchase, rate: 0.0801 }, market)).toBe(0.0801);
    // A higher contracted rate means a lower curve price for the same título.
    expect(lotGrossValue(ipca, { ...purchase, rate: 0.0801 }, '2026-11-17', market)).toBeLessThan(
      lotGrossValue(ipca, purchase, '2026-11-17', market),
    );
  });
});

describe('Tesouro Reserva (decision D2: Selic at zero ágio/deságio)', () => {
  const reserva = titulo('tesouroReserva', null);
  it('grows with the daily Selic and pays IOF in the first 30 days', () => {
    const purchase = lot('a', '2026-10-01', 500_000);
    const factor = selicFactor(market, '2026-10-01', '2026-10-15');
    const v = valueLot(reserva, purchase, '2026-10-15', market, CUSTODY_EXEMPTION_CENTS);
    expect(v.gross).toBe(Math.round(trunc(5000 * factor, 2) * 100));
    expect(v.custody).toBe(0); // under the R$ 10k exemption
    expect(v.iof).toBe(Math.round((v.gross - 500_000) * 0.53)); // 14 days → 53%
    expect(valueLot(reserva, purchase, '2026-11-17', market).iof).toBe(0);
  });
});

describe('partial redemptions', () => {
  const cdb = titulo('cdb', '2028-01-03', { indexer: 'pre', rate: 0.12 });
  const lots = [lot('old', '2025-01-02', 100_000), lot('new', '2026-01-02', 100_000)];
  const withdrawal: Redemption = {
    id: 'r',
    tituloId: 't',
    date: '2026-06-01',
    quantity: null,
    grossCents: 50_000,
    netCents: null,
  };

  it('takes the oldest lot first by default (FIFO)', () => {
    const { remaining, parts } = applyRedemptions(cdb, lots, [withdrawal], market);
    expect(parts.get('r')!.map((p) => p.lotId)).toEqual(['old']);
    expect(remaining.find((l) => l.id === 'new')!.amountCents).toBe(100_000);
    const old = remaining.find((l) => l.id === 'old')!;
    expect(old.amountCents).toBeGreaterThan(50_000); // what is left of the invested amount
    expect(old.amountCents).toBeLessThan(60_000);
  });

  it('takes the newest lot first when the bank does (LIFO)', () => {
    const lifo = { ...cdb, redemptionOrder: 'lifo' as const };
    const { parts } = applyRedemptions(lifo, lots, [withdrawal], market);
    expect(parts.get('r')!.map((p) => p.lotId)).toEqual(['new']);
  });

  it('sells Tesouro by quantity, always FIFO, across lots', () => {
    const pre = titulo('tesouroPrefixado', '2031-01-01', { redemptionOrder: 'lifo' });
    const tLots = [
      lot('a', '2025-01-02', 50_000, { quantity: 1, unitPrice: 500 }),
      lot('b', '2025-06-02', 100_000, { quantity: 2, unitPrice: 500 }),
    ];
    const sale: Redemption = { ...withdrawal, quantity: 1.5, grossCents: null };
    const { remaining, parts } = applyRedemptions(pre, tLots, [sale], market);
    expect(parts.get('r')!.map((p) => [p.lotId, p.fraction])).toEqual([
      ['a', 1],
      ['b', 0.25],
    ]);
    expect(remaining.map((l) => [l.id, l.quantity])).toEqual([['b', 1.5]]);
    expect(() => applyRedemptions(pre, tLots, [{ ...sale, quantity: 4 }], market)).toThrow(RangeError);
  });
});
