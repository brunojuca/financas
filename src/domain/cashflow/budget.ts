import { monthOf } from '../dates';
import { signedAmount } from '../money';
import type { Budget, Category, Cents, Transaction, YearMonth } from '../types';
import { isTransfer, type CategoryIndex } from './summary';

export function budgetId(month: YearMonth, categoryId: string): string {
  return `${month}:${categoryId}`;
}

export interface BudgetRow {
  category: Category;
  /** Signed like transactions: income positive, expense negative. */
  budget: Cents;
  /** Signed sum of the month's transactions in this category. */
  actual: Cents;
  /** actual − budget. Positive = better than planned (spreadsheet `Orçamento!D`). */
  difference: Cents;
  /** |actual| / |budget|, or null when there is no budget. */
  usage: number | null;
}

export interface BudgetReport {
  month: YearMonth;
  rows: BudgetRow[];
  total: { budget: Cents; actual: Cents; difference: Cents };
}

/**
 * Budget vs actual per top-level income/expense category for a month (spreadsheet `Orçamento` sheet).
 * Transfers never count. Archived categories appear only if they have a budget or activity that month.
 */
export function budgetReport(
  month: YearMonth,
  categories: Category[],
  categoryIndex: CategoryIndex,
  budgets: Budget[],
  transactions: Transaction[],
): BudgetReport {
  const actualByCategory = new Map<string, Cents>();
  for (const t of transactions) {
    if (monthOf(t.date) !== month || isTransfer(t, categoryIndex)) continue;
    actualByCategory.set(t.categoryId, (actualByCategory.get(t.categoryId) ?? 0) + t.amountCents);
  }
  const budgetByCategory = new Map(
    budgets.filter((b) => b.month === month).map((b) => [b.categoryId, b.amountCents]),
  );

  const rows: BudgetRow[] = categories
    .filter((c) => c.parentId === null && c.kind !== 'transfer')
    .filter((c) => !c.archived || budgetByCategory.has(c.id) || actualByCategory.has(c.id))
    .sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === 'income' ? -1 : 1))
    .map((category) => {
      const budget = signedAmount(category.kind, budgetByCategory.get(category.id) ?? 0);
      const actual = actualByCategory.get(category.id) ?? 0;
      return {
        category,
        budget,
        actual,
        difference: actual - budget,
        usage: budget === 0 ? null : Math.abs(actual) / Math.abs(budget),
      };
    });

  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  return { month, rows, total: { budget, actual, difference: actual - budget } };
}
