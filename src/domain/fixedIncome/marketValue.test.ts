import { describe, expect, it } from 'vitest';
import csv from './fixtures/PrecoTaxaTesouroDireto-sample.csv?raw';
import { bundledMarket } from './testMarket';
import liveJson from './fixtures/tesouro-resgatar-sample.json';
import { mergeLivePrices, parseTesouroLive, parseTesouroPrices, priceKey, priceOn } from './tesouroPrices';
import type { Lot, Titulo } from './types';
import { lotCustody, valueLot, valueLotAtMarket } from './valuation';

// Public rows of the Tesouro Transparente price file (20/08–17/11/2026) for a few títulos.
const prices = parseTesouroPrices(csv);
const market = bundledMarket();

const ipca2032: Titulo = {
  id: 't',
  name: 'Tesouro IPCA+ 2032',
  product: 'tesouroIpca',
  maturity: '2032-08-15',
  indexer: null,
  rate: 0,
  cdiPercent: 100,
  redemptionOrder: 'fifo',
  issuer: '',
  accountId: null,
  archived: false,
};
// 10 títulos bought on 24/08/2026 at that day's published buy price (R$ 3.001,43).
const lot: Lot = {
  id: 'a',
  tituloId: 't',
  date: '2026-08-24',
  amountCents: 3_001_430,
  quantity: 10,
  unitPrice: 3001.43,
  rate: null,
};

describe('Tesouro price file', () => {
  it('keeps the supported títulos (not those with semi-annual coupons) by product and maturity', () => {
    expect(prices.lastDate).toBe('2026-11-17');
    expect(Object.keys(prices.series).sort()).toEqual([
      priceKey('tesouroIpca', '2032-08-15'),
      priceKey('tesouroPrefixado', '2029-01-01'),
      priceKey('tesouroSelic', '2029-03-01'),
    ]);
    expect(priceOn(prices, ipca2032, '2026-11-17')).toEqual({
      date: '2026-11-17',
      sell: 3092.7,
      buy: 3113.73,
      sellRate: 0.079,
    });
    // Weekend: the Friday price.
    expect(priceOn(prices, ipca2032, '2026-11-15')!.date).toBe('2026-11-13');
    expect(priceOn(prices, ipca2032, '2020-01-01')).toBeNull();
  });

  it('rejects other files', () => {
    expect(() => parseTesouroPrices('Data;Descrição;Valor\n')).toThrow();
  });
});

describe('market value ("resgate antecipado")', () => {
  it('values at the latest sell price, counting days and daily market custody up to the day before', () => {
    // Expected values computed independently from the same rows (see docs: decision D4).
    const v = valueLotAtMarket(ipca2032, lot, '2026-11-18', market, prices)!;
    expect(v.priceDate).toBe('2026-11-17');
    expect(v.calendarDays).toBe(85);
    expect(v.gross).toBe(3_092_700);
    expect(v.custody).toBe(1_440);
    expect(v.ir).toBe(20_535); // 22,5% of 912,70 = 205,3575, truncated; custody not deducted (D6)
    expect(v.net).toBe(3_092_700 - 1_440 - 20_535);
  });

  it('uses market custody for past days and curve value after the last price', () => {
    const withPrices = lotCustody(ipca2032, lot, '2026-11-17', market, 0, prices);
    expect(withPrices).toBe(1_440);
    const curveOnly = lotCustody(ipca2032, lot, '2026-11-17', market, 0, null);
    expect(curveOnly).not.toBe(withPrices);
    // Valuing at maturity: market days, then projected curve days — more custody than up to today.
    const atMaturity = valueLot(ipca2032, lot, '2032-08-15', market, 0, prices);
    expect(atMaturity.custody).toBeGreaterThan(withPrices);
  });

  it('is null for bank products or títulos without prices', () => {
    expect(
      valueLotAtMarket({ ...ipca2032, maturity: '2045-05-15' }, lot, '2026-11-18', market, prices),
    ).toBeNull();
    expect(valueLotAtMarket({ ...ipca2032, product: 'cdb' }, lot, '2026-11-18', market, prices)).toBeNull();
  });
});

describe('portfolio with market prices', () => {
  it('values Tesouro títulos with a price at market and the rest on the curve', async () => {
    const { createDemoInvestments } = await import('./demo');
    const { summarizePortfolio } = await import('./portfolio');
    let n = 0;
    const demo = createDemoInvestments('2026-11', () => `m${++n}`);
    const summary = summarizePortfolio(
      demo.titulos,
      demo.lots,
      demo.redemptions,
      '2026-11-18',
      market,
      prices,
    );
    const selic = summary.rows.find((r) => r.titulo.product === 'tesouroSelic')!;
    const ipca = summary.rows.find((r) => r.titulo.product === 'tesouroIpca')!; // 2035: not in the sample
    expect(selic.priceDate).toBe('2026-11-17');
    expect(selic.market!.gross).not.toBe(selic.today.gross);
    expect(selic.holdRate).toBeGreaterThan(0.05);
    expect(ipca.market).toBeNull();
    expect(summary.hasMarket).toBe(true);
    const expected = summary.rows
      .filter((r) => !r.matured)
      .reduce((s, r) => s + (r.market ?? r.today).net, 0);
    expect(summary.market.net).toBe(expected);
  });
});

describe('live prices from the Tesouro Direto site', () => {
  // Public response of /o/rentabilidade/resgatar on 18/11/2026 (trimmed to a few títulos).
  const live = parseTesouroLive(liveJson);
  const merged = mergeLivePrices(prices, live)!;
  const prefixado2029: Titulo = { ...ipca2032, product: 'tesouroPrefixado', maturity: '2029-01-01' };

  it('keeps Selic, Prefixado and IPCA+ without coupons, keyed like the price file', () => {
    expect(live.pricedAt.startsWith('2026-11-18T18:00')).toBe(true);
    expect(Object.keys(live.rows).sort()).toEqual([
      priceKey('tesouroIpca', '2032-08-15'),
      priceKey('tesouroPrefixado', '2029-01-01'),
      priceKey('tesouroSelic', '2029-03-01'),
    ]);
    expect(priceOn(merged, prefixado2029, '2026-11-19')).toMatchObject({ date: '2026-11-18', sell: 745.33 });
    // History from the file is still there.
    expect(priceOn(merged, prefixado2029, '2026-11-17')!.sell).toBe(743.95);
    expect(mergeLivePrices(null, live)!.lastDate).toBe('2026-11-18');
  });

  it('values like the Tesouro statement: latest price, days and custody up to the day before', () => {
    // 10 títulos bought on 24/08/2026 at that day's published buy price (R$ 734,26), viewed on 18/11.
    const lot10: Lot = { ...lot, amountCents: 734_260, quantity: 10, unitPrice: 734.26 };
    const v = valueLotAtMarket(prefixado2029, lot10, '2026-11-18', market, merged)!;
    expect(v.priceDate).toBe('2026-11-18');
    expect(v.calendarDays).toBe(85);
    expect(v.gross).toBe(745_330);
    expect(v.custody).toBe(348); // computed independently from the daily file prices
    expect(v.ir).toBe(2_490); // 22,5% of (7.453,30 − 7.342,60) = 24,9075, truncated
  });

  it('rejects responses without prices', () => {
    expect(() => parseTesouroLive({ TesouroLegado: [] })).toThrow();
  });
});

describe('Tesouro Reserva by units × official price', () => {
  const live = parseTesouroLive(liveJson);
  const reserva: Titulo = { ...ipca2032, product: 'tesouroReserva', maturity: null };
  const withPrice = { ...market, reservaPrice: live.reserva! };

  it('reads the official unit price from the live list', () => {
    expect(live.reserva).toEqual({ date: '2026-11-18', price: 11.237408 });
  });

  it('values units at the official price, carried by the daily Selic to other dates', async () => {
    const { lotGrossValue, reservaUnitPrice } = await import('./valuation');
    const { selicFactor } = await import('./market');
    const units: Lot = { ...lot, date: '2026-10-01', quantity: 100, unitPrice: 11, amountCents: 110_000 };
    expect(lotGrossValue(reserva, units, '2026-11-18', withPrice)).toBe(1123.74); // 100 × 11,237408
    const later = reservaUnitPrice(units, '2026-12-18', withPrice);
    expect(later).toBeCloseTo(11.237408 * selicFactor(withPrice, '2026-11-18', '2026-12-18'), 5); // truncated at 6
    const earlier = reservaUnitPrice(units, '2026-10-15', withPrice);
    expect(earlier).toBeCloseTo(11.237408 / selicFactor(withPrice, '2026-10-15', '2026-11-18'), 5);
    // Without the official price, the price paid is the anchor.
    expect(reservaUnitPrice(units, '2026-10-01', market)).toBe(11);
  });

  it('keeps the Selic approximation (D2) for purchases entered by amount only', async () => {
    const { lotGrossValue } = await import('./valuation');
    const { selicFactor } = await import('./market');
    const byAmount: Lot = {
      ...lot,
      date: '2026-10-01',
      quantity: null,
      unitPrice: null,
      amountCents: 110_000,
    };
    const expected = Math.trunc(1100 * selicFactor(withPrice, '2026-10-01', '2026-11-18') * 100) / 100;
    expect(lotGrossValue(reserva, byAmount, '2026-11-18', withPrice)).toBeCloseTo(expected, 2);
  });
});

describe('Tesouro Reserva units through the portfolio', () => {
  it('keeps units (scaled by withdrawals) when summarizing', async () => {
    const { summarizePortfolio } = await import('./portfolio');
    const reserva: Titulo = { ...ipca2032, id: 'r', product: 'tesouroReserva', maturity: null };
    const units: Lot = {
      ...lot,
      tituloId: 'r',
      date: '2026-10-01',
      quantity: 100,
      unitPrice: 11,
      amountCents: 110_000,
    };
    const withdrawal = {
      id: 'w',
      tituloId: 'r',
      date: '2026-11-03',
      quantity: null,
      grossCents: 27_500,
      netCents: null,
    };
    const live = parseTesouroLive(liveJson);
    const s = summarizePortfolio([reserva], [units], [withdrawal], '2026-11-18', {
      ...market,
      reservaPrice: live.reserva!,
    });
    const row = s.rows[0]!;
    expect(row.quantity).toBeGreaterThan(74);
    expect(row.quantity).toBeLessThan(76);
    expect(row.today.gross).toBe(Math.round(Math.trunc(row.quantity! * 11.237408 * 100)));
  });
});
