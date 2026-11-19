import { businessDaysBetween } from '../businessDays';
import { addDays, addMonths, calendarDaysBetween, dateInMonth, monthOf, parseIsoDate } from '../dates';
import type { Cents, IsoDate } from '../types';
import { diWithSpreadFactor, fixedRateFactor } from './di';
import { cdiFactor, ipcaVnaAt, selicFactor, selicVnaAt, type MarketData } from './market';
import { trunc } from './precision';
import { redemptionTaxes, type TaxBreakdown } from './tax';
import { impliedRate, prefixadoPrice, priceFromQuote, singlePaymentQuote } from './tesouro';
import { priceOn, priceSeries, rowIndexOn, type TesouroPrices } from './tesouroPrices';
import { isPricedTesouro, isTaxExempt, paysCustody, type Lot, type Titulo } from './types';

/** B3 custody, 0,20% a.a. (Ofício Circular 014/2024-VPC). */
export const CUSTODY_RATE = 0.002;
/**
 * Custody per calendar day: 0,20% a.a. prorated exponentially, (1 + 0,20%)^(1/365) − 1 — the convention that
 * reproduced Tesouro statements best (two of three to the cent, the third within 1 cent; decision D4).
 */
export const CUSTODY_DAILY = (1 + CUSTODY_RATE) ** (1 / 365) - 1;
/**
 * A lot's custody exemption: a fixed amount in cents, or its exemption in reais on each day (the pool rule of
 * `exemption.ts`, where the R$ 10.000 per CPF goes to the newest purchases first — decision D5).
 */
export type Exemption = Cents | ((date: IsoDate) => number);

const exemptionAt = (e: Exemption) => (typeof e === 'number' ? () => e / 100 : e);

/** Custody exemption for Tesouro Selic (per CPF) and Tesouro Reserva (decisions D3, D5). */
export const CUSTODY_EXEMPTION_CENTS = 1_000_000;

/** VNA (or face value) of a priced Tesouro título on a date. */
function tesouroVna(titulo: Titulo, date: IsoDate, market: MarketData): number {
  switch (titulo.product) {
    case 'tesouroPrefixado':
      return 1000;
    case 'tesouroSelic':
      return selicVnaAt(market, date);
    case 'tesouroIpca':
      return ipcaVnaAt(market, date);
    default:
      throw new Error(`Not a priced Tesouro título: ${titulo.product}`);
  }
}

/** Unit price of a priced Tesouro título on a date for a given rate (curve price). */
export function tesouroUnitPrice(titulo: Titulo, rate: number, date: IsoDate, market: MarketData): number {
  const maturity = titulo.maturity!;
  const du = Math.max(0, businessDaysBetween(date, maturity));
  if (titulo.product === 'tesouroPrefixado') return du === 0 ? 1000 : prefixadoPrice(rate, du);
  const vna = tesouroVna(titulo, date < maturity ? date : maturity, market);
  return du === 0 ? vna : priceFromQuote(singlePaymentQuote(rate, du), vna);
}

/**
 * Contracted rate of a Tesouro lot: as given (e.g. copied from the Tesouro statement), else implied by the unit
 * price paid. The implied rate can differ in the last decimal: the Tesouro priced the purchase with a projected
 * IPCA/Selic, while the app uses the index published later.
 */
export function lotRate(titulo: Titulo, lot: Lot, market: MarketData): number {
  if (lot.rate !== null) return lot.rate;
  if (lot.unitPrice === null) throw new Error(`Lot ${lot.id} needs a unit price or a rate`);
  const du = businessDaysBetween(lot.date, titulo.maturity!);
  if (titulo.product === 'tesouroPrefixado') return impliedRate(lot.unitPrice, 1000, du);
  const quote = (lot.unitPrice / tesouroVna(titulo, lot.date, market)) * 100;
  return impliedRate(quote, 100, du);
}

/** Number of títulos in a Tesouro lot: given, or amount ÷ unit price at the contracted rate. */
export function lotQuantity(titulo: Titulo, lot: Lot, market: MarketData): number {
  if (lot.quantity !== null) return lot.quantity;
  const price = lot.unitPrice ?? tesouroUnitPrice(titulo, lotRate(titulo, lot, market), lot.date, market);
  return lot.amountCents / 100 / price;
}

/**
 * Tesouro Reserva unit price on a date: the official price published by the Tesouro Direto (or, without it, the
 * price paid) carried to the date by the daily Selic — Reserva pays 100% of the Selic with no mark-to-market.
 */
export function reservaUnitPrice(lot: Lot, date: IsoDate, market: MarketData): number {
  const anchor = market.reservaPrice ?? { date: lot.date, price: lot.unitPrice! };
  const price =
    date >= anchor.date
      ? anchor.price * selicFactor(market, anchor.date, date)
      : anchor.price / selicFactor(market, date, anchor.date);
  return trunc(price, 6);
}

/** Valuation dates never go past maturity. */
function clampToMaturity(titulo: Titulo, date: IsoDate): IsoDate {
  return titulo.maturity && date > titulo.maturity ? titulo.maturity : date;
}

/**
 * Gross value of a lot on a date "na curva" (contract rate + published indexes, projected after the last
 * published value), in reais. Financial values are truncated at 2 decimals (Tesouro methodology, Table 3).
 */
export function lotGrossValue(titulo: Titulo, lot: Lot, date: IsoDate, market: MarketData): number {
  const at = clampToMaturity(titulo, date);
  if (at <= lot.date) return lot.amountCents / 100;
  const amount = lot.amountCents / 100;

  if (isPricedTesouro(titulo.product)) {
    const price = tesouroUnitPrice(titulo, lotRate(titulo, lot, market), at, market);
    return trunc(lotQuantity(titulo, lot, market) * price, 2);
  }
  if (titulo.product === 'tesouroReserva') {
    if (lot.quantity !== null && lot.unitPrice !== null) {
      return trunc(lot.quantity * reservaUnitPrice(lot, at, market), 2);
    }
    // Decision D2 (purchases without units): like a Tesouro Selic at zero ágio/deságio.
    return trunc(amount * selicFactor(market, lot.date, at), 2);
  }
  const du = businessDaysBetween(lot.date, at);
  switch (titulo.indexer) {
    case 'cdi':
      return trunc(amount * cdiFactor(market, lot.date, at, titulo.cdiPercent), 2);
    case 'cdiSpread':
      return trunc(
        amount * diWithSpreadFactor(cdiFactor(market, lot.date, at), fixedRateFactor(titulo.rate, du)),
        2,
      );
    case 'pre':
      return trunc(amount * fixedRateFactor(titulo.rate, du), 2);
    case 'ipca':
      // Decision D12: IPCA factor as the ratio of Tesouro-style IPCA VNAs (calendar pro rata between the 15ths).
      return trunc(
        amount * (ipcaVnaAt(market, at) / ipcaVnaAt(market, lot.date)) * fixedRateFactor(titulo.rate, du),
        2,
      );
    default:
      throw new Error(`Bank título without indexer: ${titulo.id}`);
  }
}

/** Dates splitting [from, to] into monthly steps (same day of month), for the custody average. */
function monthlySteps(from: IsoDate, to: IsoDate): IsoDate[] {
  const steps = [from];
  const day = parseIsoDate(from).day;
  for (let month = addMonths(monthOf(from), 1); ; month = addMonths(month, 1)) {
    const date = dateInMonth(month, day);
    if (date >= to) break;
    steps.push(date);
  }
  steps.push(to);
  return steps;
}

/** Curve-value custody over [from, to): value averaged over monthly steps (used without market prices). */
function curveCustody(
  titulo: Titulo,
  lot: Lot,
  from: IsoDate,
  to: IsoDate,
  market: MarketData,
  exemption: (date: IsoDate) => number,
) {
  const taxable = (d: IsoDate) => Math.max(0, lotGrossValue(titulo, lot, d, market) - exemption(d));
  const steps = monthlySteps(from, to);
  let custody = 0;
  let previous = taxable(steps[0]!);
  for (let i = 1; i < steps.length; i++) {
    const current = taxable(steps[i]!);
    custody +=
      (((1 + CUSTODY_RATE) ** (calendarDaysBetween(steps[i - 1]!, steps[i]!) / 365) - 1) *
        (previous + current)) /
      2;
    previous = current;
  }
  return custody;
}

/**
 * B3 custody accrued on a lot from settlement to `date` (decision D4): `CUSTODY_DAILY` per calendar day on the
 * value above the exemption allotted to this lot. With Tesouro prices, each day up to the last published price
 * uses the market value (quantity × the latest sell price on or before that day) — the rule that reproduced two
 * real statements to 1–2 cents. Days without prices (and projections) use the curve value.
 */
export function lotCustody(
  titulo: Titulo,
  lot: Lot,
  date: IsoDate,
  market: MarketData,
  exemptionCents: Exemption = 0,
  prices: TesouroPrices | null = null,
): Cents {
  if (!paysCustody(titulo.product)) return 0;
  const at = clampToMaturity(titulo, date);
  if (at <= lot.date) return 0;
  const exemption = exemptionAt(exemptionCents);
  const rows = isPricedTesouro(titulo.product) ? priceSeries(prices, titulo) : [];
  let custody = 0;
  let marketStart = at;
  let marketEnd = at;
  if (rows.length && prices) {
    const quantity = lotQuantity(titulo, lot, market);
    marketStart = rows[0]!.date > lot.date ? rows[0]!.date : lot.date;
    marketEnd = addDays(prices.lastDate, 1) < at ? addDays(prices.lastDate, 1) : at;
    let i = rowIndexOn(rows, marketStart);
    for (let d = marketStart; d < marketEnd; d = addDays(d, 1)) {
      while (i + 1 < rows.length && rows[i + 1]!.date <= d) i++;
      custody += CUSTODY_DAILY * Math.max(0, quantity * rows[i]!.sell - exemption(d));
    }
    if (marketEnd < marketStart) marketEnd = marketStart;
  }
  // Curve value before the first price and after the last one (projections).
  if (lot.date < marketStart) custody += curveCustody(titulo, lot, lot.date, marketStart, market, exemption);
  if (marketEnd < at) custody += curveCustody(titulo, lot, marketEnd, at, market, exemption);
  return Math.round(custody * 100);
}

export interface LotValuation extends TaxBreakdown {
  invested: Cents;
  gross: Cents;
  calendarDays: number;
  businessDays: number;
}

/** Everything about a lot redeemed (or valued "if redeemed") on a date: gross, custody, IOF, IR and net. */
export function valueLot(
  titulo: Titulo,
  lot: Lot,
  date: IsoDate,
  market: MarketData,
  exemptionCents: Exemption = 0,
  prices: TesouroPrices | null = null,
): LotValuation {
  const at = clampToMaturity(titulo, date);
  const gross = Math.round(lotGrossValue(titulo, lot, at, market) * 100);
  const custody = lotCustody(titulo, lot, at, market, exemptionCents, prices);
  const calendarDays = Math.max(0, calendarDaysBetween(lot.date, at));
  return {
    invested: lot.amountCents,
    gross,
    calendarDays,
    businessDays: Math.max(0, businessDaysBetween(lot.date, at)),
    ...redemptionTaxes(lot.amountCents, gross, custody, calendarDays, isTaxExempt(titulo.product)),
  };
}

/**
 * A priced Tesouro lot sold on `date` at the latest published sell price (the "Mercado" view, what the Tesouro
 * site shows as "resgate antecipado") at the latest price on or before `date`, counted up to the day before.
 * Null when there is no price for that título.
 */
export function valueLotAtMarket(
  titulo: Titulo,
  lot: Lot,
  date: IsoDate,
  market: MarketData,
  prices: TesouroPrices | null,
  exemptionCents: Exemption = 0,
): (LotValuation & { priceDate: IsoDate }) | null {
  if (!isPricedTesouro(titulo.product)) return null;
  const row = priceOn(prices, titulo, date);
  if (!row || row.sell <= 0 || row.date < lot.date) return null;
  // Like the Tesouro Direto statement: latest price, but days held, custody and IR bracket counted up to the
  // day before (statements viewed on 18/11 show 85 days for a 24/08 purchase, with custody through 16/11).
  const dayBefore = addDays(date, -1);
  const at = dayBefore > lot.date ? dayBefore : lot.date;
  const gross = Math.round(trunc(lotQuantity(titulo, lot, market) * row.sell, 2) * 100);
  const custody = lotCustody(titulo, lot, at, market, exemptionCents, prices);
  const calendarDays = Math.max(0, calendarDaysBetween(lot.date, at));
  return {
    invested: lot.amountCents,
    gross,
    calendarDays,
    businessDays: Math.max(0, businessDaysBetween(lot.date, at)),
    priceDate: row.date,
    ...redemptionTaxes(lot.amountCents, gross, custody, calendarDays, isTaxExempt(titulo.product)),
  };
}
