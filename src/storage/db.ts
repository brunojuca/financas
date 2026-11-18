import Dexie, { type EntityTable } from 'dexie';
import type { Account, Budget, Category, MetaEntry, RecurringTemplate, Transaction } from '../domain/types';

export class FinancasDb extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  recurring!: EntityTable<RecurringTemplate, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'financas') {
    super(name);
    // Bump the version and add an upgrade (plus a backup migration) for any schema change.
    this.version(1).stores({
      accounts: 'id',
      categories: 'id, parentId',
      transactions: 'id, date, accountId, categoryId, transferId, recurringId',
      budgets: 'id, month',
      recurring: 'id',
      meta: 'key',
    });
  }
}

export const db = new FinancasDb();

export const META = {
  initialized: 'initialized',
  lastBackupAt: 'lastBackupAt',
} as const;

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function isStoragePersisted(): Promise<boolean> {
  return (await navigator.storage?.persisted?.()) ?? false;
}
