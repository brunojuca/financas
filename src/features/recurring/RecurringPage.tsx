import {
  ActionIcon,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPlayerPlay, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Money, MonthSwitcher, PageHeader } from '../../components/common';
import { accountOptions, categoryOptions, pendingRecurringCount } from '../../components/options';
import { isDueIn, lastMonthOf } from '../../domain/cashflow/recurring';
import { currentMonth, formatMonthLong, formatMonthShort, monthsBetween } from '../../domain/dates';
import { fromCents, signedAmount, toCents } from '../../domain/money';
import type { RecurringTemplate, YearMonth } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { deleteRecurring, generateRecurringForMonth, newId, saveRecurring } from '../../storage/repo';
import { useFinanceData, type FinanceData } from '../../storage/useFinanceData';

// MonthPickerInput works with `YYYY-MM-DD` strings (first day of the month).
const toPicker = (ym: YearMonth | null) => (ym ? `${ym}-01` : null);
const fromPicker = (v: string | null) => (v ? v.slice(0, 7) : null);

interface Values {
  kind: 'expense' | 'income';
  description: string;
  amount: number | string;
  accountId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  dayOfMonth: number | string;
  startMonth: string | null;
  endMonth: string | null;
  installmentMode: boolean;
  installments: number | string;
  active: boolean;
}

function RecurringForm({
  data,
  editing,
  onDone,
}: {
  data: FinanceData;
  editing: RecurringTemplate | null;
  onDone: () => void;
}) {
  const kind = editing
    ? data.categoryIndex.get(editing.categoryId)?.kind === 'income'
      ? 'income'
      : 'expense'
    : 'expense';
  const form = useForm<Values>({
    initialValues: {
      kind,
      description: editing?.description ?? '',
      amount: editing ? fromCents(editing.amountCents) : '',
      accountId: editing?.accountId ?? data.accounts.find((a) => !a.archived)?.id ?? null,
      categoryId: editing?.categoryId ?? null,
      subcategoryId: editing?.subcategoryId ?? null,
      dayOfMonth: editing?.dayOfMonth ?? 10,
      startMonth: toPicker(editing?.startMonth ?? currentMonth()),
      endMonth: toPicker(editing?.endMonth ?? null),
      installmentMode: editing ? editing.installments !== null : false,
      installments: editing?.installments ?? 2,
      active: editing?.active ?? true,
    },
    validate: {
      description: (v) => (v.trim() ? null : t.common.required),
      amount: (v) => (typeof v === 'number' && v > 0 ? null : t.transactions.amountPositive),
      accountId: (v) => (v ? null : t.common.required),
      categoryId: (v) => (v ? null : t.common.required),
      dayOfMonth: (v) => (Number(v) >= 1 && Number(v) <= 31 ? null : t.common.required),
      startMonth: (v) => (v ? null : t.common.required),
      installments: (v, values) => (!values.installmentMode || Number(v) >= 2 ? null : t.common.required),
    },
  });
  form.watch('kind', () => form.setFieldValue('categoryId', null));
  form.watch('categoryId', () => form.setFieldValue('subcategoryId', null));
  const values = form.getValues();
  const subOptions = values.categoryId
    ? categoryOptions(data.categories, null, values.categoryId, values.subcategoryId)
    : [];

  const submit = async (v: Values) => {
    await saveRecurring({
      id: editing?.id ?? newId(),
      description: v.description.trim(),
      amountCents: toCents(Number(v.amount)),
      accountId: v.accountId!,
      categoryId: v.categoryId!,
      subcategoryId: v.subcategoryId,
      dayOfMonth: Number(v.dayOfMonth),
      startMonth: fromPicker(v.startMonth)!,
      endMonth: v.installmentMode ? null : fromPicker(v.endMonth),
      installments: v.installmentMode ? Number(v.installments) : null,
      active: v.active,
    });
    onDone();
  };

  return (
    <form onSubmit={form.onSubmit((v) => void submit(v))}>
      <Stack>
        <SegmentedControl
          fullWidth
          data={[
            { value: 'expense', label: t.kinds.expense },
            { value: 'income', label: t.kinds.income },
          ]}
          key={form.key('kind')}
          {...form.getInputProps('kind')}
        />
        <TextInput
          label={t.transactions.description}
          data-autofocus
          key={form.key('description')}
          {...form.getInputProps('description')}
        />
        <Group grow align="flex-start">
          <NumberInput
            label={t.transactions.amount}
            prefix="R$ "
            decimalSeparator=","
            thousandSeparator="."
            decimalScale={2}
            fixedDecimalScale
            allowNegative={false}
            hideControls
            inputMode="decimal"
            key={form.key('amount')}
            {...form.getInputProps('amount')}
          />
          <NumberInput
            label={t.recurring.dayOfMonth}
            min={1}
            max={31}
            allowDecimal={false}
            key={form.key('dayOfMonth')}
            {...form.getInputProps('dayOfMonth')}
          />
        </Group>
        <Select
          label={t.transactions.account}
          data={accountOptions(data.accounts, values.accountId)}
          allowDeselect={false}
          key={form.key('accountId')}
          {...form.getInputProps('accountId')}
        />
        <Group grow align="flex-start">
          <Select
            label={t.transactions.category}
            data={categoryOptions(data.categories, values.kind, null, values.categoryId)}
            searchable
            key={form.key('categoryId')}
            {...form.getInputProps('categoryId')}
          />
          <Select
            label={t.transactions.subcategory}
            data={subOptions}
            disabled={subOptions.length === 0}
            clearable
            key={form.key('subcategoryId')}
            {...form.getInputProps('subcategoryId')}
          />
        </Group>
        <Switch
          label={t.recurring.installmentMode}
          key={form.key('installmentMode')}
          {...form.getInputProps('installmentMode', { type: 'checkbox' })}
        />
        <Group grow align="flex-start">
          <MonthPickerInput
            label={t.recurring.startMonth}
            valueFormat="MMM/YYYY"
            key={form.key('startMonth')}
            {...form.getInputProps('startMonth')}
          />
          {values.installmentMode ? (
            <NumberInput
              label={t.recurring.installments}
              description={t.recurring.installmentHint}
              min={2}
              allowDecimal={false}
              key={form.key('installments')}
              {...form.getInputProps('installments')}
            />
          ) : (
            <MonthPickerInput
              label={t.recurring.endMonth}
              valueFormat="MMM/YYYY"
              clearable
              key={form.key('endMonth')}
              {...form.getInputProps('endMonth')}
            />
          )}
        </Group>
        <Switch
          label={t.recurring.active}
          key={form.key('active')}
          {...form.getInputProps('active', { type: 'checkbox' })}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            {t.common.cancel}
          </Button>
          <Button type="submit">{t.common.save}</Button>
        </Group>
      </Stack>
    </form>
  );
}

function schedule(r: RecurringTemplate, month: YearMonth): string {
  if (r.installments !== null) {
    const n = monthsBetween(r.startMonth, month) + 1;
    const base = t.recurring.installmentsFrom(r.installments, formatMonthShort(r.startMonth));
    return isDueIn(r, month) ? `${base} · ${n}/${r.installments}` : base;
  }
  const last = lastMonthOf(r);
  return last
    ? t.recurring.monthlyUntil(formatMonthShort(r.startMonth), formatMonthShort(last))
    : t.recurring.monthlySince(formatMonthShort(r.startMonth));
}

export function RecurringPage() {
  const data = useFinanceData();
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<RecurringTemplate | 'new' | null>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  const pending = pendingRecurringCount(data, month);
  const generatedIds = new Set(
    data.transactions.filter((x) => x.recurringMonth === month).map((x) => x.recurringId),
  );
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));

  const generate = async () => {
    const n = await generateRecurringForMonth(month);
    notifications.show({ color: n ? 'teal' : 'gray', message: t.recurring.generated(n) });
  };
  const confirmDelete = (r: RecurringTemplate) =>
    modals.openConfirmModal({
      title: t.recurring.deleteTitle,
      children: <Text size="sm">{t.recurring.deleteText}</Text>,
      labels: { confirm: t.common.delete, cancel: t.common.cancel },
      confirmProps: { color: 'red' },
      onConfirm: () => void deleteRecurring(r.id),
    });

  return (
    <>
      <PageHeader title={t.nav.recurring}>
        <MonthSwitcher value={month} onChange={setMonth} />
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditing('new')}>
          {t.recurring.new}
        </Button>
      </PageHeader>
      <Text c="dimmed" size="sm" mb="md">
        {t.recurring.intro}
      </Text>
      <Paper mb="md">
        <Group justify="space-between">
          <Text fw={600} tt="none">
            {t.recurring.generate(formatMonthLong(month))}
            {pending > 0 && (
              <Badge ml="xs" variant="filled">
                {t.recurring.pending(pending)}
              </Badge>
            )}
          </Text>
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            disabled={pending === 0}
            onClick={() => void generate()}
          >
            {t.dashboard.generateNow}
          </Button>
        </Group>
      </Paper>

      {data.recurring.length === 0 && (
        <Text c="dimmed" ta="center">
          {t.recurring.empty}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {[...data.recurring]
          .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.description.localeCompare(b.description, 'pt-BR'))
          .map((r) => {
            const category = data.categoryIndex.get(r.categoryId);
            const due = isDueIn(r, month);
            return (
              <Paper key={r.id} opacity={r.active ? 1 : 0.6}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fw={600} truncate>
                      {r.description}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {category?.name} · {accountName.get(r.accountId)} · dia {r.dayOfMonth}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {schedule(r, month)}
                    </Text>
                    <Group gap={6} mt={4}>
                      {generatedIds.has(r.id) ? (
                        <Badge size="xs" color="teal" variant="light">
                          {t.recurring.generatedThisMonth}
                        </Badge>
                      ) : !due ? (
                        <Badge size="xs" color="gray" variant="light">
                          {r.active ? t.recurring.notDue : t.common.archived}
                        </Badge>
                      ) : null}
                    </Group>
                  </Stack>
                  <Stack gap={4} align="flex-end">
                    <Money
                      cents={signedAmount(category?.kind === 'income' ? 'income' : 'expense', r.amountCents)}
                      fw={700}
                    />
                    <Group gap={2}>
                      <ActionIcon variant="subtle" aria-label={t.common.edit} onClick={() => setEditing(r)}>
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={t.common.delete}
                        onClick={() => confirmDelete(r)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Stack>
                </Group>
              </Paper>
            );
          })}
      </SimpleGrid>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t.recurring.new : t.recurring.edit}
        fullScreen={isMobile}
        size="lg"
      >
        {editing !== null && (
          <RecurringForm
            data={data}
            editing={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
