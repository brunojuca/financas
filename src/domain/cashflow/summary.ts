import { monthOf } from '../dates';
import type { Category, Cents, Transaction, YearMonth } from '../types';

export type CategoryIndex = ReadonlyMap<string, Category>;

export function indexCategories(categories: Category[]): CategoryIndex {
  return new Map(categories.map((c) => [c.id, c]));
}

/** Transfers between own accounts and opening balances: never income or expense. */
export function isTransfer(t: Transaction, categories: CategoryIndex): boolean {
  return (
    t.transferId !== null || (t.categoryId !== null && categories.get(t.categoryId)?.kind === 'transfer')
  );
}

/** Counts as regular income/expense: not a transfer and not extraordinary. */
export function isRegular(t: Transaction, categories: CategoryIndex): boolean {
  return !t.extraordinary && !isTransfer(t, categories);
}

/** Balance per account over all time (spreadsheet `Contas` sheet). */
export function accountBalances(transactions: Transaction[]): Map<string, Cents> {
  const balances = new Map<string, Cents>();
  for (const t of transactions) balances.set(t.accountId, (balances.get(t.accountId) ?? 0) + t.amountCents);
  return balances;
}

export interface MonthTotals {
  /** Positive. */
  income: Cents;
  /** Positive (absolute value of outflows). */
  expense: Cents;
  /** income − expense */
  net: Cents;
  /** Signed net of extraordinary entries (kept out of income/expense). */
  extraordinary: Cents;
}

/**
 * Income vs expense for one month. Sums signed amounts per category kind, so a refund
 * (positive amount in an expense category) reduces expenses instead of counting as income.
 * Uncategorized entries count by sign. Extraordinary entries are reported apart.
 */
export function monthTotals(
  transactions: Transaction[],
  categories: CategoryIndex,
  month: YearMonth,
): MonthTotals {
  let income = 0;
  let expense = 0;
  let extraordinary = 0;
  for (const t of transactions) {
    if (monthOf(t.date) !== month || isTransfer(t, categories)) continue;
    if (t.extraordinary) {
      extraordinary += t.amountCents;
      continue;
    }
    const kind = t.categoryId === null ? null : categories.get(t.categoryId)?.kind;
    if (kind === 'income' || (kind == null && t.amountCents > 0)) income += t.amountCents;
    else expense -= t.amountCents;
  }
  return { income, expense, net: income - expense, extraordinary };
}

export interface MonthlyPoint extends MonthTotals {
  month: YearMonth;
}

export function monthlySeries(
  transactions: Transaction[],
  categories: CategoryIndex,
  months: YearMonth[],
): MonthlyPoint[] {
  return months.map((month) => ({ month, ...monthTotals(transactions, categories, month) }));
}

export interface CategoryAmount {
  categoryId: string;
  /** Positive expense amount. */
  amount: Cents;
}

/** Expenses of the month grouped by top-level category, largest first. Categories netting ≤ 0 are dropped. */
export function expensesByCategory(
  transactions: Transaction[],
  categories: CategoryIndex,
  month: YearMonth,
): CategoryAmount[] {
  const totals = new Map<string, Cents>();
  for (const t of transactions) {
    if (monthOf(t.date) !== month || !isRegular(t, categories) || t.categoryId === null) continue;
    if (categories.get(t.categoryId)?.kind !== 'expense') continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) - t.amountCents);
  }
  return [...totals]
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Total balance (all accounts) at the end of each month. */
export function balanceHistory(
  transactions: Transaction[],
  months: YearMonth[],
): { month: YearMonth; balance: Cents }[] {
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const result: { month: YearMonth; balance: Cents }[] = [];
  let i = 0;
  let running = 0;
  for (const month of months) {
    while (i < sorted.length && monthOf(sorted[i]!.date) <= month) {
      running += sorted[i]!.amountCents;
      i++;
    }
    result.push({ month, balance: running });
  }
  return result;
}
