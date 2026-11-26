import type { Cents, IsoDate, Transaction, YearMonth } from '../types';

export interface TransferInput {
  date: IsoDate;
  description: string;
  /** Positive amount moved. */
  amountCents: Cents;
  fromAccountId: string;
  toAccountId: string;
  transferCategoryId: string;
  /** Reuse when editing an existing transfer. */
  transferId?: string;
  /** Bill of each leg when it is a credit card (e.g. the bill a payment pays). */
  billMonths?: { from?: YearMonth | null; to?: YearMonth | null };
  legIds?: [string, string];
}

/** Both legs of a transfer between own accounts: −X in the source, +X in the destination. */
export function buildTransfer(input: TransferInput, newId: () => string): [Transaction, Transaction] {
  if (input.fromAccountId === input.toAccountId) throw new Error('Transfer accounts must differ');
  const amount = Math.abs(input.amountCents);
  const transferId = input.transferId ?? newId();
  const base = {
    date: input.date,
    description: input.description,
    categoryId: input.transferCategoryId,
    subcategoryId: null,
    extraordinary: false,
    transferId,
    recurringId: null,
    recurringMonth: null,
    installment: null,
    billMonth: null,
    installmentGroupId: null,
  };
  return [
    {
      ...base,
      id: input.legIds?.[0] ?? newId(),
      accountId: input.fromAccountId,
      amountCents: -amount,
      billMonth: input.billMonths?.from ?? null,
    },
    {
      ...base,
      id: input.legIds?.[1] ?? newId(),
      accountId: input.toAccountId,
      amountCents: amount,
      billMonth: input.billMonths?.to ?? null,
    },
  ];
}
