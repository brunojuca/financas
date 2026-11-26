import { describe, expect, it } from 'vitest';
import { createDefaultSeed, findTransferCategory } from '../seed';
import type { CardSettings, Transaction } from '../types';
import {
  billForPayment,
  billForPurchase,
  billStatements,
  buildInstallments,
  closingDate,
  dueDate,
  limitUsed,
  reportView,
  splitInstallments,
} from './creditCard';
import { indexCategories } from './summary';
import { buildTransfer } from './transfer';

let n = 0;
const newId = () => `c${++n}`;
const { accounts, categories } = createDefaultSeed(newId);
const index = indexCategories(categories);
const checking = accounts.find((a) => a.type === 'checking')!;
const cardAccount = accounts.find((a) => a.type === 'creditCard')!;
const food = categories.find((c) => c.name === 'Alimentação')!;
const transferCategory = findTransferCategory(categories)!;

// Closes on the 3rd, due on the 10th (same month).
const card: CardSettings = { closingDay: 3, dueDay: 10, limitCents: 500_000, payingAccountId: checking.id };
// Closes on the 28th, due on the 5th of the next month.
const lateClose: CardSettings = { closingDay: 28, dueDay: 5, limitCents: null, payingAccountId: null };

const purchase = (date: string, cents: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: newId(),
  date,
  description: 'Compra',
  amountCents: -cents,
  accountId: cardAccount.id,
  categoryId: food.id,
  subcategoryId: null,
  extraordinary: false,
  transferId: null,
  recurringId: null,
  recurringMonth: null,
  installment: null,
  billMonth: null,
  installmentGroupId: null,
  ...extra,
});
const payment = (date: string, cents: number) =>
  buildTransfer(
    {
      date,
      description: 'Pagamento fatura',
      amountCents: cents,
      fromAccountId: checking.id,
      toAccountId: cardAccount.id,
      transferCategoryId: transferCategory.id,
    },
    newId,
  )[1];

describe('bill dates (named by due month)', () => {
  it('closes in the due month when the due day comes after the closing day', () => {
    expect(closingDate(card, '2026-12')).toBe('2026-12-03');
    expect(dueDate(card, '2026-12')).toBe('2026-12-10');
  });

  it('closes in the previous month when the due day comes first', () => {
    expect(closingDate(lateClose, '2026-12')).toBe('2026-11-28');
    expect(dueDate(lateClose, '2026-12')).toBe('2026-12-05');
  });

  it('clamps days to short months', () => {
    const endOfMonth: CardSettings = { ...card, closingDay: 31, dueDay: 10 };
    expect(closingDate(endOfMonth, '2027-03')).toBe('2027-02-28');
  });
});

describe('which bill', () => {
  it('puts purchases in the next bill to close; the closing day itself goes to the following one', () => {
    expect(billForPurchase(card, '2026-11-20')).toBe('2026-12');
    expect(billForPurchase(card, '2026-12-02')).toBe('2026-12');
    expect(billForPurchase(card, '2026-12-03')).toBe('2027-01');
    expect(billForPurchase(lateClose, '2026-11-27')).toBe('2026-12');
    expect(billForPurchase(lateClose, '2026-11-28')).toBe('2027-01');
  });

  it('assigns a payment to the latest bill already closed', () => {
    expect(billForPayment(card, '2026-12-08')).toBe('2026-12');
    expect(billForPayment(card, '2026-12-03')).toBe('2026-12');
    expect(billForPayment(card, '2026-12-02')).toBe('2026-11');
    expect(billForPayment(lateClose, '2026-12-04')).toBe('2026-12');
  });
});

describe('billStatements', () => {
  const txs = [
    purchase('2026-11-10', 10_000),
    purchase('2026-11-20', 5_000),
    payment('2026-12-08', 12_000),
    purchase('2026-12-15', 3_000),
    purchase('2026-11-25', 2_000, { billMonth: '2027-01' }), // moved by hand to the next bill
  ];
  const statements = billStatements(card, txs, index, '2026-12-20');

  it('sums purchases and payments per bill and carries what was not paid', () => {
    expect(statements.map((s) => s.month)).toEqual(['2026-12', '2027-01']);
    expect(statements[0]).toMatchObject({
      previous: 0,
      purchases: 15_000,
      payments: 12_000,
      total: 15_000,
      remaining: 3_000,
      status: 'partial',
    });
    expect(statements[1]).toMatchObject({ previous: 3_000, purchases: 5_000, total: 8_000, status: 'open' });
  });

  it('reports paid, closed and overdue bills', () => {
    const paid = billStatements(
      card,
      [purchase('2026-11-10', 10_000), payment('2026-12-08', 10_000)],
      index,
      '2026-12-20',
    );
    expect(paid[0]!.status).toBe('paid');
    const closed = billStatements(card, [purchase('2026-11-10', 10_000)], index, '2026-12-05');
    expect(closed[0]!.status).toBe('closed');
    const overdue = billStatements(card, [purchase('2026-11-10', 10_000)], index, '2026-12-11');
    expect(overdue[0]!.status).toBe('overdue');
  });

  it('counts the limit used over everything owed', () => {
    expect(limitUsed(txs)).toBe(10_000 + 5_000 - 12_000 + 3_000 + 2_000);
  });
});

describe('installments', () => {
  it('gives the first installment the cents that do not divide evenly', () => {
    expect(splitInstallments(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(splitInstallments(100, 3)).toEqual([34, 33, 33]);
    expect(splitInstallments(9_000, 3)).toEqual([3_000, 3_000, 3_000]);
  });

  const parcelsInput = {
    date: '2026-11-20',
    description: 'Notebook',
    accountId: cardAccount.id,
    categoryId: food.id,
    subcategoryId: null,
    amounts: [3_334, 3_333, 3_333],
    firstBill: '2026-12',
  };
  const parcels = buildInstallments(parcelsInput, newId);

  it('creates one entry per installment on consecutive bills, all dated on the purchase', () => {
    expect(parcels.map((p) => [p.description, p.amountCents, p.billMonth, p.date])).toEqual([
      ['Notebook (1/3)', -3_334, '2026-12', '2026-11-20'],
      ['Notebook (2/3)', -3_333, '2027-01', '2026-11-20'],
      ['Notebook (3/3)', -3_333, '2027-02', '2026-11-20'],
    ]);
    expect(new Set(parcels.map((p) => p.installmentGroupId)).size).toBe(1);
    expect(limitUsed(parcels)).toBe(10_000); // the whole purchase takes the limit at once
  });

  it('counts card purchases on their bill due date, or on the purchase date, as chosen', () => {
    const cards = new Map([[cardAccount.id, card]]);
    const single = purchase('2026-11-25', 5_000);
    const pay = payment('2026-12-08', 5_000);
    const all = [...parcels, single, pay];
    // By bill: due dates of dez/26, jan/27, fev/27 (due on the 10th); the one-off purchase on its December bill.
    expect(reportView(all, cards, index, 'bill').map((p) => p.date)).toEqual([
      '2026-12-10',
      '2027-01-10',
      '2027-02-10',
      '2026-12-10',
      '2026-12-08', // payments keep their date
    ]);
    // By purchase: installment n on the purchase day, n − 1 months later; one-off purchases on their date.
    expect(reportView(all, cards, index, 'purchase').map((p) => p.date)).toEqual([
      '2026-11-20',
      '2026-12-20',
      '2027-01-20',
      '2026-11-25',
      '2026-12-08',
    ]);
    // Day 31 in a short month: the last day of that month.
    const late = buildInstallments({ ...parcelsInput, date: '2027-01-31', amounts: [1_000, 1_000] }, newId);
    expect(reportView(late, cards, index, 'purchase').map((p) => p.date)).toEqual([
      '2027-01-31',
      '2027-02-28',
    ]);
    // Cards without settings and other accounts are left alone.
    expect(reportView(all, new Map(), index, 'bill')).toBe(all);
  });
});
