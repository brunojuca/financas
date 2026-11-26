/** Calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;
/** Month as `YYYY-MM`. */
export type YearMonth = string;
/** Integer amount in centavos. */
export type Cents = number;

export type AccountType = 'checking' | 'savings' | 'creditCard' | 'cash' | 'brokerage';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  archived: boolean;
  order: number;
  /** Counted in "Saldo total" (and its history chart). Off for e.g. a brokerage account tracked in Investimentos. */
  includeInTotal: boolean;
  /** Credit-card settings (type `creditCard` only); null until the user sets them. */
  creditCard: CardSettings | null;
}

export interface CardSettings {
  /** Day of the month the bill closes (1–31, clamped to short months). */
  closingDay: number;
  /** Day of the month the bill is due (1–31). */
  dueDay: number;
  /** Credit limit, when known. */
  limitCents: Cents | null;
  /** Account that usually pays the bill (pre-filled in "Pagar fatura"). */
  payingAccountId: string | null;
}

export type CategoryKind = 'income' | 'expense' | 'transfer';

/** A category (parentId = null) or a subcategory (parentId = its category). */
export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  archived: boolean;
  order: number;
}

export interface Installment {
  number: number;
  total: number;
}

export interface Transaction {
  id: string;
  date: IsoDate;
  description: string;
  /** Signed: positive = inflow, negative = outflow. */
  amountCents: Cents;
  accountId: string;
  /** null = not categorized yet (shown as a pending issue). */
  categoryId: string | null;
  subcategoryId: string | null;
  /**
   * Outlier (big sale, big purchase…): counts in account balances but not in budget,
   * monthly income/expense totals or category charts. May stay uncategorized.
   */
  extraordinary: boolean;
  /** Shared by the two legs of a transfer between own accounts. */
  transferId: string | null;
  /** Set when generated from a recurring template. */
  recurringId: string | null;
  recurringMonth: YearMonth | null;
  installment: Installment | null;
  /** Credit-card entries: the bill (by due month) this purchase or payment belongs to. null elsewhere. */
  billMonth: YearMonth | null;
  /** Shared by the installments of one purchase split on a credit card ("parcelada"). */
  installmentGroupId: string | null;
}

export interface Budget {
  /** `${month}:${categoryId}` */
  id: string;
  month: YearMonth;
  categoryId: string;
  /** Positive; sign comes from the category kind. */
  amountCents: Cents;
}

export interface RecurringTemplate {
  id: string;
  description: string;
  /** Positive; sign comes from the category kind. */
  amountCents: Cents;
  accountId: string;
  categoryId: string;
  subcategoryId: string | null;
  /** 1–31; clamped to the last day of short months. */
  dayOfMonth: number;
  startMonth: YearMonth;
  /** Last month (inclusive); with `installments`, an earlier stop ("este e os próximos" deleted). null = no end. */
  endMonth: YearMonth | null;
  /** Number of installments, or null for an ongoing fixed entry. */
  installments: number | null;
  active: boolean;
  /** Months that produce nothing (the user deleted that month's entry). */
  skippedMonths: YearMonth[];
}

export interface MetaEntry {
  key: string;
  value: string;
}
