import type { IsoDate } from '../types';
import type { MarketData } from './market';
import { isPricedTesouro, type Lot, type Redemption, type Titulo } from './types';
import { lotGrossValue, lotQuantity } from './valuation';

/** The part of one lot taken by a redemption. */
export interface RedeemedPart {
  lotId: string;
  /** Share of what was left of the lot (0–1]. */
  fraction: number;
  /** The redeemed slice, as a lot of its own (for valuing taxes on it). */
  slice: Lot;
}

/** Scales a lot (amount and quantity) by `fraction`. */
function scaleLot(lot: Lot, fraction: number, quantity: number | null): Lot {
  return {
    ...lot,
    amountCents: Math.round(lot.amountCents * fraction),
    quantity: quantity === null ? null : quantity * fraction,
  };
}

const QUANTITY_EPS = 1e-9;

/**
 * Applies redemptions in date order and returns the lots still held (scaled down) plus the slices taken by
 * each redemption. Tesouro sells by quantity and always oldest first (FIFO); bank products and Tesouro Reserva
 * withdraw a gross amount, oldest or newest first as set on the título (decision D7).
 */
export function applyRedemptions(
  titulo: Titulo,
  lots: Lot[],
  redemptions: Redemption[],
  market: MarketData,
): { remaining: Lot[]; parts: Map<string, RedeemedPart[]> } {
  const priced = isPricedTesouro(titulo.product);
  // Work with explicit quantities for Tesouro so fractions compose exactly.
  // Tesouro Reserva keeps its own units (or null when bought by amount).
  let held = lots.map((lot) => ({
    ...lot,
    quantity: priced ? lotQuantity(titulo, lot, market) : lot.quantity,
  }));
  const parts = new Map<string, RedeemedPart[]>();
  const order = priced ? 'fifo' : titulo.redemptionOrder;

  for (const redemption of [...redemptions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const eligible = held
      .filter((lot) => lot.date <= redemption.date)
      .sort((a, b) => (order === 'fifo' ? (a.date < b.date ? -1 : 1) : a.date > b.date ? -1 : 1));
    let left = priced ? (redemption.quantity ?? 0) : (redemption.grossCents ?? 0) / 100;
    const taken: RedeemedPart[] = [];
    for (const lot of eligible) {
      if (left <= QUANTITY_EPS) break;
      const available = priced ? lot.quantity! : lotGrossValue(titulo, lot, redemption.date, market);
      if (available <= 0) continue;
      const fraction = Math.min(1, left / available);
      left -= available * fraction;
      taken.push({ lotId: lot.id, fraction, slice: scaleLot(lot, fraction, lot.quantity) });
      held = held.map((l) => (l.id === lot.id ? scaleLot(l, 1 - fraction, l.quantity) : l));
    }
    if (left > 0.005)
      throw new RangeError(`Redemption ${redemption.id} exceeds the position on ${redemption.date}`);
    parts.set(redemption.id, taken);
  }
  const remaining = held.filter((lot) => (priced ? lot.quantity! > QUANTITY_EPS : lot.amountCents > 0));
  return { remaining, parts };
}

/** Quantity (Tesouro) or gross value (others) held on a date, after redemptions up to that date. */
export function positionOn(
  titulo: Titulo,
  lots: Lot[],
  redemptions: Redemption[],
  date: IsoDate,
  market: MarketData,
): Lot[] {
  return applyRedemptions(
    titulo,
    lots.filter((l) => l.date <= date),
    redemptions.filter((r) => r.date <= date),
    market,
  ).remaining;
}
