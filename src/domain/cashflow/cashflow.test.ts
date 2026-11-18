import { describe, expect, it } from 'vitest';
import { createDefaultSeed, findTransferCategory } from '../seed';
import type { Budget, RecurringTemplate, Transaction } from '../types';
import { budgetId, budgetReport } from './budget';
import { generateRecurring, isDueIn } from './recurring';
import {
  accountBalances,
  balanceHistory,
  expensesByCategory,
  indexCategories,
  monthlySeries,
  monthTotals,
} from './summary';
import { buildTransfer } from './transfer';

let counter = 0;
const newId = () => `id${++counter}`;

const { accounts, categories } = createDefaultSeed(newId);
const index = indexCategories(categories);
const top = (name: string) => categories.find((c) => c.parentId === null && c.name === name)!;
const [checking, savings, card] = accounts as [
  (typeof accounts)[0],
  (typeof accounts)[0],
  (typeof accounts)[0],
];
const transferCategory = findTransferCategory(categories)!;

function tx(date: string, amountCents: number, accountId: string, category: string): Transaction {
  return {
    id: newId(),
    date,
    description: category,
    amountCents,
    accountId,
    categoryId: top(category).id,
    subcategoryId: null,
    transferId: null,
    recurringId: null,
    recurringMonth: null,
    installment: null,
  };
}

const transfer = buildTransfer(
  {
    date: '2026-10-08',
    description: 'Fatura',
    amountCents: 30000,
    fromAccountId: checking.id,
    toAccountId: card.id,
    transferCategoryId: transferCategory.id,
  },
  newId,
);

const transactions: Transaction[] = [
  tx('2026-09-30', 100000, checking.id, 'Salário'),
  tx('2026-10-05', 500000, checking.id, 'Salário'),
  tx('2026-10-10', -45000, card.id, 'Alimentação'),
  tx('2026-10-31', -25000, card.id, 'Alimentação'),
  tx('2026-10-15', 5000, card.id, 'Alimentação'), // refund
  tx('2026-10-20', -9500, card.id, 'Pagamentos'),
  tx('2026-11-01', -10000, card.id, 'Lazer'),
  ...transfer,
];

describe('transfers', () => {
  it('creates two opposite legs with a shared id', () => {
    const [out, inn] = transfer;
    expect(out.amountCents).toBe(-30000);
    expect(inn.amountCents).toBe(30000);
    expect(out.transferId).toBe(inn.transferId);
    expect(out.accountId).toBe(checking.id);
    expect(inn.accountId).toBe(card.id);
  });

  it('rejects same-account transfers', () => {
    expect(() =>
      buildTransfer(
        {
          date: '2026-10-08',
          description: '',
          amountCents: 1,
          fromAccountId: checking.id,
          toAccountId: checking.id,
          transferCategoryId: transferCategory.id,
        },
        newId,
      ),
    ).toThrow();
  });
});

describe('summary', () => {
  it('computes balances per account (spreadsheet Contas)', () => {
    const balances = accountBalances(transactions);
    expect(balances.get(checking.id)).toBe(100000 + 500000 - 30000);
    expect(balances.get(card.id)).toBe(-45000 - 25000 + 5000 - 9500 - 10000 + 30000);
    expect(balances.get(savings.id)).toBeUndefined();
  });

  it('excludes transfers from month totals and nets refunds', () => {
    expect(monthTotals(transactions, index, '2026-10')).toEqual({
      income: 500000,
      expense: 45000 + 25000 - 5000 + 9500,
      net: 500000 - 74500,
    });
  });

  it('builds a monthly series', () => {
    const series = monthlySeries(transactions, index, ['2026-09', '2026-10', '2026-11']);
    expect(series.map((p) => p.income)).toEqual([100000, 500000, 0]);
    expect(series.map((p) => p.expense)).toEqual([0, 74500, 10000]);
  });

  it('groups expenses by category, largest first', () => {
    expect(expensesByCategory(transactions, index, '2026-10')).toEqual([
      { categoryId: top('Alimentação').id, amount: 65000 },
      { categoryId: top('Pagamentos').id, amount: 9500 },
    ]);
  });

  it('tracks total balance at each month end', () => {
    expect(balanceHistory(transactions, ['2026-09', '2026-10', '2026-11'])).toEqual([
      { month: '2026-09', balance: 100000 },
      { month: '2026-10', balance: 100000 + 500000 - 74500 },
      { month: '2026-11', balance: 100000 + 500000 - 74500 - 10000 },
    ]);
  });
});

describe('budget (spreadsheet Orçamento)', () => {
  const budgets: Budget[] = [
    {
      id: budgetId('2026-10', top('Salário').id),
      month: '2026-10',
      categoryId: top('Salário').id,
      amountCents: 500000,
    },
    {
      id: budgetId('2026-10', top('Alimentação').id),
      month: '2026-10',
      categoryId: top('Alimentação').id,
      amountCents: 70000,
    },
    {
      id: budgetId('2026-10', top('Lazer').id),
      month: '2026-10',
      categoryId: top('Lazer').id,
      amountCents: 50000,
    },
  ];
  const report = budgetReport('2026-10', categories, index, budgets, transactions);
  const row = (name: string) => report.rows.find((r) => r.category.name === name)!;

  it('signs budgets like transactions and diff = actual − budget', () => {
    expect(row('Alimentação')).toMatchObject({ budget: -70000, actual: -65000, difference: 5000 });
    expect(row('Lazer')).toMatchObject({ budget: -50000, actual: 0, difference: 50000, usage: 0 });
    expect(row('Salário')).toMatchObject({ budget: 500000, actual: 500000, difference: 0, usage: 1 });
    expect(row('Roupas')).toMatchObject({ budget: 0, actual: 0, usage: null });
  });

  it('never lists transfers, includes month boundaries, and totals rows', () => {
    expect(report.rows.some((r) => r.category.kind === 'transfer')).toBe(false);
    expect(report.rows[0]!.category.kind).toBe('income');
    expect(report.total.budget).toBe(500000 - 70000 - 50000);
    expect(report.total.actual).toBe(500000 - 74500);
    expect(report.total.difference).toBe(report.total.actual - report.total.budget);
  });
});

describe('recurring', () => {
  const rent: RecurringTemplate = {
    id: 'rent',
    description: 'Aluguel',
    amountCents: 180000,
    accountId: checking.id,
    categoryId: top('Moradia').id,
    subcategoryId: null,
    dayOfMonth: 31,
    startMonth: '2026-01',
    endMonth: null,
    installments: null,
    active: true,
  };
  const laptop: RecurringTemplate = {
    ...rent,
    id: 'laptop',
    description: 'Notebook',
    amountCents: 40000,
    accountId: card.id,
    categoryId: top('Educação').id,
    dayOfMonth: 20,
    startMonth: '2026-09',
    installments: 3,
  };
  const salary: RecurringTemplate = {
    ...rent,
    id: 'salary',
    description: 'Salário',
    amountCents: 500000,
    categoryId: top('Salário').id,
    dayOfMonth: 5,
    endMonth: '2026-10',
  };

  it('knows when a template is due', () => {
    expect(isDueIn(laptop, '2026-08')).toBe(false);
    expect(isDueIn(laptop, '2026-11')).toBe(true);
    expect(isDueIn(laptop, '2026-12')).toBe(false);
    expect(isDueIn(salary, '2026-11')).toBe(false);
    expect(isDueIn({ ...rent, active: false }, '2026-11')).toBe(false);
  });

  it('generates signed entries with clamped dates and installment numbers', () => {
    const generated = generateRecurring([rent, laptop, salary], [], index, '2026-11', newId);
    expect(generated).toHaveLength(2);
    expect(generated[0]).toMatchObject({
      date: '2026-11-30',
      amountCents: -180000,
      recurringMonth: '2026-11',
    });
    expect(generated[1]).toMatchObject({
      description: 'Notebook (3/3)',
      amountCents: -40000,
      installment: { number: 3, total: 3 },
    });
  });

  it('is idempotent per month', () => {
    const first = generateRecurring([rent, salary], [], index, '2026-10', newId);
    expect(first.find((t) => t.recurringId === 'salary')?.amountCents).toBe(500000);
    expect(generateRecurring([rent, salary], first, index, '2026-10', newId)).toEqual([]);
  });
});
