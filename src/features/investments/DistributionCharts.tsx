import { Paper, SimpleGrid, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { Chart, type ChartOption } from '../../components/Chart';
import { tooltipMoney } from '../../components/chartFormat';
import { distribution } from '../../domain/fixedIncome/distribution';
import type { PortfolioSummary } from '../../domain/fixedIncome/portfolio';
import { formatPercent, fromCents } from '../../domain/money';
import { t } from '../../i18n/pt-BR';

function donut(data: { name: string; value: number; share: number }[]): ChartOption {
  const shares = new Map(data.map((d) => [d.name, d.share]));
  return {
    tooltip: { trigger: 'item', valueFormatter: tooltipMoney },
    // Shares in the legend (labels around a small donut get cut off).
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'middle',
      formatter: (name: string) => `${name}  ${formatPercent(shares.get(name) ?? 0)}`,
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['28%', '50%'],
        label: { show: false },
        data: data.map(({ name, value }) => ({ name, value })),
      },
    ],
  };
}

export function DistributionCharts({ summary }: { summary: PortfolioSummary }) {
  const { byProduct, byIndexer } = useMemo(() => distribution(summary), [summary]);
  if (byProduct.length === 0) return null;
  const products = donut(
    byProduct.map((s) => ({
      name: t.investments.products[s.key],
      value: fromCents(s.value),
      share: s.share,
    })),
  );
  const indexers = donut(
    byIndexer.map((s) => ({
      name: t.investments.indexerGroups[s.key],
      value: fromCents(s.value),
      share: s.share,
    })),
  );
  return (
    <Paper h="100%">
      <Title order={5}>{t.investments.distributionTitle}</Title>
      <Text size="xs" c="dimmed" mb="xs">
        {t.investments.distributionHint}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <div>
          <Text size="sm" fw={500} ta="center">
            {t.investments.byProduct}
          </Text>
          <Chart option={products} aria-label={t.investments.byProduct} height={220} />
        </div>
        <div>
          <Text size="sm" fw={500} ta="center">
            {t.investments.byIndexer}
          </Text>
          <Chart option={indexers} aria-label={t.investments.byIndexer} height={220} />
        </div>
      </SimpleGrid>
    </Paper>
  );
}
