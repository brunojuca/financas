import type { Account, AccountType, Category, CategoryKind, Transaction } from '../types';
import { normalizeName, type ValidCsvRow } from './csv';

// Turns validated CSV rows + the user's name mappings into new accounts, categories and transactions.

export type AccountMapping =
  { action: 'existing'; accountId: string } | { action: 'new'; name: string; type: AccountType };
export type CategoryMapping =
  { action: 'existing'; categoryId: string } | { action: 'new'; name: string; kind: CategoryKind };
export type SubcategoryMapping =
  { action: 'existing'; categoryId: string } | { action: 'new'; name: string } | { action: 'drop' };

export interface Mappings {
  /** Keyed by normalized CSV account name. */
  accounts: Record<string, AccountMapping>;
  /** Keyed by normalized CSV category name. */
  categories: Record<string, CategoryMapping>;
  /** Keyed by `subcategoryKey(category, subcategory)`. */
  subcategories: Record<string, SubcategoryMapping>;
}

export interface SourceName {
  key: string;
  /** Name as first seen in the file. */
  name: string;
  count: number;
}

export interface SourceCategory extends SourceName {
  /** Guess from the CSV: transfer by name, else by the sign of the total. */
  suggestedKind: CategoryKind;
}

export interface SourceSubcategory extends SourceName {
  categoryKey: string;
}

export interface ImportSource {
  accounts: SourceName[];
  categories: SourceCategory[];
  subcategories: SourceSubcategory[];
}

export const subcategoryKey = (category: string, subcategory: string) =>
  `${normalizeName(category)}/${normalizeName(subcategory)}`;

const isTransferName = (name: string) => /^transferencias?( entre contas)?$/.test(normalizeName(name));

/** Distinct accounts, categories and subcategories referenced by the rows. */
export function summarizeSource(rows: ValidCsvRow[]): ImportSource {
  const accounts = new Map<string, SourceName>();
  const categories = new Map<string, SourceCategory & { total: number }>();
  const subcategories = new Map<string, SourceSubcategory>();
  for (const row of rows) {
    const accountKey = normalizeName(row.account);
    const a = accounts.get(accountKey) ?? { key: accountKey, name: row.account, count: 0 };
    a.count++;
    accounts.set(accountKey, a);
    if (!row.category) continue;
    const categoryKey = normalizeName(row.category);
    const c = categories.get(categoryKey) ?? {
      key: categoryKey,
      name: row.category,
      count: 0,
      total: 0,
      suggestedKind: 'expense' as CategoryKind,
    };
    c.count++;
    c.total += row.amountCents;
    categories.set(categoryKey, c);
    if (!row.subcategory) continue;
    const key = subcategoryKey(row.category, row.subcategory);
    const s = subcategories.get(key) ?? { key, categoryKey, name: row.subcategory, count: 0 };
    s.count++;
    subcategories.set(key, s);
  }
  const byName = <T extends SourceName>(a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR');
  return {
    accounts: [...accounts.values()].sort(byName),
    categories: [...categories.values()]
      .map(({ total, ...c }) => ({
        ...c,
        suggestedKind: (isTransferName(c.name)
          ? 'transfer'
          : total > 0
            ? 'income'
            : 'expense') as CategoryKind,
      }))
      .sort(byName),
    subcategories: [...subcategories.values()].sort(byName),
  };
}

export function guessAccountType(name: string): AccountType {
  const n = normalizeName(name);
  if (/credito|cartao/.test(n)) return 'creditCard';
  if (/invest|corretora|tesouro|cdb/.test(n)) return 'brokerage';
  if (/poupanca|reserva|separado|cofrinho|caixinha/.test(n)) return 'savings';
  if (/dinheiro|carteira|especie/.test(n)) return 'cash';
  return 'checking';
}

/** Initial mappings: link to existing items with the same (accent/case-insensitive) name, else create. */
export function suggestMappings(source: ImportSource, accounts: Account[], categories: Category[]): Mappings {
  const accountByName = new Map(accounts.map((a) => [normalizeName(a.name), a]));
  const topLevel = categories.filter((c) => c.parentId === null);
  const categoryByName = new Map(topLevel.map((c) => [normalizeName(c.name), c]));
  const transferCategory = topLevel.find((c) => c.kind === 'transfer');

  const mappings: Mappings = { accounts: {}, categories: {}, subcategories: {} };
  for (const a of source.accounts) {
    const existing = accountByName.get(a.key);
    mappings.accounts[a.key] = existing
      ? { action: 'existing', accountId: existing.id }
      : { action: 'new', name: a.name, type: guessAccountType(a.name) };
  }
  for (const c of source.categories) {
    const existing =
      categoryByName.get(c.key) ?? (c.suggestedKind === 'transfer' ? transferCategory : undefined);
    mappings.categories[c.key] = existing
      ? { action: 'existing', categoryId: existing.id }
      : { action: 'new', name: c.name, kind: c.suggestedKind };
  }
  for (const s of source.subcategories) {
    const parent = mappings.categories[s.categoryKey];
    const existing =
      parent?.action === 'existing'
        ? categories.find(
            (c) => c.parentId === parent.categoryId && normalizeName(c.name) === normalizeName(s.name),
          )
        : undefined;
    const parentIsTransfer =
      parent?.action === 'existing'
        ? categories.find((c) => c.id === parent.categoryId)?.kind === 'transfer'
        : parent?.kind === 'transfer';
    mappings.subcategories[s.key] = parentIsTransfer
      ? { action: 'drop' }
      : existing
        ? { action: 'existing', categoryId: existing.id }
        : { action: 'new', name: s.name };
  }
  return mappings;
}

export interface ImportOptions {
  /** What to do with rows that have no category. */
  uncategorized: 'keep' | 'extraordinary';
  /** Skip rows identical (date, amount, account, description) to transactions already in the app. */
  skipDuplicates: boolean;
}

export interface ImportStats {
  imported: number;
  transfersPaired: number;
  unpairedTransfers: number;
  uncategorized: number;
  extraordinary: number;
  duplicatesSkipped: number;
  newAccounts: number;
  newCategories: number;
}

export interface ImportPlan {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  /** CSV lines of transfer rows that found no opposite leg (imported as single entries). */
  unpairedTransferLines: number[];
  stats: ImportStats;
}

export interface Existing {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
}

const duplicateKey = (date: string, amount: number, accountId: string, description: string) =>
  `${date}|${amount}|${accountId}|${normalizeName(description)}`;

export function buildImportPlan(
  rows: ValidCsvRow[],
  mappings: Mappings,
  options: ImportOptions,
  existing: Existing,
  newId: () => string,
): ImportPlan {
  // --- accounts
  const newAccounts: Account[] = [];
  const accountIdByKey = new Map<string, string>();
  let accountOrder = Math.max(-1, ...existing.accounts.map((a) => a.order)) + 1;
  for (const [key, m] of Object.entries(mappings.accounts)) {
    if (m.action === 'existing') accountIdByKey.set(key, m.accountId);
    else {
      const account: Account = {
        id: newId(),
        name: m.name.trim(),
        type: m.type,
        archived: false,
        order: accountOrder++,
        includeInTotal: true,
        creditCard: null,
      };
      newAccounts.push(account);
      accountIdByKey.set(key, account.id);
    }
  }

  // --- categories
  const newCategories: Category[] = [];
  const allCategories = () => [...existing.categories, ...newCategories];
  const categoryIdByKey = new Map<string, string>();
  let categoryOrder =
    Math.max(-1, ...existing.categories.filter((c) => c.parentId === null).map((c) => c.order)) + 1;
  for (const [key, m] of Object.entries(mappings.categories)) {
    if (m.action === 'existing') {
      categoryIdByKey.set(key, m.categoryId);
      continue;
    }
    // Two CSV names mapped to the same new name share one category.
    const same = newCategories.find(
      (c) => c.parentId === null && normalizeName(c.name) === normalizeName(m.name),
    );
    if (same) {
      categoryIdByKey.set(key, same.id);
      continue;
    }
    const category: Category = {
      id: newId(),
      name: m.name.trim(),
      kind: m.kind,
      parentId: null,
      archived: false,
      order: categoryOrder++,
    };
    newCategories.push(category);
    categoryIdByKey.set(key, category.id);
  }
  const kindOf = (id: string) => allCategories().find((c) => c.id === id)?.kind;

  // --- subcategories (created lazily, under the resolved parent)
  const subcategoryId = (row: ValidCsvRow, parentId: string): string | null => {
    if (!row.subcategory) return null;
    const m = mappings.subcategories[subcategoryKey(row.category, row.subcategory)];
    if (!m || m.action === 'drop') return null;
    if (m.action === 'existing') return m.categoryId;
    const name = m.name.trim();
    const found = allCategories().find(
      (c) => c.parentId === parentId && normalizeName(c.name) === normalizeName(name),
    );
    if (found) return found.id;
    const siblings = allCategories().filter((c) => c.parentId === parentId);
    const sub: Category = {
      id: newId(),
      name,
      kind: kindOf(parentId) ?? 'expense',
      parentId,
      archived: false,
      order: Math.max(-1, ...siblings.map((c) => c.order)) + 1,
    };
    newCategories.push(sub);
    return sub.id;
  };

  // --- transactions
  const existingKeys = new Map<string, number>();
  if (options.skipDuplicates) {
    for (const t of existing.transactions) {
      const k = duplicateKey(t.date, t.amountCents, t.accountId, t.description);
      existingKeys.set(k, (existingKeys.get(k) ?? 0) + 1);
    }
  }

  const stats: ImportStats = {
    imported: 0,
    transfersPaired: 0,
    unpairedTransfers: 0,
    uncategorized: 0,
    extraordinary: 0,
    duplicatesSkipped: 0,
    newAccounts: newAccounts.length,
    newCategories: 0,
  };
  const transactions: Transaction[] = [];
  const transferRows: { tx: Transaction; line: number }[] = [];

  for (const row of rows) {
    const accountId = accountIdByKey.get(normalizeName(row.account));
    if (!accountId) continue;
    const k = duplicateKey(row.date, row.amountCents, accountId, row.description);
    const seen = existingKeys.get(k) ?? 0;
    if (seen > 0) {
      // Multiset: a file with two identical rows where one already exists imports the other.
      existingKeys.set(k, seen - 1);
      stats.duplicatesSkipped++;
      continue;
    }
    const categoryId = row.category ? (categoryIdByKey.get(normalizeName(row.category)) ?? null) : null;
    const isTransferCategory = categoryId !== null && kindOf(categoryId) === 'transfer';
    const extraordinary =
      row.extraordinary || (categoryId === null && options.uncategorized === 'extraordinary');
    const tx: Transaction = {
      id: newId(),
      date: row.date,
      description: row.description,
      amountCents: row.amountCents,
      accountId,
      categoryId,
      subcategoryId: categoryId && !isTransferCategory ? subcategoryId(row, categoryId) : null,
      extraordinary: isTransferCategory ? false : extraordinary,
      transferId: null,
      recurringId: null,
      recurringMonth: null,
      installment: null,
      billMonth: null,
      installmentGroupId: null,
    };
    transactions.push(tx);
    if (isTransferCategory) transferRows.push({ tx, line: row.line });
    if (categoryId === null) stats.uncategorized++;
    if (tx.extraordinary) stats.extraordinary++;
  }

  // --- pair transfers: same date, same absolute value, opposite signs, different accounts
  const groups = new Map<string, { tx: Transaction; line: number }[]>();
  for (const r of transferRows) {
    const key = `${r.tx.date}|${Math.abs(r.tx.amountCents)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const unpairedTransferLines: number[] = [];
  for (const group of groups.values()) {
    const outgoing = group.filter((r) => r.tx.amountCents < 0);
    const incoming = group.filter((r) => r.tx.amountCents > 0);
    for (const out of outgoing) {
      const i = incoming.findIndex((inn) => inn.tx.accountId !== out.tx.accountId);
      if (i < 0) {
        unpairedTransferLines.push(out.line);
        continue;
      }
      const [inn] = incoming.splice(i, 1);
      const transferId = newId();
      out.tx.transferId = transferId;
      inn!.tx.transferId = transferId;
      stats.transfersPaired++;
    }
    unpairedTransferLines.push(...incoming.map((r) => r.line));
  }
  stats.unpairedTransfers = unpairedTransferLines.length;
  stats.imported = transactions.length;
  stats.newCategories = newCategories.length;

  return {
    accounts: newAccounts,
    categories: newCategories,
    transactions,
    unpairedTransferLines: unpairedTransferLines.sort((a, b) => a - b),
    stats,
  };
}
