import type { IsoDate } from '../types';
import type { Product, Titulo } from './types';

/**
 * Daily Tesouro Direto prices from the Tesouro Transparente file `PrecoTaxaTesouroDireto.csv`
 * (columns: Tipo Titulo; Data Vencimento; Data Base; Taxa Compra Manha; Taxa Venda Manha; PU Compra Manha;
 * PU Venda Manha; PU Base Manha). "Venda" is what an investor receives when selling to the Tesouro.
 */
export interface PriceRow {
  date: IsoDate;
  /** Unit price received when selling (PU Venda). */
  sell: number;
  /** Unit price paid when buying (PU Compra); 0 when the título is no longer offered. */
  buy: number;
  /** Rate when selling (decimal a.a.). */
  sellRate: number;
}

export interface TesouroPrices {
  /** Latest date in the file. */
  lastDate: IsoDate;
  /** Rows by `${product}|${maturity}`, sorted by date. */
  series: Record<string, PriceRow[]>;
}

const TYPES: Record<string, Product> = {
  'Tesouro Selic': 'tesouroSelic',
  'Tesouro Prefixado': 'tesouroPrefixado',
  'Tesouro IPCA+': 'tesouroIpca',
};

const brDate = (s: string) => {
  const [d, m, y] = s.split('/');
  return `${y}-${m}-${d}`;
};
const brNumber = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(/\./g, '').replace(',', '.')));

export const priceKey = (product: Product, maturity: IsoDate) => `${product}|${maturity}`;

/** Parses the price file, keeping the supported títulos from `since` on. Throws if the header is not found. */
export function parseTesouroPrices(text: string, since: IsoDate = '2015-01-01'): TesouroPrices {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines[0]?.split(';').map((h) => h.trim()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const idx = {
    type: col('Tipo Titulo'),
    maturity: col('Data Vencimento'),
    date: col('Data Base'),
    sellRate: col('Taxa Venda Manha'),
    buy: col('PU Compra Manha'),
    sell: col('PU Venda Manha'),
  };
  if (Object.values(idx).some((i) => i < 0)) throw new Error('Not a Tesouro price file');

  const series: Record<string, PriceRow[]> = {};
  let lastDate = '';
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(';');
    const product = TYPES[cells[idx.type]?.trim() ?? ''];
    if (!product) continue;
    const date = brDate(cells[idx.date]!);
    if (date < since) continue;
    const key = priceKey(product, brDate(cells[idx.maturity]!));
    (series[key] ??= []).push({
      date,
      sell: brNumber(cells[idx.sell]!),
      buy: brNumber(cells[idx.buy]!),
      sellRate: brNumber(cells[idx.sellRate]!) / 100,
    });
    if (date > lastDate) lastDate = date;
  }
  for (const rows of Object.values(series)) rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!lastDate) throw new Error('No supported títulos in the file');
  return { lastDate, series };
}

/** Rows of a título's price history (empty when the file does not have it). */
export function priceSeries(prices: TesouroPrices | null, titulo: Titulo): PriceRow[] {
  if (!prices || !titulo.maturity) return [];
  return prices.series[priceKey(titulo.product, titulo.maturity)] ?? [];
}

/** Index of the last row on or before `date`, or −1. */
export function rowIndexOn(rows: PriceRow[], date: IsoDate): number {
  let lo = 0;
  let hi = rows.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.date <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Latest published price on or before `date` (null if none). */
export function priceOn(prices: TesouroPrices | null, titulo: Titulo, date: IsoDate): PriceRow | null {
  const rows = priceSeries(prices, titulo);
  const i = rowIndexOn(rows, date);
  return i < 0 ? null : rows[i]!;
}

// ---------- live prices (Tesouro Direto site) ----------

/** One título from the Tesouro Direto site's redemption price list (`/o/rentabilidade/resgatar`). */
interface LiveBond {
  treasuryBondName: string;
  unitaryRedemptionValue: number;
  unitaryInvestmentValue?: number;
  maturityDate: string;
  lastMarketPricingDate: string;
}

export interface LivePrices {
  /** When the Tesouro last priced (e.g. "2026-11-18T18:00:02"). */
  pricedAt: string;
  rows: Record<string, PriceRow>;
  /** Tesouro Reserva unit price (same to buy and sell), valid for `date`. */
  reserva?: { date: IsoDate; price: number };
}

const LIVE_NAME = /^Tesouro (Selic|Prefixado|IPCA\+) \d{4}$/;
const LIVE_TYPES: Record<string, Product> = {
  Selic: 'tesouroSelic',
  Prefixado: 'tesouroPrefixado',
  'IPCA+': 'tesouroIpca',
};

/**
 * Parses the Tesouro Direto site's redemption prices: the price an investor receives selling today, the same
 * one the site's statement uses for "resgate antecipado". Keeps Tesouro Selic, Prefixado and IPCA+ (not the ones
 * with semi-annual coupons, Renda+ or Educa+).
 */
export function parseTesouroLive(json: unknown): LivePrices {
  const lists = Object.values((json ?? {}) as Record<string, unknown>).filter(Array.isArray) as LiveBond[][];
  const rows: Record<string, PriceRow> = {};
  let pricedAt = '';
  let reserva: LivePrices['reserva'];
  for (const bond of lists.flat()) {
    if (/^Tesouro Reserva/.test(bond.treasuryBondName ?? '') && bond.unitaryRedemptionValue > 0) {
      reserva = { date: bond.lastMarketPricingDate.slice(0, 10), price: bond.unitaryRedemptionValue };
      continue;
    }
    const match = LIVE_NAME.exec(bond.treasuryBondName ?? '');
    if (!match || !(bond.unitaryRedemptionValue > 0)) continue;
    const date = bond.lastMarketPricingDate.slice(0, 10);
    rows[priceKey(LIVE_TYPES[match[1]!]!, bond.maturityDate.slice(0, 10))] = {
      date,
      sell: bond.unitaryRedemptionValue,
      buy: bond.unitaryInvestmentValue ?? 0,
      sellRate: NaN,
    };
    if (bond.lastMarketPricingDate > pricedAt) pricedAt = bond.lastMarketPricingDate;
  }
  if (!pricedAt) throw new Error('No Tesouro prices in the response');
  return reserva ? { pricedAt, rows, reserva } : { pricedAt, rows };
}

/**
 * The imported price history with the live prices added as each título's newest row (replacing a file row of
 * the same date: the live price is the later one of that day).
 */
export function mergeLivePrices(file: TesouroPrices | null, live: LivePrices | null): TesouroPrices | null {
  if (!live) return file;
  const series: Record<string, PriceRow[]> = { ...(file?.series ?? {}) };
  let lastDate = file?.lastDate ?? '';
  for (const [key, row] of Object.entries(live.rows)) {
    const rows = (series[key] ?? []).filter((r) => r.date < row.date);
    series[key] = [...rows, row];
    if (row.date > lastDate) lastDate = row.date;
  }
  return { lastDate, series };
}
