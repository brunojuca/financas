import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { indexCategories, type CategoryIndex } from '../domain/cashflow/summary';
import type { Account, Budget, Category, RecurringTemplate, Transaction } from '../domain/types';
import { db, META } from './db';

export interface FinanceData {
  accounts: Account[];
  categories: Category[];
  categoryIndex: CategoryIndex;
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringTemplate[];
  /** Account of the last entry saved from the transaction form. */
  lastAccountId: string | null;
  /** Date of the last entry saved from the transaction form. */
  lastDate: string | null;
}

const byOrder = <T extends { order: number; name: string }>(a: T, b: T) =>
  a.order - b.order || a.name.localeCompare(b.name, 'pt-BR');

/** Everything the cash-flow screens need, live-updated on any database change. undefined while loading. */
export function useFinanceData(): FinanceData | undefined {
  const raw = useLiveQuery(async () => {
    const [accounts, categories, transactions, budgets, recurring, lastAccount, lastDate] = await Promise.all(
      [
        db.accounts.toArray(),
        db.categories.toArray(),
        db.transactions.toArray(),
        db.budgets.toArray(),
        db.recurring.toArray(),
        db.meta.get(META.lastAccountId),
        db.meta.get(META.lastDate),
      ],
    );
    return {
      accounts: accounts.sort(byOrder),
      categories: categories.sort(byOrder),
      transactions,
      budgets,
      recurring,
      lastAccountId: lastAccount?.value ?? null,
      lastDate: lastDate?.value ?? null,
    };
  }, []);
  return useMemo(() => (raw ? { ...raw, categoryIndex: indexCategories(raw.categories) } : undefined), [raw]);
}
