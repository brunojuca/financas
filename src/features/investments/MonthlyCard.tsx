import { Badge, Group, Paper, SegmentedControl, Table, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Chart, type ChartOption } from '../../components/Chart';
import { axisMoney, useChartColor } from '../../components/chartFormat';
import { formatMonthShort, monthOf } from '../../domain/dates';
import { monthlyEarnings, monthsAround, type MonthEarnings } from '../../domain/fixedIncome/monthly';
import { formatBRL, formatPercent, fromCents } from '../../domain/money';
import { t } from '../../i18n/pt-BR';
import { HelpButton } from './ReturnsParts';
import type { InvestmentsData } from './useInvestments';

/** Sum of earnings and the compounded rate of a run of months. */
function total(months: MonthEarnings[]) {
  return {
    earnings: months.reduce((s, m) => s + m.earnings, 0),
    rate: months.reduce((r, m) => r * (1 + m.rate), 1) - 1,
  };
}

/** Gross earnings on the curve per month: last 12 (realized) and next 12 (projected). */
export function MonthlyCard({ data, tituloId }: { data: InvestmentsData; tituloId?: string }) {
  const [view, setView] = useState('chart');
  const color = useChartColor();
  const months = useMemo(() => {
    const titulos = tituloId ? data.titulos.filter((x) => x.id === tituloId) : data.titulos;
    const all = monthlyEarnings(
      titulos,
      data.lots,
      data.redemptions,
      monthsAround(data.today, 12, 11), // 12 past months; the current one + 11 ahead
      data.today,
      data.market,
    );
    // Trim empty months at both ends (before the first purchase, after the last maturity).
    const first = all.findIndex((m) => m.base > 0);
    const last = all.length - 1 - [...all].reverse().findIndex((m) => m.base > 0);
    return first < 0 ? [] : all.slice(first, last + 1);
  }, [data, tituloId]);

  const current = monthOf(data.today);
  const past = months.filter((m) => m.month < current);
  const future = months.filter((m) => m.month >= current);

  const option: ChartOption = {
    grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = (params as { dataIndex: number }[])[0]!;
        const m = months[p.dataIndex]!;
        return `${formatMonthShort(m.month)}${m.projected ? ` (${t.investments.projectedShort})` : ''}<br/>${formatBRL(
          m.earnings,
        )} · ${formatPercent(m.rate)}`;
      },
    },
    xAxis: { type: 'category', data: months.map((m) => formatMonthShort(m.month)) },
    yAxis: [
      { type: 'value', axisLabel: { formatter: axisMoney } },
      {
        type: 'value',
        axisLabel: { formatter: (v: number) => formatPercent(v) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: t.investments.earnings,
        type: 'bar',
        data: months.map((m) => ({
          value: fromCents(m.earnings),
          itemStyle: { color: color('cyan'), opacity: m.projected ? 0.45 : 1 },
        })),
      },
      {
        name: '%',
        type: 'line',
        yAxisIndex: 1,
        symbolSize: 5,
        data: months.map((m) => m.rate),
        color: color('grape'),
      },
    ],
  };

  return (
    <Paper h="100%">
      <Group justify="space-between" mb={4} wrap="nowrap">
        <div>
          <Text fw={600}>{t.investments.monthlyTitle}</Text>
          <Text size="xs" c="dimmed">
            {t.investments.monthlyHint}
          </Text>
        </div>
        <Group gap={4} wrap="nowrap">
          <SegmentedControl
            size="xs"
            value={view}
            onChange={setView}
            data={[
              { value: 'chart', label: t.investments.chartView },
              { value: 'table', label: t.investments.tableView },
            ]}
          />
          <HelpButton />
        </Group>
      </Group>
      {months.length === 0 ? (
        <Text c="dimmed" ta="center" py="md">
          {t.investments.noMonthly}
        </Text>
      ) : view === 'chart' ? (
        <Chart option={option} aria-label={t.investments.monthlyTitle} height={230} />
      ) : (
        <Table.ScrollContainer minWidth={300} mah={230}>
          <Table verticalSpacing={2} stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t.investments.month}</Table.Th>
                <Table.Th ta="right">{t.investments.earnings}</Table.Th>
                <Table.Th ta="right">%</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {months.map((m) => (
                <Table.Tr key={m.month}>
                  <Table.Td>
                    <Group gap={6}>
                      <Text size="sm">{formatMonthShort(m.month)}</Text>
                      {m.projected && (
                        <Badge size="xs" variant="light" color="gray">
                          {t.investments.projectedShort}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm">{formatBRL(m.earnings)}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm">{formatPercent(m.rate)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Group gap="lg" mt="xs">
        {past.length > 0 && (
          <Text size="xs" c="dimmed">
            {t.investments.lastMonths(past.length)} ({t.investments.realized}):{' '}
            {formatBRL(total(past).earnings)} · {formatPercent(total(past).rate)}
          </Text>
        )}
        {future.length > 0 && (
          <Text size="xs" c="dimmed">
            {t.investments.nextMonths(future.length)} ({t.investments.projectedShort}):{' '}
            {formatBRL(total(future).earnings)} · {formatPercent(total(future).rate)}
          </Text>
        )}
      </Group>
    </Paper>
  );
}
