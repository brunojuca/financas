import type { Cents, CategoryKind } from './types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Reais (as typed by the user) → integer cents. */
export function toCents(reais: number): Cents {
  return Math.round(reais * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

/** `R$ 1.234,56` / `-R$ 1.234,56` */
export function formatBRL(cents: Cents): string {
  // Intl uses a non-breaking space after "R$"; normalize so output is predictable.
  return brl.format(cents / 100).replace(/\u00a0/g, ' ');
}

/** `1.234,56` without currency symbol (CSV export). */
export function formatDecimal(cents: Cents): string {
  return decimal.format(cents / 100);
}

/** Applies the sign implied by the category kind to a positive amount. */
export function signedAmount(kind: CategoryKind, positiveCents: Cents): Cents {
  const abs = Math.abs(positiveCents);
  if (abs === 0) return 0; // avoid -0 ("-R$ 0,00")
  return kind === 'income' ? abs : -abs;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
