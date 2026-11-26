import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { reportView, type CardReportMode } from '../domain/cashflow/creditCard';
import { projectRecurring } from '../domain/cashflow/recurring';
import { addMonths, currentMonth, todayIso } from '../domain/dates';
import { indexCategories, type CategoryIndex } from '../domain/cashflow/summary';
import type { Account, Budget, Category, RecurringTemplate, Transaction, YearMonth } from '../domain/types';
import { db, META } from './db';

export interface FinanceData {
  accounts: Account[];
  categories: Category[];
  categoryIndex: CategoryIndex;
  /** Stored entries. */
  transactions: Transaction[];
  /**
   * Recurring occurrences after today, computed from the templates (not stored, `isProjected`), through
   * at least 12 months ahead or the month the screen shows. Editing one stores it.
   */
  projected: Transaction[];
  budgets: Budget[];
  recurring: RecurringTemplate[];
  /** Account of the last entry saved from the transaction form. */
  lastAccountId: string | null;
  /** Date of the last entry saved from the transaction form. */
  lastDate: string | null;
  /** Which date card purchases count on in monthly reports (setting in Configurações). */
  cardReportMode: CardReportMode;
  /**
   * Transactions as they count in monthly reports (budget, income/expense, category charts, Lançamentos month,
   * total-balance history): stored plus projected, card purchases moved to their bill's due date when
   * `cardReportMode` is `bill`.
   * Account balances and the card limit must use `transactions`.
   */
  budgetTransactions: Transaction[];
  /** The same with the other card-report option (for the small figures on Início); null when there are no cards. */
  altBudgetTransactions: Transaction[] | null;
  /** Show those figures (setting). */
  showAltCardReport: boolean;
}

const byOrder = <T extends { order: number; name: string }>(a: T, b: T) =>
  a.order - b.order || a.name.localeCompare(b.name, 'pt-BR');

/**
 * Everything the cash-flow screens need, live-updated on any database change. undefined while loading.
 * `throughMonth`: the month the screen shows, so recurring entries are projected at least that far.
 */
export function useFinanceData(throughMonth?: YearMonth): FinanceData | undefined {
  const raw = useLiveQuery(async () => {
    const [
      accounts,
      categories,
      transactions,
      budgets,
      recurring,
      lastAccount,
      lastDate,
      reportMode,
      showAlt,
    ] = await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.recurring.toArray(),
      db.meta.get(META.lastAccountId),
      db.meta.get(META.lastDate),
      db.meta.get(META.cardReportMode),
      db.meta.get(META.showAltCardReport),
    ]);
    return {
      accounts: accounts.sort(byOrder),
      categories: categories.sort(byOrder),
      transactions,
      budgets,
      recurring,
      lastAccountId: lastAccount?.value ?? null,
      lastDate: lastDate?.value ?? null,
      cardReportMode: (reportMode?.value === 'purchase' ? 'purchase' : 'bill') as CardReportMode,
      showAltCardReport: showAlt?.value === 'true',
    };
  }, []);
  return useMemo(() => {
    if (!raw) return undefined;
    const categoryIndex = indexCategories(raw.categories);
    const cards = new Map(
      raw.accounts.filter((a) => a.type === 'creditCard' && a.creditCard).map((a) => [a.id, a.creditCard!]),
    );
    const horizon = addMonths(currentMonth(), 12);
    const until = throughMonth && throughMonth > horizon ? throughMonth : horizon;
    const projected = projectRecurring(raw.recurring, raw.transactions, categoryIndex, todayIso(), until);
    const all = projected.length ? [...raw.transactions, ...projected] : raw.transactions;
    return {
      ...raw,
      categoryIndex,
      projected,
      budgetTransactions: reportView(all, cards, categoryIndex, raw.cardReportMode),
      altBudgetTransactions:
        cards.size === 0
          ? null
          : reportView(all, cards, categoryIndex, raw.cardReportMode === 'bill' ? 'purchase' : 'bill'),
    };
  }, [raw, throughMonth]);
}
