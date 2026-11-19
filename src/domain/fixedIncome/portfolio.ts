import { businessDaysBetween } from '../businessDays';
import { calendarDaysBetween } from '../dates';
import type { Cents, IsoDate } from '../types';
import { irr252, type CashFlow } from './irr';
import type { MarketData } from './market';
import { applyRedemptions } from './redemption';
import { incomeTaxRate } from './tax';
import type { TesouroPrices } from './tesouroPrices';
import { isPricedTesouro, isTaxExempt, type Lot, type Product, type Redemption, type Titulo } from './types';
import {
  CUSTODY_EXEMPTION_CENTS,
  lotGrossValue,
  lotQuantity,
  lotRate,
  valueLot,
  valueLotAtMarket,
  type LotValuation,
} from './valuation';

export interface ValueSums {
  invested: Cents;
  gross: Cents;
  custody: Cents;
  iof: Cents;
  ir: Cents;
  net: Cents;
}

const ZERO: ValueSums = { invested: 0, gross: 0, custody: 0, iof: 0, ir: 0, net: 0 };

function add(a: ValueSums, b: ValueSums | LotValuation): ValueSums {
  return {
    invested: a.invested + b.invested,
    gross: a.gross + b.gross,
    custody: a.custody + b.custody,
    iof: a.iof + b.iof,
    ir: a.ir + b.ir,
    net: a.net + b.net,
  };
}

/** A return over a period: total (not annualized) and per year (base 252). */
export interface Rate {
  /** Total over the period, e.g. 0.083 = +8,3%. */
  total: number;
  /** Annualized (IRR base 252); null when held for less than `MIN_DAYS_TO_ANNUALIZE` days. */
  perYear: number | null;
}

/**
 * The three returns shown on screen, each over a different period:
 * - `sincePurchase`: past — from each purchase up to today (on the curve, and at market when there is a price);
 * - `toMaturity`: projected — from each purchase to maturity, holding everything (Focus/scenario for the future);
 * - `fromToday`: projected — from today's sale value to maturity: what keeping earns instead of selling now.
 * Gross = before IR, IOF and custody; net = after them. Partial redemptions count as money received.
 */
export interface Returns {
  sincePurchase: { gross: Rate; net: Rate; marketGross: Rate | null; marketNet: Rate | null };
  toMaturity: { gross: Rate; net: Rate };
  fromToday: number | null;
}

/** Below this many days, per-year figures are not shown (annualizing a few days gives meaningless numbers). */
export const MIN_DAYS_TO_ANNUALIZE = 30;

/** Total and annualized return of cash flows (outflows negative). */
function rateOf(flows: CashFlow[], heldDays: number): Rate {
  const paid = flows.filter((f) => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const received = flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  return {
    total: paid > 0 ? received / paid - 1 : 0,
    perYear: heldDays >= MIN_DAYS_TO_ANNUALIZE ? irr252(flows) : null,
  };
}

/** Building blocks for the returns of one título (or several, concatenated). */
interface ReturnFlows {
  firstDate: IsoDate | null;
  /** Purchases and redemptions, with redemptions net / gross. */
  baseNet: CashFlow[];
  baseGross: CashFlow[];
  /** Value at the end of each view (one flow per título). */
  todayNet: CashFlow[];
  todayGross: CashFlow[];
  marketNet: CashFlow[];
  marketGross: CashFlow[];
  maturityNet: CashFlow[];
  maturityGross: CashFlow[];
  /** −(net today at market or curve) for títulos with a maturity still ahead: the "sell now" alternative. */
  sellToday: CashFlow[];
  /** Their net at maturity: the "keep" alternative. */
  keepNet: CashFlow[];
  hasMarket: boolean;
}

function returnsOf(f: ReturnFlows, today: IsoDate): Returns {
  const heldDays = f.firstDate ? calendarDaysBetween(f.firstDate, today) : 0;
  const keep = [...f.sellToday, ...f.keepNet];
  return {
    sincePurchase: {
      gross: rateOf([...f.baseGross, ...f.todayGross], heldDays),
      net: rateOf([...f.baseNet, ...f.todayNet], heldDays),
      marketGross: f.hasMarket ? rateOf([...f.baseGross, ...f.marketGross], heldDays) : null,
      marketNet: f.hasMarket ? rateOf([...f.baseNet, ...f.marketNet], heldDays) : null,
    },
    toMaturity: {
      // Purchase to maturity spans years: always annualized.
      gross: rateOf([...f.baseGross, ...f.maturityGross], Infinity),
      net: rateOf([...f.baseNet, ...f.maturityNet], Infinity),
    },
    fromToday: f.sellToday.length && keep.some((x) => x.amount > 0) ? irr252(keep) : null,
  };
}

const flow = (date: IsoDate, cents: Cents): CashFlow[] => (cents > 0 ? [{ date, amount: cents / 100 }] : []);

export interface LotSummary {
  /** What is left of the lot after redemptions (amount and quantity scaled down). */
  lot: Lot;
  rate: number | null;
  /** Custody exemption allotted to this lot (cents). */
  exemption: Cents;
  today: LotValuation;
  atMaturity: LotValuation | null;
  /** Sold at the Tesouro's published price (priced Tesouro with a price only). */
  market: (LotValuation & { priceDate: IsoDate }) | null;
}

export interface TituloSummary {
  titulo: Titulo;
  lots: LotSummary[];
  /** Tesouro títulos held (null for amount-based products). */
  quantity: number | null;
  /** True when the maturity date has passed: the money is back in the account. */
  matured: boolean;
  /** Redeemed if sold today ("na curva"). */
  today: ValueSums;
  /** Held to maturity (projected); null for Tesouro Reserva. */
  atMaturity: ValueSums | null;
  /** Sold today at the published price; null when the título has no market price (bank products, Reserva, no file). */
  market: ValueSums | null;
  /** Date of the price used for `market`. */
  priceDate: IsoDate | null;
  /** Net return a.a. of holding to maturity instead of selling at `market` (base 252). */
  holdRate: number | null;
  /** Net received from past redemptions. */
  redeemedNet: Cents;
  /** Annual return (IRR base 252, net of taxes) holding to maturity — or valued today for Tesouro Reserva. */
  netRate: number | null;
  flows: CashFlow[];
  /** Past and projected returns, gross and net (see `Returns`). */
  returns: Returns;
  /** Flows behind `returns`, combined for the portfolio totals. */
  returnFlows: ReturnFlows;
  /** IR rate that applies if redeemed today (the table by days held; a range when lots differ). */
  irRateToday: [number, number] | null;
}

export interface PortfolioSummary {
  rows: TituloSummary[];
  /** Títulos not matured yet. */
  today: ValueSums;
  /** Like `today`, but Tesouro títulos with a price valued at market. */
  market: ValueSums;
  /** True when at least one título is valued at market in `market`. */
  hasMarket: boolean;
  atMaturity: ValueSums;
  netRate: number | null;
  lastMaturity: IsoDate | null;
  /** Returns of the whole portfolio (see `Returns`). */
  returns: Returns;
}

/** Products sharing one R$ 10.000 custody exemption per investor (decisions D3, D5). */
const EXEMPTION_POOLS: Product[] = ['tesouroSelic', 'tesouroReserva'];

/**
 * Values every título on `today` and at maturity. Lots still held are what remains after redemptions;
 * the custody exemption of each pool is split among its lots in proportion to their value today (D5).
 */
export function summarizePortfolio(
  titulos: Titulo[],
  lots: Lot[],
  redemptions: Redemption[],
  today: IsoDate,
  market: MarketData,
  prices: TesouroPrices | null = null,
): PortfolioSummary {
  const held = titulos.map((titulo) => {
    const own = lots.filter((l) => l.tituloId === titulo.id && l.date <= today);
    const ownRedemptions = redemptions.filter((r) => r.tituloId === titulo.id && r.date <= today);
    const { remaining, parts } = applyRedemptions(titulo, own, ownRedemptions, market);
    return { titulo, own, ownRedemptions, remaining, parts };
  });

  // Exemption shares by value today.
  const exemption = new Map<string, Cents>();
  for (const pool of EXEMPTION_POOLS) {
    const poolLots = held
      .filter((h) => h.titulo.product === pool && !(h.titulo.maturity && h.titulo.maturity <= today))
      .flatMap((h) =>
        h.remaining.map((lot) => ({ lot, value: lotGrossValue(h.titulo, lot, today, market) })),
      );
    const total = poolLots.reduce((s, x) => s + x.value, 0);
    for (const { lot, value } of poolLots) {
      exemption.set(lot.id, total > 0 ? Math.round((CUSTODY_EXEMPTION_CENTS * value) / total) : 0);
    }
  }

  const rows: TituloSummary[] = held.map(({ titulo, own, ownRedemptions, remaining, parts }) => {
    const matured = titulo.maturity !== null && titulo.maturity <= today;
    const priced = isPricedTesouro(titulo.product);
    const lotSummaries: LotSummary[] = remaining.map((lot) => {
      const share = exemption.get(lot.id) ?? 0;
      return {
        lot,
        rate: priced ? lotRate(titulo, lot, market) : null,
        exemption: share,
        today: valueLot(titulo, lot, today, market, share, prices),
        atMaturity: titulo.maturity ? valueLot(titulo, lot, titulo.maturity, market, share, prices) : null,
        market: matured ? null : valueLotAtMarket(titulo, lot, today, market, prices, share),
      };
    });
    const todaySums = lotSummaries.reduce((s, l) => add(s, l.today), ZERO);
    const maturitySums = titulo.maturity ? lotSummaries.reduce((s, l) => add(s, l.atMaturity!), ZERO) : null;

    let redeemedNet = 0;
    const flows: CashFlow[] = own.map((lot) => ({ date: lot.date, amount: -lot.amountCents / 100 }));
    const baseGross: CashFlow[] = [...flows];
    for (const redemption of ownRedemptions) {
      const slices = (parts.get(redemption.id) ?? []).map((p) =>
        valueLot(titulo, p.slice, redemption.date, market),
      );
      const net = redemption.netCents ?? slices.reduce((s, v) => s + v.net, 0);
      const gross = redemption.grossCents ?? slices.reduce((s, v) => s + v.gross, 0);
      redeemedNet += net;
      flows.push({ date: redemption.date, amount: net / 100 });
      baseGross.push(...flow(redemption.date, gross));
    }
    const baseNet = [...flows];
    const hasPrices = lotSummaries.length > 0 && lotSummaries.every((l) => l.market !== null);
    const marketSums = hasPrices ? lotSummaries.reduce((s, l) => add(s, l.market!), ZERO) : null;
    const priceDate = hasPrices ? lotSummaries[0]!.market!.priceDate : null;
    let holdRate: number | null = null;
    if (marketSums && maturitySums && priceDate && titulo.maturity && marketSums.net > 0) {
      const du = businessDaysBetween(priceDate, titulo.maturity);
      if (du > 0) holdRate = (maturitySums.net / marketSums.net) ** (252 / du) - 1;
    }

    const end = titulo.maturity ?? today;
    const endNet = maturitySums?.net ?? todaySums.net;
    if (endNet > 0) flows.push({ date: end, amount: endNet / 100 });

    // A matured título's "today" value is what it paid at maturity, on that date.
    const valueDate = matured ? titulo.maturity! : today;
    const returnFlows: ReturnFlows = {
      firstDate: own.reduce<IsoDate | null>((min, l) => (min === null || l.date < min ? l.date : min), null),
      baseNet,
      baseGross,
      todayNet: flow(valueDate, todaySums.net),
      todayGross: flow(valueDate, todaySums.gross),
      marketNet: flow(valueDate, (marketSums ?? todaySums).net),
      marketGross: flow(valueDate, (marketSums ?? todaySums).gross),
      maturityNet: flow(end, endNet),
      maturityGross: flow(end, maturitySums?.gross ?? todaySums.gross),
      sellToday:
        matured || !titulo.maturity || todaySums.invested === 0
          ? []
          : [{ date: today, amount: -(marketSums ?? todaySums).net / 100 }],
      keepNet: matured || !titulo.maturity || !maturitySums ? [] : flow(titulo.maturity, maturitySums.net),
      hasMarket: marketSums !== null,
    };
    const irRates = isTaxExempt(titulo.product)
      ? []
      : lotSummaries.map((l) => incomeTaxRate(l.today.calendarDays));

    return {
      titulo,
      lots: lotSummaries,
      quantity: priced
        ? remaining.reduce((s, l) => s + lotQuantity(titulo, l, market), 0)
        : titulo.product === 'tesouroReserva' &&
            remaining.length > 0 &&
            remaining.every((l) => l.quantity !== null)
          ? remaining.reduce((s, l) => s + l.quantity!, 0)
          : null,
      matured,
      today: todaySums,
      atMaturity: maturitySums,
      market: marketSums,
      priceDate,
      holdRate,
      redeemedNet,
      netRate: irr252(flows),
      flows,
      returns: returnsOf(returnFlows, today),
      returnFlows,
      irRateToday: irRates.length ? [Math.min(...irRates), Math.max(...irRates)] : null,
    };
  });

  const current = rows.filter((r) => !r.matured);
  const maturities = rows.map((r) => r.titulo.maturity).filter((m): m is IsoDate => m !== null);
  return {
    rows,
    today: current.reduce((s, r) => add(s, r.today), ZERO),
    market: current.reduce((s, r) => add(s, r.market ?? r.today), ZERO),
    hasMarket: current.some((r) => r.market !== null),
    atMaturity: current.reduce((s, r) => add(s, r.atMaturity ?? r.today), ZERO),
    netRate: irr252(rows.flatMap((r) => r.flows)),
    lastMaturity: maturities.length ? maturities.reduce((a, b) => (a > b ? a : b)) : null,
    returns: returnsOf(combineFlows(rows.map((r) => r.returnFlows)), today),
  };
}

function combineFlows(parts: ReturnFlows[]): ReturnFlows {
  const all = (key: keyof Omit<ReturnFlows, 'firstDate' | 'hasMarket' | 'sellToday'>) =>
    parts.flatMap((p) => p[key]);
  const firsts = parts.map((p) => p.firstDate).filter((d): d is IsoDate => d !== null);
  return {
    firstDate: firsts.length ? firsts.reduce((a, b) => (a < b ? a : b)) : null,
    baseNet: all('baseNet'),
    baseGross: all('baseGross'),
    todayNet: all('todayNet'),
    todayGross: all('todayGross'),
    marketNet: all('marketNet'),
    marketGross: all('marketGross'),
    maturityNet: all('maturityNet'),
    maturityGross: all('maturityGross'),
    // Selling everything held today, as one flow.
    sellToday: [
      {
        date: parts.find((p) => p.sellToday.length)?.sellToday[0]!.date ?? '',
        amount: parts.reduce((s, p) => s + (p.sellToday[0]?.amount ?? 0), 0),
      },
    ].filter((f) => f.amount < 0),
    keepNet: all('keepNet'),
    hasMarket: parts.some((p) => p.hasMarket),
  };
}
