import { describe, expect, it } from 'vitest';
import { dailyDiRate, diFactor, diWithSpreadFactor, fixedRateFactor } from './di';
import { round, trunc } from './precision';
import { incomeTaxRate, iofRate, redemptionTaxes } from './tax';
import {
  impliedRate,
  ipcaVnaOn15th,
  prefixadoPrice,
  priceFromQuote,
  projectIpcaVna,
  projectSelicVna,
  selicVna,
  singlePaymentQuote,
} from './tesouro';

describe('precision', () => {
  it('truncates and rounds through float noise', () => {
    expect(trunc(753.3153229999999, 6)).toBe(753.315323);
    expect(trunc(753.3153228, 6)).toBe(753.315322);
    expect(trunc(-1.239, 2)).toBe(-1.23);
    expect(round(0.125, 2)).toBe(0.13);
    expect(round(-0.125, 2)).toBe(-0.13);
    expect(round(1.0049999, 2)).toBe(1);
  });
});

describe('taxes', () => {
  it('uses the regressive IR table by calendar days', () => {
    expect(incomeTaxRate(180)).toBe(0.225);
    expect(incomeTaxRate(181)).toBe(0.2);
    expect(incomeTaxRate(360)).toBe(0.2);
    expect(incomeTaxRate(720)).toBe(0.175);
    expect(incomeTaxRate(721)).toBe(0.15);
  });

  it('uses the IOF table for the first 29 days', () => {
    expect(iofRate(1)).toBe(0.96);
    expect(iofRate(10)).toBe(0.66);
    expect(iofRate(29)).toBe(0.03);
    expect(iofRate(30)).toBe(0);
  });

  it('deducts IOF, but not custody, from the IR base, truncating at the cent', () => {
    // R$ 10.000 → R$ 10.100 in 10 days: IOF 66% of 100,00 = 66,00; IR 22,5% of 34,00 = 7,65.
    expect(redemptionTaxes(1_000_000, 1_010_000, 100, 10, false)).toEqual({
      income: 10_000,
      iof: 6_600,
      custody: 100,
      ir: 765,
      net: 1_002_535,
    });
    // Same rule as a Tesouro Direto statement (made-up values): 85 days, IR 22,5% of gross − invested.
    expect(redemptionTaxes(1_000_000, 1_035_123, 480, 85, false)).toMatchObject({
      ir: 7_902,
      net: 1_026_741,
    });
    // IR is truncated at the cent, not rounded (20% of 512,34 = 102,468 → 102,46).
    expect(redemptionTaxes(1_000_000, 1_051_234, 0, 232, false).ir).toBe(10_246);
    // No float noise: 22,5% of 4.000,00 is exactly 900,00.
    expect(redemptionTaxes(1_000_000, 1_400_000, 0, 100, false).ir).toBe(90_000);
    expect(redemptionTaxes(1_000_000, 1_010_000, 0, 10, true).net).toBe(1_010_000);
    expect(redemptionTaxes(1_000_000, 990_000, 0, 400, false)).toMatchObject({ ir: 0, net: 990_000 });
  });
});

describe('B3 DI accumulation', () => {
  it('computes the daily DI rate at 8 decimals', () => {
    expect(dailyDiRate(14.9)).toBe(0.00055131);
    expect(dailyDiRate(10.4)).toBe(0.0003927);
  });

  it('accumulates with truncation at 16 and final rounding at 8', () => {
    const days = Array<number>(21).fill(14.9);
    // (1 + 0,00055131)^21 = 1,011643…, rounded at 8.
    expect(diFactor(days)).toBe(round(1.00055131 ** 21, 8));
    // 110% do CDI: daily factor 1 + 0,00055131 × 1,10 = 1,000606441.
    expect(diFactor(days, 110)).toBe(round(1.000606441 ** 21, 8));
    expect(diFactor([])).toBe(1);
  });

  it('combines DI with a spread at 9 decimals', () => {
    expect(fixedRateFactor(0.01, 252)).toBe(1.01);
    expect(diWithSpreadFactor(1.1, fixedRateFactor(0.01, 252))).toBe(1.111);
  });
});

describe('Tesouro pricing — Tesouro Nacional methodology examples', () => {
  it('prices a Tesouro Prefixado (LTN, 14,36% a.a., 532 DU)', () => {
    expect(prefixadoPrice(0.1436, 532)).toBe(753.315323);
    expect(impliedRate(753.315323, 1000, 532)).toBe(0.1436);
  });

  it('prices a Tesouro Selic (LFT, −0,02% a.a., 1459 DU)', () => {
    expect(singlePaymentQuote(-0.0002, 1459)).toBe(100.1158);
    expect(selicVna(3.4496942158)).toBe(3449.694215);
    expect(projectSelicVna(3449.694215, 0.1175)).toBe(3451.215345);
    expect(priceFromQuote(100.1158, 3451.215345)).toBe(3455.211852);
  });

  it('projects the Tesouro IPCA+ VNA (NTN-B example)', () => {
    expect(ipcaVnaOn15th(1.7269264594)).toBe(1726.926459);
    // 21/05/2008: 6 of 31 calendar days after the 15th, projected IPCA 0,46%.
    expect(projectIpcaVna(1726.926459, 0.0046, 6, 31)).toBe(1728.461136);
  });
});
