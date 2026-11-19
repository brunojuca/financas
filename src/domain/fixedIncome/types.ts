import type { Cents, IsoDate } from '../types';

export type Product =
  'tesouroSelic' | 'tesouroPrefixado' | 'tesouroIpca' | 'tesouroReserva' | 'cdb' | 'lci' | 'lca';

/** How a bank product (CDB, LCI, LCA) pays. */
export type BankIndexer = 'cdi' | 'cdiSpread' | 'pre' | 'ipca';

export type RedemptionOrder = 'fifo' | 'lifo';

/** A fixed-income título held by the user: its terms. Purchases are separate lots. */
export interface Titulo {
  id: string;
  name: string;
  product: Product;
  /** null only for Tesouro Reserva (daily liquidity). */
  maturity: IsoDate | null;
  /** Bank products only. */
  indexer: BankIndexer | null;
  /** Bank products: fixed rate ('pre'), spread over CDI ('cdiSpread') or real rate over IPCA ('ipca'). Decimal a.a. */
  rate: number;
  /** Bank products with 'cdi': percentage of CDI (110 = 110%). */
  cdiPercent: number;
  /** Lots consumed first on partial redemptions (Tesouro is always FIFO). */
  redemptionOrder: RedemptionOrder;
  /** Issuer bank (CDB/LCI/LCA), for the FGC limit. */
  issuer: string;
  /** Optional link to a cash-flow brokerage account. */
  accountId: string | null;
  archived: boolean;
}

/** One purchase. */
export interface Lot {
  id: string;
  tituloId: string;
  /** Settlement date (money left the account). */
  date: IsoDate;
  /** Amount paid. */
  amountCents: Cents;
  /** Tesouro: number of títulos (fractions of 0,01 allowed; Reserva: units) and unit price paid. */
  quantity: number | null;
  unitPrice: number | null;
  /** Tesouro: contracted rate (decimal a.a.) when the unit price is unknown; derived from the price otherwise. */
  rate: number | null;
}

/** Sale before maturity (or a withdrawal from Tesouro Reserva / a bank product). */
export interface Redemption {
  id: string;
  tituloId: string;
  date: IsoDate;
  /** Tesouro (except Reserva): títulos sold. */
  quantity: number | null;
  /** Bank products and Tesouro Reserva: gross amount withdrawn. */
  grossCents: Cents | null;
  /** Net amount received, when known (for history and IRR). */
  netCents: Cents | null;
}

export const TESOURO_PRODUCTS: readonly Product[] = ['tesouroSelic', 'tesouroPrefixado', 'tesouroIpca'];

/** Tesouro títulos with a unit price and quantity (Reserva is amount-based). */
export function isPricedTesouro(product: Product): boolean {
  return TESOURO_PRODUCTS.includes(product);
}

/** Products bought in units with a unit price: priced Tesouro and Tesouro Reserva. */
export function usesUnits(product: Product): boolean {
  return isPricedTesouro(product) || product === 'tesouroReserva';
}

/** Products charged B3 custody. */
export function paysCustody(product: Product): boolean {
  return isPricedTesouro(product) || product === 'tesouroReserva';
}

export function isTaxExempt(product: Product): boolean {
  return product === 'lci' || product === 'lca';
}
