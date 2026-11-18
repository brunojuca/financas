import { Alert, Button, Center, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconCloudUpload, IconRepeat } from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Chart, type ChartOption } from '../../components/Chart';
import { axisMoney, tooltipMoney, useChartColor } from '../../components/chartFormat';
import { Money, MonthSwitcher, PageHeader } from '../../components/common';
import { pendingRecurringCount } from '../../components/options';
import {
  accountBalances,
  balanceHistory,
  expensesByCategory,
  monthlySeries,
  monthTotals,
} from '../../domain/cashflow/summary';
import { addMonths, currentMonth, formatMonthShort, monthRange } from '../../domain/dates';
import { fromCents } from '../../domain/money';
import { t } from '../../i18n/pt-BR';
import { semantic } from '../../theme';
import { getMeta, META } from '../../storage/db';
import { generateRecurringForMonth } from '../../storage/repo';
import { useFinanceData } from '../../storage/useFinanceData';
import { exportBackupFile } from '../settings/backupActions';

const BACKUP_REMINDER_DAYS = 30;

function Stat({ label, cents, colored = true }: { label: string; cents: number; colored?: boolean }) {
  return (
    <Paper>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Money cents={cents} colored={colored} fw={700} size="xl" />
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
  const data = useFinanceData();
  // null = never backed up; undefined = loading
  const daysSinceBackup = useLiveQuery(async () => {
    const last = await getMeta(META.lastBackupAt);
    return last ? Math.floor((Date.now() - Date.parse(last)) / 86_400_000) : null;
  }, []);
  const [month, setMonth] = useState(currentMonth());
  const color = useChartColor();

  const charts = useMemo(() => {
    if (!data) return null;
    const months = monthRange(addMonths(month, -11), month);
    const labels = months.map(formatMonthShort);
    const series = monthlySeries(data.transactions, data.categoryIndex, months);
    const history = balanceHistory(data.transactions, months);
    const byCategory = expensesByCategory(data.transactions, data.categoryIndex, month);

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

  const balances = accountBalances(data.transactions);
  const total = [...balances.values()].reduce((s, v) => s + v, 0);
  const totals = monthTotals(data.transactions, data.categoryIndex, month);
  const pending = pendingRecurringCount(data, month);
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
        {pending > 0 && (
          <Alert icon={<IconRepeat size={18} />}>
            <Group justify="space-between">
              <Text size="sm">{t.dashboard.pendingRecurring(pending)}</Text>
              <Button size="xs" variant="light" onClick={() => void generateRecurringForMonth(month)}>
                {t.dashboard.generateNow}
              </Button>
            </Group>
          </Alert>
        )}

        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <Stat label={t.dashboard.totalBalance} cents={total} />
          <Stat label={t.dashboard.income} cents={totals.income} colored={false} />
          <Stat label={t.dashboard.expense} cents={totals.expense} colored={false} />
          <Stat label={t.dashboard.net} cents={totals.net} />
        </SimpleGrid>

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
