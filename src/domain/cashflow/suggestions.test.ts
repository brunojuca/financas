import { describe, expect, it } from 'vitest';
import { createDefaultSeed, findTransferCategory } from '../seed';
import type { Transaction } from '../types';
import { descriptionSuggestions } from './suggestions';
import { indexCategories } from './summary';
import { buildTransfer } from './transfer';

let n = 0;
const newId = () => `s${++n}`;
const { accounts, categories } = createDefaultSeed(newId);
const [checking, savings, card] = accounts as [
  (typeof accounts)[0],
  (typeof accounts)[0],
  (typeof accounts)[0],
];
const food = categories.find((c) => c.name === 'Alimentação')!;
const market = categories.find((c) => c.parentId === food.id)!;
const salary = categories.find((c) => c.name === 'Salário' && c.parentId === null)!;
const transferCategory = findTransferCategory(categories)!;

function tx(
  date: string,
  description: string,
  amountCents: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id: newId(),
    date,
    description,
    amountCents,
    accountId: checking.id,
    categoryId: null,
    subcategoryId: null,
    extraordinary: false,
    transferId: null,
    recurringId: null,
    recurringMonth: null,
    installment: null,
    ...extra,
  };
}

describe('descriptionSuggestions', () => {
  const transactions = [
    tx('2026-09-01', 'Mercado', -1000, { categoryId: food.id }),
    tx('2026-10-01', 'mercado', -2000, { categoryId: food.id, subcategoryId: market.id, accountId: card.id }),
    tx('2026-10-05', 'Salário', 500000, { categoryId: salary.id }),
    tx('2026-10-06', 'Venda da moto', 900000),
    tx('2026-01-01', 'Saldo inicial', 10000, { categoryId: transferCategory.id }),
    ...buildTransfer(
      {
        date: '2026-10-10',
        description: 'Guardar',
        amountCents: 3000,
        fromAccountId: checking.id,
        toAccountId: savings.id,
        transferCategoryId: transferCategory.id,
      },
      newId,
    ),
  ];
  const index = indexCategories(categories);
  const all = new Set(accounts.map((a) => a.id));
  const suggestions = descriptionSuggestions(transactions, index, all);

  it('keeps one suggestion per description, newest first', () => {
    expect(suggestions.map((s) => s.description)).toEqual(['Guardar', 'Venda da moto', 'Salário', 'mercado']);
    expect(suggestions[3]).toEqual({
      description: 'mercado',
      mode: 'expense',
      accountId: card.id,
      toAccountId: null,
      categoryId: food.id,
      subcategoryId: market.id,
    });
  });

  it('fills the fields from the most frequent combination, ties going to the latest', () => {
    const repeated = [
      ...transactions,
      tx('2026-08-01', 'Mercado', -500, { categoryId: food.id }),
      tx('2026-07-01', 'MERCADO', -500, { categoryId: food.id }),
    ];
    // Checking + Alimentação (no sub) now appears 3 times vs once on the card.
    expect(descriptionSuggestions(repeated, index, all).find((s) => s.mode === 'expense')).toEqual({
      description: 'Mercado',
      mode: 'expense',
      accountId: checking.id,
      toAccountId: null,
      categoryId: food.id,
      subcategoryId: null,
    });
  });

  it('suggests transfers with both accounts and uncategorized entries by their sign', () => {
    expect(suggestions[0]).toMatchObject({
      mode: 'transfer',
      accountId: checking.id,
      toAccountId: savings.id,
    });
    expect(suggestions[1]).toMatchObject({ mode: 'income', categoryId: null });
    expect(suggestions[2]).toMatchObject({ mode: 'income', categoryId: salary.id });
  });

  it('skips archived accounts and categories', () => {
    const archived = indexCategories(
      categories.map((c) => (c.id === market.id ? { ...c, archived: true } : c)),
    );
    const withoutCard = new Set([checking.id, savings.id]);
    const result = descriptionSuggestions(transactions, archived, withoutCard);
    // Latest "mercado" is on the archived card; the older one on checking is used instead.
    expect(result.find((s) => s.description.toLowerCase() === 'mercado')).toMatchObject({
      description: 'Mercado',
      accountId: checking.id,
      subcategoryId: null,
    });
  });
});
