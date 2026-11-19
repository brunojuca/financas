import { normalizeName } from '../import/csv';
import type { Transaction } from '../types';
import type { CategoryIndex } from './summary';

/** What a past entry with the same description had, used to pre-fill a new one. */
export interface DescriptionSuggestion {
  description: string;
  mode: 'expense' | 'income' | 'transfer';
  accountId: string;
  /** Destination account, for transfers. */
  toAccountId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
}

/**
 * One suggestion per distinct description (accent/case-insensitive). When the same description was
 * used with different fields, the most frequent combination of mode, accounts, category and
 * subcategory wins; ties go to the most recent. Suggestions are sorted by last use, newest first.
 * Single-leg entries in the transfer category (opening balances) are skipped, and so are links to
 * archived accounts or categories.
 */
export function descriptionSuggestions(
  transactions: Transaction[],
  categories: CategoryIndex,
  activeAccountIds: ReadonlySet<string>,
): DescriptionSuggestion[] {
  const legs = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (tx.transferId) legs.set(tx.transferId, [...(legs.get(tx.transferId) ?? []), tx]);
  }
  const active = (id: string | null) => (id && categories.get(id)?.archived === false ? id : null);
  const account = (id: string | undefined) => (id && activeAccountIds.has(id) ? id : null);

  const toSuggestion = (tx: Transaction): DescriptionSuggestion | null => {
    const from = account(tx.accountId);
    if (!from) return null;
    if (tx.transferId) {
      if (tx.amountCents > 0) return null; // described once, from the outgoing leg
      const to = legs.get(tx.transferId)?.find((l) => l.id !== tx.id);
      return {
        description: tx.description,
        mode: 'transfer',
        accountId: from,
        toAccountId: account(to?.accountId),
        categoryId: null,
        subcategoryId: null,
      };
    }
    const kind = tx.categoryId ? categories.get(tx.categoryId)?.kind : undefined;
    if (kind === 'transfer') return null;
    const categoryId = active(tx.categoryId);
    return {
      description: tx.description,
      mode: kind ?? (tx.amountCents > 0 ? 'income' : 'expense'),
      accountId: from,
      toAccountId: null,
      categoryId,
      subcategoryId: categoryId ? active(tx.subcategoryId) : null,
    };
  };

  interface Combo {
    suggestion: DescriptionSuggestion;
    count: number;
  }
  // Newest first, so the first entry seen of each combination is its latest use.
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const groups = new Map<string, Map<string, Combo>>(); // description → combination → count
  for (const tx of sorted) {
    const key = normalizeName(tx.description);
    if (!key) continue;
    const suggestion = toSuggestion(tx);
    if (!suggestion) continue;
    const combos = groups.get(key) ?? new Map<string, Combo>();
    groups.set(key, combos);
    const { mode, accountId, toAccountId, categoryId, subcategoryId } = suggestion;
    const comboKey = [mode, accountId, toAccountId, categoryId, subcategoryId].join('|');
    const combo = combos.get(comboKey);
    if (combo) combo.count++;
    else combos.set(comboKey, { suggestion, count: 1 });
  }

  // Map iteration keeps insertion order: groups by latest use, combos by latest use within a group.
  return [...groups.values()].map((combos) => {
    let best: Combo | null = null;
    for (const combo of combos.values()) if (!best || combo.count > best.count) best = combo;
    return best!.suggestion;
  });
}
