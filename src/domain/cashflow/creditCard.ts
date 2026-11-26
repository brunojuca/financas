import { addMonths, dateInMonth, monthOf } from '../dates';
import type { CardSettings, Cents, IsoDate, Transaction, YearMonth } from '../types';
import { isTransfer, type CategoryIndex } from './summary';

/**
 * Credit-card bills. A bill is named by its **due month** ("fatura de dezembro" = due in December), like bank apps.
 * Bill M closes on `closingDay` of M (when the due day comes after the closing day) or of M − 1 (when it comes
 * before, e.g. closes on the 28th, due on the 5th), and is due on `dueDay` of M. A purchase belongs to the first
 * bill that closes after it: purchases on the closing day itself go to the next bill.
 */

export function dueDate(card: CardSettings, bill: YearMonth): IsoDate {
  return dateInMonth(bill, card.dueDay);
}

export function closingDate(card: CardSettings, bill: YearMonth): IsoDate {
  return dateInMonth(card.dueDay > card.closingDay ? bill : addMonths(bill, -1), card.closingDay);
}

/** The bill a purchase made on `date` goes to. */
export function billForPurchase(card: CardSettings, date: IsoDate): YearMonth {
  let bill = addMonths(monthOf(date), -1);
  while (date >= closingDate(card, bill)) bill = addMonths(bill, 1);
  return bill;
}

/** The bill a payment made on `date` pays by default: the latest bill already closed on that date. */
export function billForPayment(card: CardSettings, date: IsoDate): YearMonth {
  let bill = addMonths(monthOf(date), 2);
  while (closingDate(card, bill) > date) bill = addMonths(bill, -1);
  return bill;
}

/** A payment of the bill: a transfer (or transfer-category entry) bringing money into the card. */
export function isCardPayment(tx: Transaction, categories: CategoryIndex): boolean {
  return tx.amountCents > 0 && isTransfer(tx, categories);
}

/** The bill an entry on a card goes to when the user did not choose one. */
export function defaultBill(card: CardSettings, tx: Transaction, categories: CategoryIndex): YearMonth {
  return isCardPayment(tx, categories) ? billForPayment(card, tx.date) : billForPurchase(card, tx.date);
}

/** The bill of an entry: the one stored, or the default by date. */
export function billOf(card: CardSettings, tx: Transaction, categories: CategoryIndex): YearMonth {
  return tx.billMonth ?? defaultBill(card, tx, categories);
}

export type BillStatus = 'open' | 'closed' | 'paid' | 'partial' | 'overdue';

/** One bill, like the bank's statement. All amounts positive except `remaining`, which can be negative (credit). */
export interface BillStatement {
  month: YearMonth;
  closing: IsoDate;
  due: IsoDate;
  /** Unpaid balance carried from the previous bill (negative = credit left over). */
  previous: Cents;
  /** Purchases minus refunds assigned to this bill. */
  purchases: Cents;
  /** Payments assigned to this bill. */
  payments: Cents;
  /** previous + purchases: what the bill asks for. */
  total: Cents;
  /** total − payments: carried to the next bill. */
  remaining: Cents;
  status: BillStatus;
  transactions: Transaction[];
}

/**
 * Statements of every bill of a card, oldest first, from the first bill with entries up to `until` (default: the
 * last bill with entries). Partial payments leave `remaining`, which becomes the next bill's `previous`.
 */
export function billStatements(
  card: CardSettings,
  cardTransactions: Transaction[],
  categories: CategoryIndex,
  today: IsoDate,
  until?: YearMonth,
): BillStatement[] {
  const byBill = new Map<YearMonth, Transaction[]>();
  for (const tx of cardTransactions) {
    const bill = billOf(card, tx, categories);
    byBill.set(bill, [...(byBill.get(bill) ?? []), tx]);
  }
  const months = [...byBill.keys()].sort();
  if (months.length === 0) return [];
  const last = until && until > months[months.length - 1]! ? until : months[months.length - 1]!;
  const statements: BillStatement[] = [];
  let previous = 0;
  for (let month = months[0]!; month <= last; month = addMonths(month, 1)) {
    const txs = byBill.get(month) ?? [];
    let purchases = 0;
    let payments = 0;
    for (const tx of txs) {
      if (isCardPayment(tx, categories)) payments += tx.amountCents;
      else purchases -= tx.amountCents;
    }
    const total = previous + purchases;
    const remaining = total - payments;
    const closing = closingDate(card, month);
    const due = dueDate(card, month);
    const status: BillStatus =
      today < closing
        ? 'open'
        : remaining <= 0
          ? 'paid'
          : today > due
            ? payments > 0
              ? 'partial'
              : 'overdue'
            : payments > 0
              ? 'partial'
              : 'closed';
    statements.push({
      month,
      closing,
      due,
      previous,
      purchases,
      payments,
      total,
      remaining,
      status,
      transactions: txs.sort((a, b) => (a.date < b.date ? -1 : 1)),
    });
    previous = remaining;
  }
  return statements;
}

/** The bill open for purchases today. */
export function currentBill(card: CardSettings, today: IsoDate): YearMonth {
  return billForPurchase(card, today);
}

/** Limit used: what is owed on the card, including future installments (all entries, any date). */
export function limitUsed(cardTransactions: Transaction[]): Cents {
  return -cardTransactions.reduce((s, t) => s + t.amountCents, 0);
}

// ---------- installments ("compra parcelada") ----------

/** Splits a purchase into equal installments; the first one takes the cents that do not divide evenly. */
export function splitInstallments(totalCents: Cents, count: number): Cents[] {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => (i === 0 ? totalCents - base * (count - 1) : base));
}

export interface InstallmentPurchase {
  date: IsoDate;
  description: string;
  accountId: string;
  categoryId: string | null;
  subcategoryId: string | null;
  /** Positive amount of each installment, in order. */
  amounts: Cents[];
  /** Bill of the first installment; each next one goes to the following bill. */
  firstBill: YearMonth;
}

/** One entry per installment, all dated on the purchase date, on consecutive bills, sharing a group id. */
export function buildInstallments(input: InstallmentPurchase, newId: () => string): Transaction[] {
  const groupId = newId();
  const total = input.amounts.length;
  return input.amounts.map((amount, i) => ({
    id: newId(),
    date: input.date,
    description: `${input.description} (${i + 1}/${total})`,
    amountCents: -Math.abs(amount),
    accountId: input.accountId,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    extraordinary: false,
    transferId: null,
    recurringId: null,
    recurringMonth: null,
    installment: { number: i + 1, total },
    billMonth: addMonths(input.firstBill, i),
    installmentGroupId: groupId,
  }));
}

/** Which date card purchases count on in monthly reports (setting). */
export type CardReportMode = 'bill' | 'purchase';

/**
 * Entries as they count in monthly reports — budget, income/expense, category charts, the Lançamentos month and the
 * total-balance history. Purchases (and refunds) on a configured credit card count:
 * - `bill`: on their bill's due date (installments therefore each in their own bill's month) — when the money goes out;
 * - `purchase`: on the purchase date; installment n of a purchase counts n − 1 months later, on the same day of the
 *   month (clamped to short months) — the spending as you make it, whenever the bill is paid.
 * Bill payments and every other entry keep their date. Account balances and the card limit never use this.
 */
export function reportView(
  transactions: Transaction[],
  cards: ReadonlyMap<string, CardSettings>,
  categories: CategoryIndex,
  mode: CardReportMode,
): Transaction[] {
  if (mode === 'purchase') {
    return transactions.map((t) =>
      t.installmentGroupId && t.installment && t.installment.number > 1
        ? {
            ...t,
            date: dateInMonth(
              addMonths(monthOf(t.date), t.installment.number - 1),
              Number(t.date.slice(8, 10)),
            ),
          }
        : t,
    );
  }
  if (cards.size === 0) return transactions;
  return transactions.map((t) => {
    const card = cards.get(t.accountId);
    if (!card || isCardPayment(t, categories)) return t;
    return { ...t, date: dueDate(card, billOf(card, t, categories)) };
  });
}
