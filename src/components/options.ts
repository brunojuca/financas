import type { ComboboxItem } from '@mantine/core';
import type { Account, Category, CategoryKind } from '../domain/types';
import { t } from '../i18n/pt-BR';

/** Active accounts, plus `keepId` even if archived (so editing old entries still shows it). */
export function accountOptions(accounts: Account[], keepId?: string | null): ComboboxItem[] {
  return accounts
    .filter((a) => !a.archived || a.id === keepId)
    .map((a) => ({ value: a.id, label: a.archived ? `${a.name} (${t.common.archived})` : a.name }));
}

export function categoryOptions(
  categories: Category[],
  kind: CategoryKind | null,
  parentId: string | null,
  keepId?: string | null,
): ComboboxItem[] {
  return categories
    .filter((c) => c.parentId === parentId && (kind === null || c.kind === kind))
    .filter((c) => !c.archived || c.id === keepId)
    .map((c) => ({ value: c.id, label: c.archived ? `${c.name} (${t.common.archived})` : c.name }));
}
