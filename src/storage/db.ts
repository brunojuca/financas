import Dexie, { type EntityTable } from 'dexie';
import { ungeneratedMonths } from '../domain/cashflow/recurring';
import { currentMonth } from '../domain/dates';
import type { Lot, Redemption, Titulo } from '../domain/fixedIncome/types';
import type { Account, Budget, Category, MetaEntry, RecurringTemplate, Transaction } from '../domain/types';

/** Public reference data downloaded on demand (series rows after the bundled snapshot, Focus survey). */
export interface ReferenceEntry {
  key: 'selic' | 'cdi' | 'selicMeta' | 'ipca' | 'focus' | 'tesouroPrices' | 'tesouroLive';
  /** Series: [date or month, value] rows newer than the bundled files. Focus: the survey. Prices: parsed file. */
  value: unknown;
  fetchedAt: string;
}

export class FinancasDb extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  recurring!: EntityTable<RecurringTemplate, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;
  titulos!: EntityTable<Titulo, 'id'>;
  lots!: EntityTable<Lot, 'id'>;
  redemptions!: EntityTable<Redemption, 'id'>;
  reference!: EntityTable<ReferenceEntry, 'key'>;

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
    // v2: transactions may be uncategorized and carry an `extraordinary` flag.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('transactions')
          .toCollection()
          .modify((t: Record<string, unknown>) => {
            if (typeof t.extraordinary !== 'boolean') t.extraordinary = false;
          }),
      );
    // v3: fixed-income investments (títulos, purchase lots, redemptions).
    this.version(3).stores({ titulos: 'id', lots: 'id, tituloId', redemptions: 'id, tituloId' });
    // v4: cache of public reference data (not user data: never in backups).
    this.version(4).stores({ reference: 'key' });
    // v5: accounts gained `includeInTotal` (existing accounts stay in the total).
    this.version(5)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('accounts')
          .toCollection()
          .modify((a: Record<string, unknown>) => {
            if (typeof a.includeInTotal !== 'boolean') a.includeInTotal = true;
          }),
      );
    // v6: credit cards — card settings on accounts; bill and installment group on transactions.
    this.version(6)
      .stores({
        transactions: 'id, date, accountId, categoryId, transferId, recurringId, installmentGroupId',
      })
      .upgrade(async (tx) => {
        await tx
          .table('accounts')
          .toCollection()
          .modify((a: Record<string, unknown>) => {
            if (a.creditCard === undefined) a.creditCard = null;
          });
        await tx
          .table('transactions')
          .toCollection()
          .modify((t: Record<string, unknown>) => {
            if (t.billMonth === undefined) t.billMonth = null;
            if (t.installmentGroupId === undefined) t.installmentGroupId = null;
          });
      });
    // v7: recurring entries are generated automatically. Past months that were never generated (or were
    // deleted) become `skippedMonths`, so turning automatic generation on creates nothing in the past.
    this.version(7)
      .stores({})
      .upgrade(async (tx) => {
        const transactions = (await tx.table('transactions').toArray()) as Transaction[];
        await tx
          .table('recurring')
          .toCollection()
          .modify((r: RecurringTemplate) => {
            if (!Array.isArray(r.skippedMonths))
              r.skippedMonths = ungeneratedMonths({ ...r, skippedMonths: [] }, transactions, currentMonth());
          });
      });
  }
}

export const db = new FinancasDb();

export const META = {
  initialized: 'initialized',
  lastBackupAt: 'lastBackupAt',
  /** Account of the last entry saved from the transaction form (default for the next one). */
  lastAccountId: 'lastAccountId',
  /** Date of the last entry saved from the transaction form (default for the next one). */
  lastDate: 'lastDate',
  /** Investment projection scenario (JSON of `Scenario`). */
  scenario: 'scenario',
  /** Which date card purchases count on in monthly reports (`CardReportMode`: 'bill' | 'purchase'). */
  cardReportMode: 'cardReportMode',
  /** Lançamentos: show card purchases grouped into one line per bill ('true' | 'false'). */
  groupCardBills: 'groupCardBills',
  /** Início: also show the month's figures computed with the other `cardReportMode` ('true' | 'false'). */
  showAltCardReport: 'showAltCardReport',
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
