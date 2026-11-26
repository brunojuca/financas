import { Alert, Button, Center, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconCloudUpload } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Chart, type ChartOption } from '../../components/Chart';
import { axisMoney, tooltipMoney, useChartColor } from '../../components/chartFormat';
import { Money, MonthSwitcher, PageHeader } from '../../components/common';
import {
  accountBalances,
  balanceHistory,
  includedAccountIds,
  totalBalance,
  expensesByCategory,
  monthlySeries,
  monthTotals,
} from '../../domain/cashflow/summary';
import {
  addMonths,
  currentMonth,
  formatDateBR,
  formatMonthShort,
  monthEnd,
  monthRange,
  todayIso,
} from '../../domain/dates';
import { fromCents } from '../../domain/money';
import { t } from '../../i18n/pt-BR';
import { semantic } from '../../theme';
import { getMeta, META } from '../../storage/db';
import { useFinanceData } from '../../storage/useFinanceData';
import { exportBackupFile } from '../settings/backupActions';

const BACKUP_REMINDER_DAYS = 30;

function Stat({
  label,
  cents,
  colored = true,
  alt,
}: {
  label: string;
  cents: number;
  colored?: boolean;
  /** A related figure shown small (the other card-report option, the projected balance). */
  alt?: { label: string; cents: number } | null;
}) {
  return (
    <Paper>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Money cents={cents} colored={colored} fw={700} size="xl" />
      {alt && (
        <Text size="xs" c="dimmed">
          {alt.label}: <Money cents={alt.cents} colored={false} size="xs" />
        </Text>
      )}
    </Paper>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper>
      <Title order={5} mb="sm">
        {title}
      </Title>
      {children}
    </Paper>
  );
}

export function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const data = useFinanceData(month);
  // null = never backed up; undefined = loading
  const daysSinceBackup = useLiveQuery(async () => {
    const last = await getMeta(META.lastBackupAt);
    return last ? Math.floor((Date.now() - Date.parse(last)) / 86_400_000) : null;
  }, []);
  const color = useChartColor();

  const charts = useMemo(() => {
    if (!data) return null;
    const months = monthRange(addMonths(month, -11), month);
    const labels = months.map(formatMonthShort);
    const series = monthlySeries(data.budgetTransactions, data.categoryIndex, months);
    // Card purchases on their bill due date or purchase date, per the setting (like the month totals).
    const history = balanceHistory(data.budgetTransactions, months, includedAccountIds(data.accounts));
    const byCategory = expensesByCategory(data.budgetTransactions, data.categoryIndex, month);

    const incomeVsExpense: ChartOption = {
      grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
      legend: { top: 0 },
      tooltip: { trigger: 'axis', valueFormatter: tooltipMoney },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', axisLabel: { formatter: axisMoney } },
      series: [
        {
          name: t.kindsPlural.income,
          type: 'bar',
          data: series.map((p) => fromCents(p.income)),
          color: color(semantic.income),
        },
        {
          name: t.kindsPlural.expense,
          type: 'bar',
          data: series.map((p) => fromCents(p.expense)),
          color: color(semantic.expense),
        },
      ],
    };
    const balance: ChartOption = {
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', valueFormatter: tooltipMoney },
      xAxis: { type: 'category', data: labels, boundaryGap: false },
      yAxis: { type: 'value', axisLabel: { formatter: axisMoney }, scale: true },
      series: [
        {
          name: t.dashboard.totalBalance,
          type: 'line',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.15 },
          data: history.map((p) => fromCents(p.balance)),
        },
      ],
    };
    const donut: ChartOption = {
      tooltip: { trigger: 'item', valueFormatter: tooltipMoney },
      legend: { type: 'scroll', bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderWidth: 2, borderColor: 'transparent' },
          label: { show: false },
          data: byCategory.map((c) => ({
            name: data.categoryIndex.get(c.categoryId)?.name ?? '',
            value: fromCents(c.amount),
          })),
        },
      ],
    };
    return { incomeVsExpense, balance, donut, hasExpenses: byCategory.length > 0 };
  }, [data, month, color]);

  if (!data || !charts || daysSinceBackup === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  // "Hoje": entries up to today, matching the bank (future-dated entries only in "previsto" on Contas).
  const balances = accountBalances(data.transactions, todayIso());
  const total = totalBalance(balances, data.accounts);
  // "Previsto": at the end of the month shown, with future entries and recurring ones still to come.
  const end = monthEnd(month);
  const projectedTotal =
    end > todayIso()
      ? totalBalance(accountBalances([...data.transactions, ...data.projected], end), data.accounts)
      : null;
  const totals = monthTotals(data.budgetTransactions, data.categoryIndex, month);
  // Optional: the same month computed with the other card-report option (Configurações), shown small.
  const altTotals =
    data.showAltCardReport && data.altBudgetTransactions
      ? monthTotals(data.altBudgetTransactions, data.categoryIndex, month)
      : null;
  const altLabel = data.cardReportMode === 'bill' ? t.dashboard.byPurchaseDate : t.dashboard.byBill;
  const alt = (key: 'income' | 'expense' | 'net') =>
    altTotals ? { label: altLabel, cents: altTotals[key] } : null;
  const uncategorized = data.transactions.filter((tx) => tx.categoryId === null && !tx.extraordinary).length;
  const showBackupReminder =
    data.transactions.length > 0 && (daysSinceBackup === null || daysSinceBackup >= BACKUP_REMINDER_DAYS);

  return (
    <>
      <PageHeader title={t.nav.dashboard}>
        <MonthSwitcher value={month} onChange={setMonth} />
      </PageHeader>

      <Stack gap="md">
        {showBackupReminder && (
          <Alert color="yellow" icon={<IconCloudUpload size={18} />}>
            <Group justify="space-between">
              <Text size="sm">
                {daysSinceBackup === null
                  ? t.dashboard.backupReminderNever
                  : t.dashboard.backupReminderOld(daysSinceBackup)}
              </Text>
              <Button size="xs" variant="light" color="yellow" onClick={() => void exportBackupFile()}>
                {t.dashboard.backupNow}
              </Button>
            </Group>
          </Alert>
        )}
        {uncategorized > 0 && (
          <Alert color="red" icon={<IconAlertCircle size={18} />}>
            <Group justify="space-between">
              <Text size="sm">{t.dashboard.issuesAlert(uncategorized)}</Text>
              <Button size="xs" variant="light" color="red" component={Link} to="/pendencias">
                {t.dashboard.reviewIssues}
              </Button>
            </Group>
          </Alert>
        )}

        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <Stat
            label={t.dashboard.totalBalanceToday}
            cents={total}
            alt={
              projectedTotal === null
                ? null
                : { label: t.dashboard.projectedAt(formatDateBR(end)), cents: projectedTotal }
            }
          />
          <Stat label={t.dashboard.income} cents={totals.income} colored={false} alt={alt('income')} />
          <Stat label={t.dashboard.expense} cents={totals.expense} colored={false} alt={alt('expense')} />
          <Stat label={t.dashboard.net} cents={totals.net} alt={alt('net')} />
        </SimpleGrid>
        {totals.extraordinary !== 0 && (
          <Text size="sm" c="dimmed">
            {t.dashboard.extraordinaryNote} <Money cents={totals.extraordinary} fw={600} />
          </Text>
        )}

        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <ChartCard title={t.dashboard.incomeVsExpense}>
            <Chart option={charts.incomeVsExpense} aria-label={t.dashboard.incomeVsExpense} />
          </ChartCard>
          <ChartCard title={t.dashboard.expensesByCategory}>
            {charts.hasExpenses ? (
              <Chart option={charts.donut} aria-label={t.dashboard.expensesByCategory} />
            ) : (
              <Center h={300}>
                <Text c="dimmed">{t.dashboard.noExpenses}</Text>
              </Center>
            )}
          </ChartCard>
          <ChartCard title={t.dashboard.balanceHistory}>
            <Chart option={charts.balance} aria-label={t.dashboard.balanceHistory} height={260} />
          </ChartCard>
          <ChartCard title={t.dashboard.accounts}>
            <Stack gap="xs">
              {data.accounts
                .filter((a) => !a.archived || (balances.get(a.id) ?? 0) !== 0)
                .map((a) => (
                  <Group key={a.id} justify="space-between">
                    <Stack gap={0}>
                      <Text size="sm" fw={500}>
                        {a.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t.accountTypes[a.type]}
                        {!a.includeInTotal && ` · ${t.accounts.outOfTotal}`}
                      </Text>
                    </Stack>
                    <Money cents={balances.get(a.id) ?? 0} fw={600} />
                  </Group>
                ))}
            </Stack>
          </ChartCard>
        </SimpleGrid>
      </Stack>
    </>
  );
}
