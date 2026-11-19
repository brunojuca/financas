import type { Transaction } from '../types';
import { isTransfer, type CategoryIndex } from './summary';

export type IssueCode =
  /** Error: needs a category to count in budget and reports. */
  | 'uncategorized'
  /** Warning: extraordinary entry left uncategorized on purpose. */
  | 'uncategorizedExtraordinary'
  /** Warning: the category has subcategories but none was chosen. */
  | 'missingSubcategory';

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  transaction: Transaction;
  code: IssueCode;
  level: IssueLevel;
}

export const ISSUE_LEVEL: Record<IssueCode, IssueLevel> = {
  uncategorized: 'error',
  uncategorizedExtraordinary: 'warning',
  missingSubcategory: 'warning',
};

/** Pending items for the "Pendências" screen: errors first, newest first. Transfers are never flagged. */
export function findIssues(transactions: Transaction[], categories: CategoryIndex): Issue[] {
  const parentsWithSubs = new Set<string>();
  for (const c of categories.values()) if (c.parentId && !c.archived) parentsWithSubs.add(c.parentId);

  const issues: Issue[] = [];
  for (const t of transactions) {
    if (isTransfer(t, categories)) continue;
    let code: IssueCode | null = null;
    if (t.categoryId === null) code = t.extraordinary ? 'uncategorizedExtraordinary' : 'uncategorized';
    else if (t.subcategoryId === null && parentsWithSubs.has(t.categoryId)) code = 'missingSubcategory';
    if (code) issues.push({ transaction: t, code, level: ISSUE_LEVEL[code] });
  }
  return issues.sort((a, b) =>
    a.level !== b.level
      ? a.level === 'error'
        ? -1
        : 1
      : a.transaction.date < b.transaction.date
        ? 1
        : a.transaction.date > b.transaction.date
          ? -1
          : 0,
  );
}
