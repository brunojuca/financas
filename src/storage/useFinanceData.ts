import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { indexCategories, type CategoryIndex } from '../domain/cashflow/summary';
import type { Account, Budget, Category, RecurringTemplate, Transaction } from '../domain/types';
import { db } from './db';

export interface FinanceData {
  accounts: Account[];
  categories: Category[];
  categoryIndex: CategoryIndex;
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringTemplate[];
}

const byOrder = <T extends { order: number; name: string }>(a: T, b: T) =>
  a.order - b.order || a.name.localeCompare(b.name, 'pt-BR');

/** Everything the cash-flow screens need, live-updated on any database change. undefined while loading. */
export function useFinanceData(): FinanceData | undefined {
  const raw = useLiveQuery(async () => {
    const [accounts, categories, transactions, budgets, recurring] = await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.recurring.toArray(),
    ]);
    return {
      accounts: accounts.sort(byOrder),
      categories: categories.sort(byOrder),
      transactions,
      budgets,
      recurring,
    };
  }, []);
  return useMemo(() => (raw ? { ...raw, categoryIndex: indexCategories(raw.categories) } : undefined), [raw]);
}
