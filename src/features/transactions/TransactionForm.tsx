import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { accountOptions, categoryOptions } from '../../components/options';
import { isIsoDate } from '../../domain/dates';
import { fromCents, signedAmount, toCents } from '../../domain/money';
import { findTransferCategory } from '../../domain/seed';
import type { IsoDate, Transaction } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { deleteTransaction, newId, saveTransaction, saveTransfer } from '../../storage/repo';
import type { FinanceData } from '../../storage/useFinanceData';

/** `adjustment` = single-leg entry in the transfer category (e.g. opening balance); only reachable by editing. */
type Mode = 'expense' | 'income' | 'transfer' | 'adjustment';

interface Values {
  mode: Mode;
  date: IsoDate;
  description: string;
  amount: number | string;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  refund: boolean;
}

function initialValues(data: FinanceData, editing: Transaction | null, defaultDate: IsoDate): Values {
  const firstAccount = data.accounts.find((a) => !a.archived)?.id ?? null;
  if (!editing) {
    return {
      mode: 'expense',
      date: defaultDate,
      description: '',
      amount: '',
      accountId: firstAccount,
      toAccountId: null,
      categoryId: null,
      subcategoryId: null,
      refund: false,
    };
  }
  if (editing.transferId) {
    const legs = data.transactions.filter((x) => x.transferId === editing.transferId);
    const from = legs.find((x) => x.amountCents < 0) ?? editing;
    const to = legs.find((x) => x.amountCents > 0);
    return {
      mode: 'transfer',
      date: editing.date,
      description: editing.description,
      amount: fromCents(Math.abs(editing.amountCents)),
      accountId: from.accountId,
      toAccountId: to?.accountId ?? null,
      categoryId: null,
      subcategoryId: null,
      refund: false,
    };
  }
  const kind = data.categoryIndex.get(editing.categoryId)?.kind ?? 'expense';
  if (kind === 'transfer') {
    return {
      mode: 'adjustment',
      date: editing.date,
      description: editing.description,
      amount: fromCents(editing.amountCents),
      accountId: editing.accountId,
      toAccountId: null,
      categoryId: editing.categoryId,
      subcategoryId: null,
      refund: false,
    };
  }
  return {
    mode: kind,
    date: editing.date,
    description: editing.description,
    amount: fromCents(Math.abs(editing.amountCents)),
    accountId: editing.accountId,
    toAccountId: null,
    categoryId: editing.categoryId,
    subcategoryId: editing.subcategoryId,
    refund: signedAmount(kind, 1) * editing.amountCents < 0,
  };
}

interface Props {
  data: FinanceData;
  editing: Transaction | null;
  defaultDate: IsoDate;
  onDone: () => void;
}

export function TransactionForm({ data, editing, defaultDate, onDone }: Props) {
  const form = useForm<Values>({
    initialValues: initialValues(data, editing, defaultDate),
    validate: {
      date: (v) => (isIsoDate(v) ? null : t.common.required),
      amount: (v, values) =>
        typeof v !== 'number' || (values.mode === 'adjustment' ? v === 0 : v <= 0)
          ? t.transactions.amountPositive
          : null,
      accountId: (v) => (v ? null : t.common.required),
      toAccountId: (v, values) =>
        values.mode !== 'transfer'
          ? null
          : !v
            ? t.common.required
            : v === values.accountId
              ? t.transactions.sameAccount
              : null,
      categoryId: (v, values) =>
        values.mode === 'transfer' || values.mode === 'adjustment' || v ? null : t.common.required,
    },
  });
  const { mode, categoryId } = form.getValues();
  form.watch('mode', () => form.setFieldValue('categoryId', null));
  form.watch('categoryId', () => form.setFieldValue('subcategoryId', null));

  const submit = async (v: Values) => {
    const cents = toCents(Number(v.amount));
    const transferCategory = findTransferCategory(data.categories);

    if (v.mode === 'transfer') {
      if (!transferCategory) return;
      if (editing && !editing.transferId) await deleteTransaction(editing);
      await saveTransfer({
        date: v.date,
        description: v.description.trim() || t.kinds.transfer,
        amountCents: cents,
        fromAccountId: v.accountId!,
        toAccountId: v.toAccountId!,
        transferCategoryId: transferCategory.id,
        transferId: editing?.transferId ?? undefined,
      });
    } else {
      if (editing?.transferId) await deleteTransaction(editing);
      const keepLink = editing && !editing.transferId;
      const category = v.mode === 'adjustment' ? null : data.categoryIndex.get(v.categoryId!);
      await saveTransaction({
        id: keepLink ? editing.id : newId(),
        date: v.date,
        description: v.description.trim() || category?.name || '',
        amountCents: v.mode === 'adjustment' ? cents : signedAmount(v.mode, cents) * (v.refund ? -1 : 1),
        accountId: v.accountId!,
        categoryId: v.categoryId!,
        subcategoryId: v.subcategoryId,
        transferId: null,
        recurringId: keepLink ? editing.recurringId : null,
        recurringMonth: keepLink ? editing.recurringMonth : null,
        installment: keepLink ? editing.installment : null,
      });
    }
    notifications.show({ color: 'teal', message: t.transactions.saved });
    onDone();
  };

  const kind = mode === 'income' ? 'income' : 'expense';
  const subOptions = categoryId
    ? categoryOptions(data.categories, null, categoryId, form.getValues().subcategoryId)
    : [];

  return (
    <form onSubmit={form.onSubmit((v) => void submit(v))}>
      <Stack>
        {mode !== 'adjustment' && (
          <SegmentedControl
            fullWidth
            data={[
              { value: 'expense', label: t.kinds.expense },
              { value: 'income', label: t.kinds.income },
              { value: 'transfer', label: t.kinds.transfer },
            ]}
            key={form.key('mode')}
            {...form.getInputProps('mode')}
          />
        )}
        <Group grow align="flex-start">
          <DateInput
            label={t.transactions.date}
            valueFormat="DD/MM/YYYY"
            key={form.key('date')}
            {...form.getInputProps('date')}
          />
          <NumberInput
            label={t.transactions.amount}
            prefix="R$ "
            decimalSeparator=","
            thousandSeparator="."
            decimalScale={2}
            fixedDecimalScale
            allowNegative={mode === 'adjustment'}
            hideControls
            inputMode="decimal"
            data-autofocus
            key={form.key('amount')}
            {...form.getInputProps('amount')}
          />
        </Group>
        <TextInput
          label={t.transactions.description}
          key={form.key('description')}
          {...form.getInputProps('description')}
        />
        <Select
          label={mode === 'transfer' ? t.transactions.fromAccount : t.transactions.account}
          data={accountOptions(data.accounts, form.getValues().accountId)}
          allowDeselect={false}
          key={form.key('accountId')}
          {...form.getInputProps('accountId')}
        />
        {mode === 'transfer' && (
          <Select
            label={t.transactions.toAccount}
            data={accountOptions(data.accounts, form.getValues().toAccountId)}
            allowDeselect={false}
            key={form.key('toAccountId')}
            {...form.getInputProps('toAccountId')}
          />
        )}
        {(mode === 'expense' || mode === 'income') && (
          <>
            <Group grow align="flex-start">
              <Select
                label={t.transactions.category}
                data={categoryOptions(data.categories, kind, null, categoryId)}
                searchable
                key={form.key('categoryId')}
                {...form.getInputProps('categoryId')}
              />
              <Select
                label={t.transactions.subcategory}
                data={subOptions}
                disabled={subOptions.length === 0}
                clearable
                searchable
                key={form.key('subcategoryId')}
                {...form.getInputProps('subcategoryId')}
              />
            </Group>
            <Checkbox
              label={t.transactions.refund}
              description={t.transactions.refundHint}
              key={form.key('refund')}
              {...form.getInputProps('refund', { type: 'checkbox' })}
            />
          </>
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onDone}>
            {t.common.cancel}
          </Button>
          <Button type="submit">{t.common.save}</Button>
        </Group>
      </Stack>
    </form>
  );
}
