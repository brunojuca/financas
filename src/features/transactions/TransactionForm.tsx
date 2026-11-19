import {
  Autocomplete,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  type ComboboxParsedItem,
  type OptionsFilter,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMemo } from 'react';
import { MoneyInput } from '../../components/MoneyInput';
import { accountOptions, categoryOptions } from '../../components/options';
import { descriptionSuggestions } from '../../domain/cashflow/suggestions';
import { isIsoDate, todayIso } from '../../domain/dates';
import { normalizeName } from '../../domain/import/csv';
import { signedAmount } from '../../domain/money';
import { findTransferCategory } from '../../domain/seed';
import type { IsoDate, Transaction } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { META, setMeta } from '../../storage/db';
import { deleteTransaction, newId, saveTransaction, saveTransfer } from '../../storage/repo';
import type { FinanceData } from '../../storage/useFinanceData';

/** `adjustment` = single-leg entry in the transfer category (e.g. opening balance); only reachable by editing. */
type Mode = 'expense' | 'income' | 'transfer' | 'adjustment';

interface Values {
  mode: Mode;
  /** New entries start with the date of the last one saved (empty the first time); "Hoje" sets today. */
  date: IsoDate | null;
  description: string;
  /** Cents; positive except in adjustment mode. */
  amount: number | null;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  refund: boolean;
  extraordinary: boolean;
}

/** The account of the last entry saved from this form, else the first active one. */
function defaultAccount(data: FinanceData): string | null {
  const active = data.accounts.filter((a) => !a.archived);
  return (active.find((a) => a.id === data.lastAccountId) ?? active[0])?.id ?? null;
}

/** Blank values for a new entry, or the values of `source` (entry being edited or duplicated). */
function initialValues(data: FinanceData, source: Transaction | null): Values {
  if (!source) {
    return {
      mode: 'expense',
      date: isIsoDate(data.lastDate) ? data.lastDate : null,
      description: '',
      amount: null,
      accountId: defaultAccount(data),
      toAccountId: null,
      categoryId: null,
      subcategoryId: null,
      refund: false,
      extraordinary: false,
    };
  }
  const base = { date: source.date, description: source.description, refund: false, extraordinary: false };
  if (source.transferId) {
    const legs = data.transactions.filter((x) => x.transferId === source.transferId);
    const from = legs.find((x) => x.amountCents < 0) ?? source;
    const to = legs.find((x) => x.amountCents > 0);
    return {
      ...base,
      mode: 'transfer',
      amount: Math.abs(source.amountCents),
      accountId: from.accountId,
      toAccountId: to?.accountId ?? null,
      categoryId: null,
      subcategoryId: null,
    };
  }
  // Uncategorized entries take their kind from the sign.
  const kind =
    (source.categoryId ? data.categoryIndex.get(source.categoryId)?.kind : undefined) ??
    (source.amountCents > 0 ? 'income' : 'expense');
  if (kind === 'transfer') {
    return {
      ...base,
      mode: 'adjustment',
      amount: source.amountCents,
      accountId: source.accountId,
      toAccountId: null,
      categoryId: source.categoryId,
      subcategoryId: null,
    };
  }
  return {
    ...base,
    mode: kind,
    amount: Math.abs(source.amountCents),
    accountId: source.accountId,
    toAccountId: null,
    categoryId: source.categoryId,
    subcategoryId: source.subcategoryId,
    refund: signedAmount(kind, 1) * source.amountCents < 0,
    extraordinary: source.extraordinary,
  };
}

/** Accent- and case-insensitive "contains" filter for the description suggestions. */
const descriptionFilter: OptionsFilter = ({ options, search }) => {
  const query = normalizeName(search);
  return (options as ComboboxParsedItem[]).filter(
    (o) => 'value' in o && query !== '' && normalizeName(o.value).includes(query),
  );
};

interface Props {
  data: FinanceData;
  /** Entry being edited; null for a new one. */
  editing: Transaction | null;
  /** Entry to copy into a new one ("Duplicar"), keeping its date. */
  duplicateOf?: Transaction | null;
  /** Month the date picker opens on when the date is empty. */
  calendarDate?: IsoDate;
  onDone: () => void;
}

export function TransactionForm({ data, editing, duplicateOf = null, calendarDate, onDone }: Props) {
  const form = useForm<Values>({
    initialValues: initialValues(data, duplicateOf ?? editing),
    validate: {
      date: (v) => (isIsoDate(v) ? null : t.common.required),
      amount: (v, values) =>
        v === null || (values.mode !== 'adjustment' && v <= 0) ? t.transactions.amountPositive : null,
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
        values.mode === 'transfer' || values.mode === 'adjustment' || values.extraordinary || v
          ? null
          : t.common.required,
    },
  });
  const { mode, categoryId } = form.getValues();

  const suggestions = useMemo(
    () =>
      descriptionSuggestions(
        data.transactions,
        data.categoryIndex,
        new Set(data.accounts.filter((a) => !a.archived).map((a) => a.id)),
      ),
    [data],
  );
  const pickSuggestion = (description: string) => {
    const s = suggestions.find((x) => x.description === description);
    if (!s || form.getValues().mode === 'adjustment') return;
    form.setValues({
      description: s.description,
      mode: s.mode,
      accountId: s.accountId,
      toAccountId: s.toAccountId ?? form.getValues().toAccountId,
      categoryId: s.categoryId,
      subcategoryId: s.subcategoryId,
    });
  };

  const submit = async (v: Values) => {
    const cents = v.amount!;
    const date = v.date!;
    const transferCategory = findTransferCategory(data.categories);

    if (v.mode === 'transfer') {
      if (!transferCategory) return;
      if (editing && !editing.transferId) await deleteTransaction(editing);
      await saveTransfer({
        date,
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
      const category = v.mode === 'adjustment' || !v.categoryId ? null : data.categoryIndex.get(v.categoryId);
      await saveTransaction({
        id: keepLink ? editing.id : newId(),
        date,
        description: v.description.trim() || category?.name || '',
        amountCents: v.mode === 'adjustment' ? cents : signedAmount(v.mode, cents) * (v.refund ? -1 : 1),
        accountId: v.accountId!,
        categoryId: v.categoryId,
        subcategoryId: v.categoryId ? v.subcategoryId : null,
        extraordinary: v.mode !== 'adjustment' && v.extraordinary,
        transferId: null,
        recurringId: keepLink ? editing.recurringId : null,
        recurringMonth: keepLink ? editing.recurringMonth : null,
        installment: keepLink ? editing.installment : null,
      });
    }
    await setMeta(META.lastAccountId, v.accountId!);
    await setMeta(META.lastDate, date);
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
            onChange={(v) => form.setValues({ mode: v as Mode, categoryId: null, subcategoryId: null })}
          />
        )}
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
          <Group gap={6} wrap="nowrap" align="flex-start">
            <DateInput
              label={t.transactions.date}
              placeholder={t.transactions.datePlaceholder}
              valueFormat="DD/MM/YYYY"
              defaultDate={calendarDate}
              style={{ flex: 1, minWidth: 0 }}
              key={form.key('date')}
              {...form.getInputProps('date')}
            />
            <Button variant="light" px="xs" mt={25} onClick={() => form.setFieldValue('date', todayIso())}>
              {t.transactions.today}
            </Button>
          </Group>
          <MoneyInput
            label={t.transactions.amount}
            allowNegative={mode === 'adjustment'}
            data-autofocus
            key={form.key('amount')}
            {...form.getInputProps('amount')}
          />
        </SimpleGrid>
        <Autocomplete
          label={t.transactions.description}
          data={suggestions.map((x) => x.description)}
          filter={descriptionFilter}
          limit={8}
          onOptionSubmit={pickSuggestion}
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
                clearable
                data={categoryOptions(data.categories, kind, null, categoryId)}
                searchable
                key={form.key('categoryId')}
                {...form.getInputProps('categoryId')}
                onChange={(v) => form.setValues({ categoryId: v, subcategoryId: null })}
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
            <Checkbox
              label={t.transactions.extraordinary}
              description={t.transactions.extraordinaryHint}
              key={form.key('extraordinary')}
              {...form.getInputProps('extraordinary', { type: 'checkbox' })}
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
