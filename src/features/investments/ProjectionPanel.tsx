import {
  Button,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Chart, type ChartOption } from '../../components/Chart';
import { axisMoney, tooltipMoney, useChartColor } from '../../components/chartFormat';
import { formatDateBR } from '../../domain/dates';
import type { Scenario } from '../../domain/fixedIncome/focus';
import { projectPortfolio } from '../../domain/fixedIncome/projection';
import { formatPercent, fromCents } from '../../domain/money';
import { t } from '../../i18n/pt-BR';
import { saveScenario, updateReferenceData } from '../../storage/referenceUpdates';
import { choiceOf, type ScenarioChoice } from './scenario';
import type { InvestmentsData } from './useInvestments';

const SOURCE_NAMES: Record<string, string> = {
  selic: 'Selic',
  cdi: 'CDI',
  selicMeta: 'meta Selic',
  ipca: 'IPCA',
  focus: 'Focus',
  tesouroLive: 'preços do Tesouro Direto',
};

function AssumptionsCard({ data }: { data: InvestmentsData }) {
  const { assumptions, fetchedAt } = data;
  const [busy, setBusy] = useState(false);
  const scenario = assumptions.scenario;
  const choice = choiceOf(scenario);

  const choose = (value: string) => {
    const next: Scenario =
      value === 'custom'
        ? {
            kind: 'custom',
            selic: assumptions.years[1]?.selic ?? 0.1,
            ipca: assumptions.years[1]?.ipca ?? 0.04,
          }
        : {
            kind: 'focus',
            selicShift: value === 'up' ? 0.01 : value === 'down' ? -0.01 : 0,
            ipcaShift: value === 'up' ? 0.01 : value === 'down' ? -0.01 : 0,
          };
    void saveScenario(next);
  };
  const setCustom = (field: 'selic' | 'ipca', value: number | string) => {
    if (scenario.kind !== 'custom' || typeof value !== 'number') return;
    void saveScenario({ ...scenario, [field]: value / 100 });
  };
  const update = async () => {
    setBusy(true);
    const { failed } = await updateReferenceData();
    setBusy(false);
    notifications.show(
      failed.length
        ? {
            color: 'yellow',
            message: t.investments.updateFailed(failed.map((f) => SOURCE_NAMES[f]).join(', ')),
          }
        : { color: 'teal', message: t.investments.updated },
    );
  };

  return (
    <Paper>
      <Stack gap="sm">
        <div>
          <Text fw={600}>{t.investments.scenarioLabel}</Text>
          <Text size="xs" c="dimmed">
            {t.investments.scenarioHint}
          </Text>
        </div>
        <SegmentedControl
          fullWidth
          value={choice}
          onChange={choose}
          data={(Object.keys(t.investments.scenarios) as ScenarioChoice[]).map((value) => ({
            value,
            label: t.investments.scenarios[value],
          }))}
        />
        {scenario.kind === 'custom' && (
          <Group grow>
            <NumberInput
              label={t.investments.customSelic}
              defaultValue={scenario.selic * 100}
              decimalSeparator=","
              decimalScale={2}
              suffix=" %"
              hideControls
              onChange={(v) => setCustom('selic', v)}
            />
            <NumberInput
              label={t.investments.customIpca}
              defaultValue={scenario.ipca * 100}
              decimalSeparator=","
              decimalScale={2}
              suffix=" %"
              hideControls
              onChange={(v) => setCustom('ipca', v)}
            />
          </Group>
        )}
        <Table verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t.investments.yearTable.year}</Table.Th>
              <Table.Th ta="right">{t.investments.yearTable.selic}</Table.Th>
              <Table.Th ta="right">{t.investments.yearTable.ipca}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {assumptions.years.map((y) => (
              <Table.Tr key={y.year}>
                <Table.Td>{y.year}</Table.Td>
                <Table.Td ta="right">{formatPercent(y.selic)}</Table.Td>
                <Table.Td ta="right">{formatPercent(y.ipca)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed">
          {t.investments.dataStatus(
            formatDateBR(assumptions.ratesUntil),
            `${assumptions.ipcaUntil.slice(5)}/${assumptions.ipcaUntil.slice(0, 4)}`,
            formatDateBR(assumptions.focus.date),
          )}{' '}
          {fetchedAt
            ? t.investments.lastDownload(new Date(fetchedAt).toLocaleString('pt-BR'))
            : t.investments.neverDownloaded}
        </Text>
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {t.investments.privacyNote}
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={16} />}
            loading={busy}
            onClick={() => void update()}
          >
            {t.investments.update}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export function ProjectionPanel({ data }: { data: InvestmentsData }) {
  const color = useChartColor();
  const projection = useMemo(
    () => projectPortfolio(data.summary, data.today, data.market),
    [data.summary, data.today, data.market],
  );
  const hasPositions = data.summary.rows.some((r) => !r.matured);

  const labels = projection.points.map((p, i) => (i === 0 ? formatDateBR(p.date) : p.date.slice(0, 4)));
  const valueChart: ChartOption = {
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0 },
    tooltip: { trigger: 'axis', valueFormatter: tooltipMoney },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value', axisLabel: { formatter: axisMoney }, scale: true },
    series: [
      {
        name: t.investments.nominal,
        type: 'line',
        areaStyle: { opacity: 0.12 },
        data: projection.points.map((p) => fromCents(p.total)),
        color: color('cyan'),
      },
      {
        name: t.investments.real,
        type: 'line',
        data: projection.points.map((p) => fromCents(p.totalReal)),
        color: color('grape'),
      },
    ],
  };
  const maturityChart: ChartOption = {
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: tooltipMoney },
    xAxis: { type: 'category', data: projection.maturities.map((m) => String(m.year)) },
    yAxis: { type: 'value', axisLabel: { formatter: axisMoney } },
    series: [
      {
        name: t.investments.net,
        type: 'bar',
        data: projection.maturities.map((m) => fromCents(m.net)),
        color: color('teal'),
      },
    ],
  };

  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" mt="md">
      <Stack gap="md">
        {hasPositions ? (
          <>
            <Paper>
              <Title order={5}>{t.investments.projectionTitle}</Title>
              <Text size="xs" c="dimmed" mb="xs">
                {t.investments.projectionHint}
              </Text>
              <Chart option={valueChart} aria-label={t.investments.projectionTitle} />
              {projection.realRate !== null && (
                <Text size="sm" mt="xs">
                  {t.investments.realReturn}:{' '}
                  <b>
                    {formatPercent(projection.realRate)} {t.investments.perYear}
                  </b>
                </Text>
              )}
            </Paper>
            {projection.maturities.length > 0 && (
              <Paper>
                <Title order={5} mb="xs">
                  {t.investments.maturitiesTitle}
                </Title>
                <Chart option={maturityChart} aria-label={t.investments.maturitiesTitle} height={220} />
              </Paper>
            )}
          </>
        ) : (
          <Paper>
            <Text c="dimmed" ta="center">
              {t.investments.noProjection}
            </Text>
          </Paper>
        )}
      </Stack>
      <AssumptionsCard data={data} />
    </SimpleGrid>
  );
}
