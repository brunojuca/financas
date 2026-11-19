import { addDays } from '../dates';
import type { IsoDate } from '../types';
import type { MarketData } from './market';
import { positionOn } from './redemption';
import { priceOn, type TesouroPrices } from './tesouroPrices';
import { isPricedTesouro, type Lot, type Redemption, type Titulo } from './types';
import { CUSTODY_EXEMPTION_CENTS, lotGrossValue, lotQuantity, type Exemption } from './valuation';

export interface PoolEntry {
  titulo: Titulo;
  lots: Lot[];
  redemptions: Redemption[];
}

/**
 * The R$ 10.000 custody exemption of a pool (Tesouro Selic per CPF; Tesouro Reserva separately — D3), day by day
 * (decision D5): on each day the pool's lots held that day are valued (market price when published, else curve),
 * and the exemption goes to the **newest purchases first** until the R$ 10.000 are used up. B3 defines the
 * exemption on the total held; which purchases carry it is not published — newest-first is being checked against
 * real statements.
 *
 * Returns, for a lot (or a slice of it, e.g. a redeemed part), its exemption in reais on any date, in proportion
 * to the part of the lot held that day that it represents.
 */
export function poolExemption(
  entries: PoolEntry[],
  market: MarketData,
  prices: TesouroPrices | null,
): (lot: Lot) => Exemption {
  const limit = CUSTODY_EXEMPTION_CENTS / 100;
  const cache = new Map<IsoDate, Map<string, { heldCents: number; exemption: number }>>();

  const valueOn = (titulo: Titulo, lot: Lot, date: IsoDate): number => {
    if (isPricedTesouro(titulo.product) && prices && date <= addDays(prices.lastDate, 1)) {
      const row = priceOn(prices, titulo, date);
      if (row && row.sell > 0 && row.date >= lot.date) return lotQuantity(titulo, lot, market) * row.sell;
    }
    return lotGrossValue(titulo, lot, date, market);
  };

  const allocation = (date: IsoDate) => {
    let byLot = cache.get(date);
    if (byLot) return byLot;
    const held: { lot: Lot; value: number }[] = [];
    for (const { titulo, lots, redemptions } of entries) {
      if (titulo.maturity && titulo.maturity <= date) continue;
      for (const lot of positionOn(titulo, lots, redemptions, date, market)) {
        held.push({ lot, value: valueOn(titulo, lot, date) });
      }
    }
    held.sort((a, b) =>
      a.lot.date === b.lot.date ? b.lot.id.localeCompare(a.lot.id) : a.lot.date < b.lot.date ? 1 : -1,
    );
    byLot = new Map();
    let left = limit;
    for (const { lot, value } of held) {
      const exemption = Math.min(Math.max(0, value), left);
      left -= exemption;
      byLot.set(lot.id, { heldCents: lot.amountCents, exemption });
    }
    cache.set(date, byLot);
    return byLot;
  };

  return (lot) => (date) => {
    const entry = allocation(date).get(lot.id);
    if (!entry || entry.heldCents <= 0) return 0;
    return (entry.exemption * Math.min(lot.amountCents, entry.heldCents)) / entry.heldCents;
  };
}
