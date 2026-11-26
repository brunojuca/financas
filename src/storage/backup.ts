import { ungeneratedMonths } from '../domain/cashflow/recurring';
import { currentMonth, isIsoDate, isYearMonth, formatDateBR } from '../domain/dates';
import { formatDecimal } from '../domain/money';
import type { Lot, Redemption, Titulo } from '../domain/fixedIncome/types';
import type { Account, Budget, Category, RecurringTemplate, Transaction } from '../domain/types';
import { db, META, setMeta } from './db';

export const BACKUP_APP = 'financas';
/**
 * v2: transactions gained `extraordinary` and may have `categoryId: null`.
 * v3: investments (`titulos`, `lots`, `redemptions`); missing in older files → empty.
 * v4: accounts gained `includeInTotal`; missing in older files → true.
 * v5: credit cards — `creditCard` on accounts, `billMonth` and `installmentGroupId` on transactions; missing → null.
 * v6: recurring templates gained `skippedMonths`; missing → past months without an entry (see db v7).
 */
export const SCHEMA_VERSION = 6;

export interface BackupData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringTemplate[];
  titulos: Titulo[];
  lots: Lot[];
  redemptions: Redemption[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export class BackupError extends Error {}

export async function createBackup(): Promise<BackupFile> {
  const [accounts, categories, transactions, budgets, recurring, titulos, lots, redemptions] =
    await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.recurring.toArray(),
      db.titulos.toArray(),
      db.lots.toArray(),
      db.redemptions.toArray(),
    ]);
  return {
    app: BACKUP_APP,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { accounts, categories, transactions, budgets, recurring, titulos, lots, redemptions },
  };
}

export async function markBackupDone(): Promise<void> {
  await setMeta(META.lastBackupAt, new Date().toISOString());
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isNullableStr = (v: unknown) => v === null || isStr(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNullableNum = (v: unknown) => v === null || isNum(v);
const isNullableInt = (v: unknown) => v === null || isInt(v);

function check(ok: boolean, what: string): void {
  if (!ok) throw new BackupError(what);
}

/** Validates an untrusted parsed JSON value and returns it typed. Throws BackupError. */
export function parseBackup(raw: unknown): BackupFile {
  check(isObj(raw) && raw.app === BACKUP_APP, 'not a backup from this app');
  const file = raw as Record<string, unknown>;
  check(isInt(file.schemaVersion), 'missing schemaVersion');
  check((file.schemaVersion as number) <= SCHEMA_VERSION, 'backup is from a newer app version');
  check(isObj(file.data), 'missing data');
  const data = file.data as Record<string, unknown>;
  // v1/v2 → v3: no investments yet.
  for (const key of ['titulos', 'lots', 'redemptions']) data[key] ??= [];
  for (const key of [
    'accounts',
    'categories',
    'transactions',
    'budgets',
    'recurring',
    'titulos',
    'lots',
    'redemptions',
  ]) {
    check(Array.isArray(data[key]), `missing ${key}`);
  }
  const all = (key: string, valid: (r: Record<string, unknown>) => boolean) =>
    (data[key] as unknown[]).forEach((r, i) => check(isObj(r) && valid(r), `invalid ${key}[${i}]`));

  all(
    'accounts',
    (r) =>
      isStr(r.id) &&
      isStr(r.name) &&
      isStr(r.type) &&
      typeof r.archived === 'boolean' &&
      (r.includeInTotal === undefined || typeof r.includeInTotal === 'boolean'),
  );
  all(
    'categories',
    (r) =>
      isStr(r.id) &&
      isStr(r.name) &&
      ['income', 'expense', 'transfer'].includes(r.kind as string) &&
      isNullableStr(r.parentId),
  );
  all(
    'transactions',
    (r) =>
      isStr(r.id) &&
      isIsoDate(r.date) &&
      isStr(r.description) &&
      isInt(r.amountCents) &&
      isStr(r.accountId) &&
      isNullableStr(r.categoryId) &&
      isNullableStr(r.subcategoryId) &&
      (r.extraordinary === undefined || typeof r.extraordinary === 'boolean') &&
      isNullableStr(r.transferId) &&
      isNullableStr(r.recurringId) &&
      (r.billMonth === undefined || r.billMonth === null || isYearMonth(r.billMonth)) &&
      (r.installmentGroupId === undefined || isNullableStr(r.installmentGroupId)),
  );
  all('budgets', (r) => isStr(r.id) && isYearMonth(r.month) && isStr(r.categoryId) && isInt(r.amountCents));
  all(
    'recurring',
    (r) =>
      isStr(r.id) &&
      isStr(r.description) &&
      isInt(r.amountCents) &&
      isStr(r.accountId) &&
      isStr(r.categoryId) &&
      isInt(r.dayOfMonth) &&
      isYearMonth(r.startMonth) &&
      (r.skippedMonths === undefined ||
        (Array.isArray(r.skippedMonths) && r.skippedMonths.every((m) => isYearMonth(m)))),
  );
  all(
    'titulos',
    (r) =>
      isStr(r.id) &&
      isStr(r.name) &&
      isStr(r.product) &&
      (r.maturity === null || isIsoDate(r.maturity)) &&
      isNum(r.rate) &&
      isNum(r.cdiPercent),
  );
  all(
    'lots',
    (r) =>
      isStr(r.id) &&
      isStr(r.tituloId) &&
      isIsoDate(r.date) &&
      isInt(r.amountCents) &&
      isNullableNum(r.quantity) &&
      isNullableNum(r.unitPrice) &&
      isNullableNum(r.rate),
  );
  all(
    'redemptions',
    (r) =>
      isStr(r.id) &&
      isStr(r.tituloId) &&
      isIsoDate(r.date) &&
      isNullableNum(r.quantity) &&
      isNullableInt(r.grossCents) &&
      isNullableInt(r.netCents),
  );
  return raw as unknown as BackupFile;
}

/** Replaces everything in the database with the backup contents. */
export async function restoreBackup(file: BackupFile): Promise<void> {
  const { data } = file;
  await db.transaction(
    'rw',
    [
      db.accounts,
      db.categories,
      db.transactions,
      db.budgets,
      db.recurring,
      db.titulos,
      db.lots,
      db.redemptions,
      db.meta,
    ],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.categories.clear(),
        db.transactions.clear(),
        db.budgets.clear(),
        db.recurring.clear(),
        db.titulos.clear(),
        db.lots.clear(),
        db.redemptions.clear(),
      ]);
      await db.accounts.bulkPut(
        data.accounts.map((a, i) => ({
          ...a,
          order: a.order ?? i,
          includeInTotal: a.includeInTotal ?? true,
          creditCard: a.creditCard ?? null, // before v5
        })),
      );
      await db.categories.bulkPut(
        data.categories.map((c, i) => ({ ...c, archived: c.archived ?? false, order: c.order ?? i })),
      );
      const transactions = data.transactions.map((t) => ({
        ...t,
        extraordinary: t.extraordinary ?? false, // v1 backups
        recurringMonth: t.recurringMonth ?? null,
        installment: t.installment ?? null,
        billMonth: t.billMonth ?? null, // before v5
        installmentGroupId: t.installmentGroupId ?? null,
      }));
      await db.transactions.bulkPut(transactions);
      await db.budgets.bulkPut(data.budgets);
      await db.recurring.bulkPut(
        data.recurring.map((r) => ({
          ...r,
          // before v6: months never generated stay empty (see db v7)
          skippedMonths:
            r.skippedMonths ?? ungeneratedMonths({ ...r, skippedMonths: [] }, transactions, currentMonth()),
        })),
      );
      await db.titulos.bulkPut(data.titulos);
      await db.lots.bulkPut(data.lots);
      await db.redemptions.bulkPut(data.redemptions);
      await setMeta(META.initialized, new Date().toISOString());
    },
  );
}

function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Transactions as CSV in the spreadsheet's column layout. Uses `;` and a BOM so
 * LibreOffice / Excel in pt-BR open it correctly.
 */
export function transactionsToCsv(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
): string {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const header = ['Data', 'Descrição', 'Valor', 'Conta', 'Categoria', 'Subcategoria', 'Extraordinário'];
  const rows = [...transactions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => [
      formatDateBR(t.date),
      t.description,
      formatDecimal(t.amountCents),
      accountName.get(t.accountId) ?? '',
      t.categoryId ? (categoryName.get(t.categoryId) ?? '') : '',
      t.subcategoryId ? (categoryName.get(t.subcategoryId) ?? '') : '',
      t.extraordinary ? 'Sim' : '',
    ]);
  return '\ufeff' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
