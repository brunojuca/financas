import {
  Badge,
  Button,
  Center,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common';
import { formatDateBR } from '../../domain/dates';
import type { TituloSummary } from '../../domain/fixedIncome/portfolio';
import { formatBRL } from '../../domain/money';
import { t } from '../../i18n/pt-BR';
import { DistributionCharts } from './DistributionCharts';
import { describeTerms, formatPercentShort, perYearText } from './format';
import { PricesCard } from './PricesCard';
import { ProjectionPanel } from './ProjectionPanel';
import { MonthlyCard } from './MonthlyCard';
import { CurveMarket, ReturnsCard } from './ReturnsParts';
import { scenarioText } from './scenario';
import { TituloForm } from './TituloForm';
import { useInvestments } from './useInvestments';

function MaturityCell({ row }: { row: TituloSummary }) {
  if (!row.titulo.maturity) return <>{t.investments.dailyLiquidity}</>;
  return (
    <Group gap={6} wrap="nowrap">
      {formatDateBR(row.titulo.maturity)}
      {row.matured && (
        <Badge size="xs" color="gray">
          {t.investments.matured}
        </Badge>
      )}
    </Group>
  );
}

/** "22,5%" or "17,5–22,5%" when lots were bought at different times; "isento" for LCI/LCA. */
function irRateText(row: TituloSummary): string {
  if (!row.irRateToday) return '—';
  const [min, max] = row.irRateToday;
  const pct = formatPercentShort;
  return min === max ? pct(min) : `${pct(min)}–${pct(max)}`;
}

/** Compact figure: label, net value, and the gross value below. */
function KpiCard({
  label,
  net,
  gross,
  caption,
  color,
}: {
  label: string;
  net: number;
  gross?: number;
  caption?: string;
  color?: string;
}) {
  return (
    <Paper h="100%">
      <Text size="xs" c={color ?? 'dimmed'} tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fz={{ base: 'md', sm: 'xl' }} fw={700} c={color} mt={2} style={{ whiteSpace: 'nowrap' }}>
        {formatBRL(net)}
      </Text>
      <Text size="xs" c="dimmed">
        {caption ??
          `${t.investments.netShort} · ${t.investments.gross.toLowerCase()} ${formatBRL(gross ?? 0)}`}
      </Text>
    </Paper>
  );
}

export function InvestmentsPage() {
  const data = useInvestments();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState('portfolio');
  const isMobile = useMediaQuery('(max-width: 48em)');
  const navigate = useNavigate();
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  const { summary, assumptions } = data;
  const rows = [...summary.rows].sort(
    (a, b) =>
      Number(a.matured) - Number(b.matured) ||
      (a.titulo.maturity ?? '9').localeCompare(b.titulo.maturity ?? '9'),
  );
  const open = (id: string) => navigate(`/investimentos/${id}`);
  const heldCount = rows.filter((r) => !r.matured).length;
  const priceDate = summary.rows.find((r) => r.priceDate)?.priceDate;
  const marketOf = (row: TituloSummary, key: 'gross' | 'net') =>
    row.market ? formatBRL(row.market[key]) : null;

  return (
    <>
      <PageHeader title={t.nav.investments}>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
          {t.investments.newTitulo}
        </Button>
      </PageHeader>

      <Tabs value={tab} onChange={(v) => setTab(v ?? 'portfolio')}>
        <Tabs.List>
          <Tabs.Tab value="portfolio">{t.investments.tabs.portfolio}</Tabs.Tab>
          <Tabs.Tab value="projection">{t.investments.tabs.projection}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="portfolio" pt="md">
          <SimpleGrid cols={{ base: 2, md: summary.hasMarket ? 4 : 3 }} spacing="xs" mb={6}>
            <KpiCard
              label={t.investments.invested}
              net={summary.today.invested}
              caption={t.investments.titulosCount(heldCount)}
            />
            <KpiCard
              label={`${t.investments.today} · ${t.investments.onCurve}`}
              net={summary.today.net}
              gross={summary.today.gross}
            />
            {summary.hasMarket && (
              <KpiCard
                label={`${t.investments.today} · ${t.investments.atMarketShort}`}
                net={summary.market.net}
                gross={summary.market.gross}
                color="blue"
              />
            )}
            <KpiCard
              label={t.investments.atMaturity}
              net={summary.atMaturity.net}
              gross={summary.atMaturity.gross}
            />
          </SimpleGrid>
          <Text size="xs" c="dimmed" mb="sm">
            {t.investments.assumptions(
              formatDateBR(assumptions.ratesUntil),
              scenarioText(assumptions.scenario),
            )}
            {summary.hasMarket && priceDate && ` ${t.investments.marketNote(formatDateBR(priceDate))}`}
          </Text>

          <Grid gap="sm" mb="sm">
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <ReturnsCard returns={summary.returns} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <MonthlyCard data={data} />
            </Grid.Col>
          </Grid>

          {rows.length === 0 ? (
            <Paper>
              <Text c="dimmed" ta="center">
                {t.investments.empty}
              </Text>
            </Paper>
          ) : (
            <>
              {summary.hasMarket && (
                <Text size="xs" c="dimmed" mb={4}>
                  {t.investments.twoLines}
                </Text>
              )}
              {isMobile ? (
                <Stack gap="xs">
                  {rows.map((row) => (
                    <Paper
                      key={row.titulo.id}
                      p="sm"
                      onClick={() => open(row.titulo.id)}
                      style={{ cursor: 'pointer', opacity: row.matured ? 0.6 : 1 }}
                    >
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Text fw={500} truncate>
                            {row.titulo.name}
                          </Text>
                          <Text size="xs" c="dimmed" component="div">
                            <MaturityCell row={row} />
                          </Text>
                        </Stack>
                        <CurveMarket curve={formatBRL(row.today.net)} market={marketOf(row, 'net')} />
                      </Group>
                      <Text size="xs" c="dimmed" mt={4}>
                        {t.investments.sincePurchase}: {perYearText(row.returns.sincePurchase.net)} ·{' '}
                        {t.investments.toMaturity}: {perYearText(row.returns.toMaturity.net)}
                      </Text>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Paper p={0}>
                  <Table.ScrollContainer minWidth={1050}>
                    <Table highlightOnHover verticalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t.investments.name}</Table.Th>
                          <Table.Th>{t.investments.maturity}</Table.Th>
                          <Table.Th ta="right">{t.investments.invested}</Table.Th>
                          <Table.Th ta="right">{t.investments.grossToday}</Table.Th>
                          <Table.Th ta="right">{t.investments.netToday}</Table.Th>
                          <Table.Th ta="right">{t.investments.irToday}</Table.Th>
                          <Table.Th ta="right">
                            {t.investments.sincePurchase}
                            <Text size="xs" c="dimmed" fw={400}>
                              {t.investments.netShort}
                            </Text>
                          </Table.Th>
                          <Table.Th ta="right">{t.investments.netAtMaturity}</Table.Th>
                          <Table.Th ta="right">
                            {t.investments.toMaturity}
                            <Text size="xs" c="dimmed" fw={400}>
                              {t.investments.netShort} / {t.investments.grossShort}
                            </Text>
                          </Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {rows.map((row) => (
                          <Table.Tr
                            key={row.titulo.id}
                            onClick={() => open(row.titulo.id)}
                            style={{ cursor: 'pointer', opacity: row.matured ? 0.6 : 1 }}
                          >
                            <Table.Td>
                              <Text size="sm">{row.titulo.name}</Text>
                              {describeTerms(row.titulo) && (
                                <Text size="xs" c="dimmed">
                                  {describeTerms(row.titulo)}
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" component="div">
                                <MaturityCell row={row} />
                              </Text>
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                                {formatBRL(row.today.invested)}
                              </Text>
                            </Table.Td>
                            <Table.Td ta="right">
                              <CurveMarket
                                curve={formatBRL(row.today.gross)}
                                market={marketOf(row, 'gross')}
                              />
                            </Table.Td>
                            <Table.Td ta="right">
                              <CurveMarket curve={formatBRL(row.today.net)} market={marketOf(row, 'net')} />
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text size="sm">{irRateText(row)}</Text>
                            </Table.Td>
                            <Table.Td ta="right">
                              <CurveMarket
                                curve={perYearText(row.returns.sincePurchase.net)}
                                market={
                                  row.returns.sincePurchase.marketNet
                                    ? perYearText(row.returns.sincePurchase.marketNet)
                                    : null
                                }
                              />
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                                {row.atMaturity ? formatBRL(row.atMaturity.net) : '—'}
                              </Text>
                            </Table.Td>
                            <Table.Td ta="right">
                              <Stack gap={0} align="flex-end">
                                <Text size="sm">{perYearText(row.returns.toMaturity.net)}</Text>
                                <Text size="xs" c="dimmed">
                                  {perYearText(row.returns.toMaturity.gross)}
                                </Text>
                              </Stack>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </Paper>
              )}
            </>
          )}
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm" mt="sm">
            <DistributionCharts summary={summary} />
            <PricesCard prices={data.priceFile} live={data.livePrices} />
          </SimpleGrid>
        </Tabs.Panel>
        <Tabs.Panel value="projection">{tab === 'projection' && <ProjectionPanel data={data} />}</Tabs.Panel>
      </Tabs>

      <Modal
        opened={creating}
        onClose={() => setCreating(false)}
        title={t.investments.newTitulo}
        fullScreen={isMobile}
        size="lg"
      >
        {creating && (
          <TituloForm
            editing={null}
            onDone={(id) => {
              setCreating(false);
              if (id) open(id);
            }}
          />
        )}
      </Modal>
    </>
  );
}
