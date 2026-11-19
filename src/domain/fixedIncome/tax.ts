import type { Cents } from '../types';

/** Income tax on fixed income, regressive by calendar days held (Lei 11.033/2004). */
export function incomeTaxRate(calendarDays: number): number {
  if (calendarDays <= 180) return 0.225;
  if (calendarDays <= 360) return 0.2;
  if (calendarDays <= 720) return 0.175;
  return 0.15;
}

// IOF on redemptions in the first 29 days (Decreto 6.306/2007, annex): % of the income, by calendar days held.
const IOF_TABLE = [
  96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10,
  6, 3,
];

export function iofRate(calendarDays: number): number {
  if (calendarDays >= 30) return 0;
  return IOF_TABLE[Math.max(1, calendarDays) - 1]! / 100;
}

export interface TaxBreakdown {
  /** Gross value minus amount invested. */
  income: Cents;
  iof: Cents;
  /** Custody fees paid, deducted from the IR base. */
  custody: Cents;
  ir: Cents;
  /** Gross − IOF − custody − IR. */
  net: Cents;
}

/**
 * Taxes when redeeming a position held for `calendarDays`. IOF applies to the income first; IR applies to
 * income − IOF, truncated at the cent. B3 custody is **not** deducted from the IR base — that is how the Tesouro Direto statement
 * computes it (decision D6). LCI/LCA (`exempt`) pay neither.
 */
export function redemptionTaxes(
  investedCents: Cents,
  grossCents: Cents,
  custodyCents: Cents,
  calendarDays: number,
  exempt: boolean,
): TaxBreakdown {
  const income = grossCents - investedCents;
  const positive = Math.max(0, income);
  const iof = exempt ? 0 : Math.round(positive * iofRate(calendarDays));
  const base = Math.max(0, positive - iof);
  // Truncated at the cent, like the Tesouro Direto statement (decision D14). Integer math: rate in thousandths.
  const ir = exempt ? 0 : Math.floor((base * Math.round(incomeTaxRate(calendarDays) * 1000)) / 1000);
  return { income, iof, custody: custodyCents, ir, net: grossCents - iof - custodyCents - ir };
}
