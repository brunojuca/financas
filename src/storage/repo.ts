import { budgetId } from '../domain/cashflow/budget';
import { generateRecurring } from '../domain/cashflow/recurring';
import { indexCategories } from '../domain/cashflow/summary';
import { buildTransfer, type TransferInput } from '../domain/cashflow/transfer';
import { addMonths, todayIso } from '../domain/dates';
import { createDemoData } from '../domain/demo';
import { createDemoInvestments } from '../domain/fixedIncome/demo';
import type { Lot, Redemption, Titulo } from '../domain/fixedIncome/types';
import type { ImportPlan } from '../domain/import/plan';
import { createDefaultSeed, findTransferCategory } from '../domain/seed';
import type {
  Account,
  Budget,
  Category,
  Cents,
  RecurringTemplate,
  Transaction,
  YearMonth,
} from '../domain/types';
import { db, META, setMeta } from './db';

export const newId = () => crypto.randomUUID();

// ---------- setup ----------

export async function initializeWithSeed(): Promise<void> {
  const seed = createDefaultSeed(newId);
  await db.transaction('rw', [db.accounts, db.categories, db.meta], async () => {
    await db.accounts.bulkPut(seed.accounts);
    await db.categories.bulkPut(seed.categories);
    await setMeta(META.initialized, new Date().toISOString());
  });
}

export async function loadDemoData(lastMonth: YearMonth): Promise<void> {
  const demo = createDemoData(lastMonth, newId);
  const investments = createDemoInvestments(lastMonth, newId);
  await clearAllData();
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
      await db.titulos.bulkPut(investments.titulos);
      await db.lots.bulkPut(investments.lots);
      await db.redemptions.bulkPut(investments.redemptions);
      await db.accounts.bulkPut(demo.accounts);
      await db.categories.bulkPut(demo.categories);
      await db.transactions.bulkPut(demo.transactions);
      await db.budgets.bulkPut(demo.budgets);
      await db.recurring.bulkPut(demo.recurring);
      await setMeta(META.initialized, new Date().toISOString());
    },
  );
}

export async function clearAllData(): Promise<void> {
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
    () =>
      Promise.all([
        db.titulos.clear(),
        db.lots.clear(),
        db.redemptions.clear(),
        db.accounts.clear(),
        db.categories.clear(),
        db.transactions.clear(),
        db.budgets.clear(),
        db.recurring.clear(),
        db.meta.clear(),
      ]),
  );
}

// ---------- accounts ----------

export async function saveAccount(account: Account, openingBalanceCents: Cents = 0): Promise<void> {
  await db.transaction('rw', [db.accounts, db.categories, db.transactions], async () => {
    await db.accounts.put(account);
    if (openingBalanceCents !== 0) {
      const transfer = findTransferCategory(await db.categories.toArray());
      if (!transfer) throw new Error('Transfer category missing');
      await db.transactions.put({
        id: newId(),
        date: todayIso(),
        description: 'Saldo inicial',
        amountCents: openingBalanceCents,
        accountId: account.id,
        categoryId: transfer.id,
        subcategoryId: null,
        extraordinary: false,
        transferId: null,
        recurringId: null,
        recurringMonth: null,
        installment: null,
      });
    }
  });
}

/** Deletes an account without history; archives it otherwise. Returns what happened. */
export async function removeAccount(id: string): Promise<'deleted' | 'archived'> {
  return db.transaction('rw', [db.accounts, db.transactions, db.recurring], async () => {
    const used = (await db.transactions.where('accountId').equals(id).count()) > 0;
    if (used) {
      await db.accounts.update(id, { archived: true });
      await db.recurring.filter((r) => r.accountId === id).modify({ active: false });
      return 'archived';
    }
    await db.recurring.filter((r) => r.accountId === id).delete();
    await db.accounts.delete(id);
    return 'deleted';
  });
}

// ---------- categories ----------

export async function saveCategory(category: Category): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await db.categories.put(category);
    // Subcategories always share the parent's kind.
    if (category.parentId === null) {
      await db.categories.where('parentId').equals(category.id).modify({ kind: category.kind });
    }
  });
}

export async function removeCategory(id: string): Promise<'deleted' | 'archived'> {
  return db.transaction('rw', [db.categories, db.transactions, db.budgets, db.recurring], async () => {
    const children = await db.categories.where('parentId').equals(id).primaryKeys();
    const ids = [id, ...children];
    const used =
      (await db.transactions
        .filter((t) => ids.includes(t.categoryId ?? '') || ids.includes(t.subcategoryId ?? ''))
        .count()) > 0 ||
      (await db.recurring
        .filter((r) => ids.includes(r.categoryId) || ids.includes(r.subcategoryId ?? ''))
        .count()) > 0;
    if (used) {
      await db.categories.where('id').anyOf(ids).modify({ archived: true });
      return 'archived';
    }
    await db.budgets.filter((b) => ids.includes(b.categoryId)).delete();
    await db.categories.bulkDelete(ids);
    return 'deleted';
  });
}

/** Swaps the order of two sibling categories. */
export async function swapCategoryOrder(a: Category, b: Category): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await db.categories.update(a.id, { order: b.order });
    await db.categories.update(b.id, { order: a.order });
  });
}

// ---------- transactions ----------

export async function saveTransaction(transaction: Transaction): Promise<void> {
  await db.transactions.put(transaction);
}

export async function saveTransfer(input: TransferInput): Promise<void> {
  const legs = buildTransfer(input, newId);
  await db.transaction('rw', db.transactions, async () => {
    if (input.transferId) await db.transactions.where('transferId').equals(input.transferId).delete();
    await db.transactions.bulkPut(legs);
  });
}

/** Partial update, used by quick fixes on the Pendências screen. */
export async function updateTransaction(
  id: string,
  changes: Partial<Omit<Transaction, 'id'>>,
): Promise<void> {
  await db.transactions.update(id, changes);
}

/** Deletes a transaction; for a transfer, deletes both legs. */
export async function deleteTransaction(transaction: Transaction): Promise<void> {
  if (transaction.transferId)
    await db.transactions.where('transferId').equals(transaction.transferId).delete();
  else await db.transactions.delete(transaction.id);
}

// ---------- budgets ----------

export async function setBudget(month: YearMonth, categoryId: string, amountCents: Cents): Promise<void> {
  const id = budgetId(month, categoryId);
  if (amountCents === 0) await db.budgets.delete(id);
  else await db.budgets.put({ id, month, categoryId, amountCents: Math.abs(amountCents) });
}

/** Copies the previous month's budget into `month`. Returns how many entries were copied. */
export async function copyBudgetFromPreviousMonth(month: YearMonth): Promise<number> {
  const previous = await db.budgets.where('month').equals(addMonths(month, -1)).toArray();
  const copies: Budget[] = previous.map((b) => ({ ...b, id: budgetId(month, b.categoryId), month }));
  await db.transaction('rw', db.budgets, async () => {
    await db.budgets.where('month').equals(month).delete();
    await db.budgets.bulkPut(copies);
  });
  return copies.length;
}

// ---------- recurring ----------

export async function saveRecurring(template: RecurringTemplate): Promise<void> {
  await db.recurring.put(template);
}

export async function deleteRecurring(id: string): Promise<void> {
  // Already generated transactions are kept; they simply lose the link.
  await db.transaction('rw', [db.recurring, db.transactions], async () => {
    await db.transactions.where('recurringId').equals(id).modify({ recurringId: null, recurringMonth: null });
    await db.recurring.delete(id);
  });
}

/** Creates the month's entries from active templates. Safe to run more than once. */
export async function generateRecurringForMonth(month: YearMonth): Promise<number> {
  return db.transaction('rw', [db.recurring, db.transactions, db.categories], async () => {
    const [templates, categories, existing] = await Promise.all([
      db.recurring.toArray(),
      db.categories.toArray(),
      db.transactions.filter((t) => t.recurringMonth === month).toArray(),
    ]);
    const created = generateRecurring(templates, existing, indexCategories(categories), month, newId);
    await db.transactions.bulkPut(created);
    return created.length;
  });
}

// ---------- import ----------

export async function applyImportPlan(plan: ImportPlan): Promise<void> {
  await db.transaction('rw', [db.accounts, db.categories, db.transactions], async () => {
    await db.accounts.bulkPut(plan.accounts);
    await db.categories.bulkPut(plan.categories);
    await db.transactions.bulkPut(plan.transactions);
  });
}

// ---------- investments ----------

/** Saves a título; with `firstLot`, also its first purchase, in one transaction. */
export async function saveTitulo(titulo: Titulo, firstLot?: Lot): Promise<void> {
  await db.transaction('rw', [db.titulos, db.lots], async () => {
    await db.titulos.put(titulo);
    if (firstLot) await db.lots.put(firstLot);
  });
}

/** Deletes a título with its purchases and redemptions. */
export async function deleteTitulo(id: string): Promise<void> {
  await db.transaction('rw', [db.titulos, db.lots, db.redemptions], async () => {
    await db.lots.where('tituloId').equals(id).delete();
    await db.redemptions.where('tituloId').equals(id).delete();
    await db.titulos.delete(id);
  });
}

export async function saveLot(lot: Lot): Promise<void> {
  await db.lots.put(lot);
}

export async function deleteLot(id: string): Promise<void> {
  await db.lots.delete(id);
}

export async function saveRedemption(redemption: Redemption): Promise<void> {
  await db.redemptions.put(redemption);
}

export async function deleteRedemption(id: string): Promise<void> {
  await db.redemptions.delete(id);
}
