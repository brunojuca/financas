import { isIsoDate } from '../../domain/dates';
import { trunc } from '../../domain/fixedIncome/precision';
import { isPricedTesouro, usesUnits, type Lot, type Product } from '../../domain/fixedIncome/types';
import type { IsoDate } from '../../domain/types';
import { t } from '../../i18n/pt-BR';

/** Purchase being typed. Rates in percent, as the user types them. */
export interface LotDraft {
  date: IsoDate | null;
  quantity: number | string;
  unitPrice: number | string;
  useRate: boolean;
  ratePercent: number | string;
  /** Cents. */
  amount: number | null;
}

export const emptyLot = (): LotDraft => ({
  date: null,
  quantity: '',
  unitPrice: '',
  useRate: false,
  ratePercent: '',
  amount: null,
});

export function lotToDraft(lot: Lot): LotDraft {
  return {
    date: lot.date,
    quantity: lot.quantity ?? '',
    unitPrice: lot.unitPrice ?? '',
    // Entered without a unit price: by rate (Tesouro) or by amount only (Tesouro Reserva).
    useRate: lot.unitPrice === null,
    ratePercent: lot.rate === null ? '' : lot.rate * 100,
    amount: lot.amountCents,
  };
}

/** NumberInput gives a string for values like "20240.50" (trailing zeros); '' when empty. */
const num = (v: number | string) => (typeof v === 'number' ? v : v.trim() === '' ? NaN : Number(v));

/** Amount paid for a Tesouro purchase by quantity × unit price (financial value truncated at 2 decimals). */
export function pricedAmountCents(draft: LotDraft): number | null {
  const q = num(draft.quantity);
  const p = num(draft.unitPrice);
  return q > 0 && p > 0 ? Math.round(trunc(q * p, 2) * 100) : null;
}

/** Validation errors for the lot fields, keyed by form path (`lot.date`, …). */
export function validateLot(
  product: Product,
  draft: LotDraft,
  maturity: IsoDate | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isIsoDate(draft.date)) errors['lot.date'] = t.common.required;
  else if (maturity && draft.date >= maturity) errors['lot.date'] = t.investments.maturityAfterPurchase;
  if (usesUnits(product) && !draft.useRate) {
    if (!(num(draft.quantity) > 0)) errors['lot.quantity'] = t.common.required;
    if (!(num(draft.unitPrice) > 0)) errors['lot.unitPrice'] = t.common.required;
  } else {
    if (!(draft.amount !== null && draft.amount > 0)) errors['lot.amount'] = t.transactions.amountPositive;
    if (isPricedTesouro(product) && Number.isNaN(num(draft.ratePercent)))
      errors['lot.ratePercent'] = t.common.required;
  }
  return errors;
}

/** Converts a validated draft into a lot. */
export function draftToLot(product: Product, draft: LotDraft, id: string, tituloId: string): Lot {
  const priced = isPricedTesouro(product);
  if (usesUnits(product) && !draft.useRate) {
    return {
      id,
      tituloId,
      date: draft.date!,
      amountCents: pricedAmountCents(draft)!,
      quantity: num(draft.quantity),
      unitPrice: num(draft.unitPrice),
      // Optional: the contracted rate as shown on the Tesouro statement (else implied from the price).
      rate: priced && !Number.isNaN(num(draft.ratePercent)) ? num(draft.ratePercent) / 100 : null,
    };
  }
  return {
    id,
    tituloId,
    date: draft.date!,
    amountCents: draft.amount!,
    quantity: null,
    unitPrice: null,
    rate: priced ? num(draft.ratePercent) / 100 : null,
  };
}
