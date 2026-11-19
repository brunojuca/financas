import {
  Badge,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCopy } from '@tabler/icons-react';
import { useState } from 'react';
import { Money, MonthSwitcher, PageHeader } from '../../components/common';
import { MoneyInput } from '../../components/MoneyInput';
import { budgetReport, type BudgetRow } from '../../domain/cashflow/budget';
import { currentMonth } from '../../domain/dates';
import type { CategoryKind, YearMonth } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { semantic } from '../../theme';
import { copyBudgetFromPreviousMonth, setBudget } from '../../storage/repo';
import { useFinanceData } from '../../storage/useFinanceData';

function BudgetInput({ month, row }: { month: YearMonth; row: BudgetRow }) {
  const [value, setValue] = useState<number | null>(Math.abs(row.budget) || null);
  const commit = () => {
    const cents = value ?? 0;
    if (cents !== Math.abs(row.budget)) void setBudget(month, row.category.id, cents);
  };
  return (
    <MoneyInput
      aria-label={`${t.budget.planned}: ${row.category.name}`}
      placeholder={t.budget.noBudget}
      value={value}
      onChange={setValue}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      w={150}
      size="sm"
    />
  );
}

function usageColor(row: BudgetRow): string {
  if (row.usage === null) return 'gray';
  if (row.category.kind === 'income') return row.usage >= 1 ? semantic.income : 'yellow';
  return row.usage > 1 ? semantic.expense : row.usage > 0.85 ? 'yellow' : semantic.income;
}

function Section({ kind, rows, month }: { kind: CategoryKind; rows: BudgetRow[]; month: YearMonth }) {
  if (rows.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text fw={700} c="dimmed" tt="uppercase" size="xs">
        {t.kindsPlural[kind]}
      </Text>
      {rows.map((row) => (
        <Paper key={`${month}:${row.category.id}`} p="sm">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap={6} style={{ flex: '1 1 140px' }}>
              <Text fw={600}>{row.category.name}</Text>
              {row.category.archived && (
                <Badge size="xs" variant="outline" color="gray">
                  {t.common.archived}
                </Badge>
              )}
            </Group>
            <BudgetInput key={`${month}:${row.category.id}:${row.budget}`} month={month} row={row} />
          </Group>
          <Progress mt="xs" size="sm" value={Math.min(100, (row.usage ?? 0) * 100)} color={usageColor(row)} />
          <Group justify="space-between" mt={6} gap="xs">
            <Text size="xs" c="dimmed">
              {t.budget.actual}: <Money cents={row.actual} size="xs" colored={false} />
            </Text>
            <Text size="xs" c="dimmed">
              {t.budget.difference}: <Money cents={row.difference} size="xs" />
            </Text>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

export function BudgetPage() {
  const data = useFinanceData();
  const [month, setMonth] = useState(currentMonth());
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  const report = budgetReport(month, data.categories, data.categoryIndex, data.budgets, data.transactions);
  const hasBudget = data.budgets.some((b) => b.month === month);

  const copy = async () => {
    const n = await copyBudgetFromPreviousMonth(month);
    notifications.show({ message: t.budget.copied(n) });
  };
  const confirmCopy = () =>
    hasBudget
      ? modals.openConfirmModal({
          title: t.budget.copyConfirmTitle,
          children: <Text size="sm">{t.budget.copyConfirmText}</Text>,
          onConfirm: () => void copy(),
        })
      : void copy();

  return (
    <>
      <PageHeader title={t.nav.budget}>
        <MonthSwitcher value={month} onChange={setMonth} />
        <Button variant="light" leftSection={<IconCopy size={18} />} onClick={confirmCopy}>
          {t.budget.copyPrevious}
        </Button>
      </PageHeader>

      <Paper mb="md">
        <Text fw={600} mb="xs">
          {t.budget.result}
        </Text>
        <SimpleGrid cols={3}>
          {(
            [
              [t.budget.planned, report.total.budget],
              [t.budget.actual, report.total.actual],
              [t.budget.difference, report.total.difference],
            ] as const
          ).map(([label, cents]) => (
            <Stack gap={0} key={label}>
              <Text size="xs" c="dimmed">
                {label}
              </Text>
              <Money cents={cents} fw={700} />
            </Stack>
          ))}
        </SimpleGrid>
        <Divider my="xs" />
        <Text size="xs" c="dimmed">
          {t.budget.hint}
        </Text>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Section kind="income" month={month} rows={report.rows.filter((r) => r.category.kind === 'income')} />
        <Section
          kind="expense"
          month={month}
          rows={report.rows.filter((r) => r.category.kind === 'expense')}
        />
      </SimpleGrid>
    </>
  );
}
