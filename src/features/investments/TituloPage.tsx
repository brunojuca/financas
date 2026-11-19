import {
  ActionIcon,
  Anchor,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCash, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Money } from '../../components/common';
import { formatDateBR } from '../../domain/dates';
import type { ValueSums } from '../../domain/fixedIncome/portfolio';
import { incomeTaxRate } from '../../domain/fixedIncome/tax';
import { isPricedTesouro, isTaxExempt, usesUnits, type Lot } from '../../domain/fixedIncome/types';
import { formatBRL, formatPercent } from '../../domain/money';
import { t } from '../../i18n/pt-BR';
import { deleteLot, deleteRedemption, deleteTitulo } from '../../storage/repo';
import { describeTerms, formatPercentShort, formatQuantity, formatUnitPrice, perYearText } from './format';
import { MonthlyCard } from './MonthlyCard';
import { CurveMarket, ReturnsCard } from './ReturnsParts';
import { LotForm, RedemptionForm } from './MovementForms';
import { TituloForm } from './TituloForm';
import { useInvestments } from './useInvestments';

type Dialog = { kind: 'edit' } | { kind: 'lot'; lot: Lot | null } | { kind: 'redemption' };

/** "IR (17,5%)": the rate actually applied (IR ÷ taxable income after IOF). */
function irLabel(sums: ValueSums): string {
  const base = sums.gross - sums.invested - sums.iof;
  if (sums.ir <= 0 || base <= 0) return t.investments.ir;
  return t.investments.irWithRate(formatPercentShort(Math.round((sums.ir / base) * 1000) / 1000));
}

function Breakdown({ title, sums }: { title: string; sums: ValueSums }) {
  const line = (label: string, cents: number, strong = false) => (
    <Group justify="space-between">
      <Text size="sm" fw={strong ? 700 : undefined}>
        {label}
      </Text>
      <Money cents={cents} colored={false} size="sm" fw={strong ? 700 : undefined} />
    </Group>
  );
  return (
    <Paper>
      <Text fw={600} mb="xs">
        {title}
      </Text>
      <Stack gap={4}>
        {line(t.investments.invested, sums.invested)}
        {line(t.investments.gross, sums.gross)}
        {line(t.investments.grossIncome, sums.gross - sums.invested)}
        {sums.custody > 0 && line(t.investments.custody, -sums.custody)}
        {sums.iof > 0 && line(t.investments.iof, -sums.iof)}
        {line(irLabel(sums), -sums.ir)}
        {line(t.investments.net, sums.net, true)}
      </Stack>
    </Paper>
  );
}

export function TituloPage() {
  const { id } = useParams();
  const data = useInvestments();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const navigate = useNavigate();
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  const row = data.summary.rows.find((r) => r.titulo.id === id);
  if (!row) return <Navigate to="/investimentos" replace />;
  const { titulo } = row;
  const priced = isPricedTesouro(titulo.product);
  const units = usesUnits(titulo.product);
  const lots = data.lots.filter((l) => l.tituloId === titulo.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const redemptions = data.redemptions
    .filter((r) => r.tituloId === titulo.id)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const current = new Map(row.lots.map((l) => [l.lot.id, l]));

  const confirm = (title: string, text: string, action: () => Promise<void>) =>
    modals.openConfirmModal({
      title,
      children: <Text size="sm">{text}</Text>,
      labels: { confirm: t.common.delete, cancel: t.common.cancel },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await action();
        notifications.show({ message: t.investments.deleted });
      },
    });

  const removeLot = (lot: Lot) => {
    if (lots.length === 1) {
      notifications.show({ color: 'yellow', message: t.investments.lastPurchaseCannotBeDeleted });
      return;
    }
    confirm(t.investments.deleteLotTitle, t.transactions.deleteText, () => deleteLot(lot.id));
  };

  return (
    <>
      <Anchor component={Link} to="/investimentos" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} />
          {t.investments.back}
        </Group>
      </Anchor>
      <Group justify="space-between" mt="xs" mb="md" gap="sm">
        <div>
          <Title order={2}>{titulo.name}</Title>
          <Text c="dimmed" size="sm">
            {describeTerms(titulo) || t.investments.products[titulo.product]} ·{' '}
            {titulo.maturity
              ? `${t.investments.maturity} ${formatDateBR(titulo.maturity)}`
              : t.investments.dailyLiquidity}
            {row.quantity !== null && ` · ${t.investments.held(formatQuantity(row.quantity))}`}
            {` · ${t.investments.toMaturity}: ${perYearText(row.returns.toMaturity.net)} ${t.investments.netShort}`}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            size="xs"
            leftSection={<IconPlus size={16} />}
            onClick={() => setDialog({ kind: 'lot', lot: null })}
            disabled={row.matured}
          >
            {t.investments.newPurchase}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconCash size={16} />}
            onClick={() => setDialog({ kind: 'redemption' })}
            disabled={row.lots.length === 0 || row.matured}
          >
            {t.investments.newRedemption}
          </Button>
          <ActionIcon
            variant="default"
            aria-label={t.common.edit}
            onClick={() => setDialog({ kind: 'edit' })}
          >
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon
            variant="default"
            color="red"
            aria-label={t.common.delete}
            onClick={() =>
              confirm(t.investments.deleteTitle, t.investments.deleteText, async () => {
                await deleteTitulo(titulo.id);
                navigate('/investimentos');
              })
            }
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: row.market ? 3 : 2 }} mb="xs" spacing="sm">
        {row.market && row.priceDate && (
          <Breakdown title={t.investments.ifSoldToday(formatDateBR(row.priceDate))} sums={row.market} />
        )}
        <Breakdown
          title={priced ? t.investments.curveToday : t.investments.ifRedeemedToday}
          sums={row.today}
        />
        {row.atMaturity && !row.matured && (
          <Breakdown title={t.investments.atMaturity} sums={row.atMaturity} />
        )}
      </SimpleGrid>
      {row.holdRate !== null && (
        <Text size="sm" c="dimmed" mb="sm">
          {t.investments.holdVsSell(formatPercent(row.holdRate))}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm" mb="md">
        <ReturnsCard returns={row.returns} />
        <MonthlyCard data={data} tituloId={titulo.id} />
      </SimpleGrid>

      <Title order={4} mb="xs">
        {t.investments.purchases}
      </Title>
      {row.market && (
        <Text size="xs" c="dimmed" mb={4}>
          {t.investments.twoLines}
        </Text>
      )}
      <Paper p={0} mb="md">
        <Table.ScrollContainer minWidth={1100}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t.transactions.date}</Table.Th>
                {units && <Table.Th ta="right">{t.investments.quantity}</Table.Th>}
                {priced && <Table.Th ta="right">{t.investments.rate}</Table.Th>}
                <Table.Th ta="right">{t.investments.invested}</Table.Th>
                <Table.Th ta="right">{t.investments.daysHeld}</Table.Th>
                <Table.Th ta="right">{t.investments.gross}</Table.Th>
                <Table.Th ta="right">{t.investments.irRate}</Table.Th>
                <Table.Th ta="right">{t.investments.ir}</Table.Th>
                <Table.Th ta="right">{t.investments.iof}</Table.Th>
                <Table.Th ta="right">{t.investments.custodyShort}</Table.Th>
                <Table.Th ta="right">{t.investments.net}</Table.Th>
                <Table.Th w={70} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lots.map((lot) => {
                const held = current.get(lot.id);
                const curve = held?.today;
                const mkt = held?.market ?? null;
                const pair = (key: 'gross' | 'ir' | 'iof' | 'custody' | 'net') =>
                  curve ? (
                    <CurveMarket curve={formatBRL(curve[key])} market={mkt ? formatBRL(mkt[key]) : null} />
                  ) : (
                    '—'
                  );
                const days = (mkt ?? curve)?.calendarDays;
                return (
                  <Table.Tr key={lot.id}>
                    <Table.Td>{formatDateBR(lot.date)}</Table.Td>
                    {units && (
                      <Table.Td ta="right">
                        {lot.quantity !== null ? formatQuantity(lot.quantity) : '—'}
                        {lot.unitPrice !== null && (
                          <Text size="xs" c="dimmed">
                            {formatUnitPrice(lot.unitPrice)}
                          </Text>
                        )}
                      </Table.Td>
                    )}
                    {priced && (
                      <Table.Td ta="right">{held?.rate != null ? formatPercent(held.rate) : '—'}</Table.Td>
                    )}
                    <Table.Td ta="right">
                      <Money cents={lot.amountCents} colored={false} size="sm" />
                    </Table.Td>
                    <Table.Td ta="right">{days ?? '—'}</Table.Td>
                    <Table.Td ta="right">{pair('gross')}</Table.Td>
                    <Table.Td ta="right">
                      {days === undefined || isTaxExempt(titulo.product)
                        ? '—'
                        : formatPercentShort(incomeTaxRate(days))}
                    </Table.Td>
                    <Table.Td ta="right">{pair('ir')}</Table.Td>
                    <Table.Td ta="right">{pair('iof')}</Table.Td>
                    <Table.Td ta="right">{pair('custody')}</Table.Td>
                    <Table.Td ta="right">{pair('net')}</Table.Td>
                    <Table.Td>
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          aria-label={t.common.edit}
                          onClick={() => setDialog({ kind: 'lot', lot })}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t.common.delete}
                          onClick={() => removeLot(lot)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {redemptions.length > 0 && (
        <>
          <Title order={4} mb="xs">
            {t.investments.redemptions}
          </Title>
          <Paper p={0} mb="md">
            <Table verticalSpacing="xs">
              <Table.Tbody>
                {redemptions.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>{formatDateBR(r.date)}</Table.Td>
                    <Table.Td ta="right">
                      {r.quantity !== null ? (
                        t.investments.held(formatQuantity(r.quantity))
                      ) : (
                        <Money cents={r.grossCents ?? 0} colored={false} size="sm" />
                      )}
                    </Table.Td>
                    <Table.Td w={40}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={t.common.delete}
                        onClick={() =>
                          confirm(t.investments.deleteRedemptionTitle, t.transactions.deleteText, () =>
                            deleteRedemption(r.id),
                          )
                        }
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      <Modal
        opened={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog?.kind === 'edit'
            ? t.investments.editTitulo
            : dialog?.kind === 'redemption'
              ? t.investments.newRedemption
              : t.investments.newPurchase
        }
        fullScreen={isMobile}
        size="lg"
      >
        {dialog?.kind === 'edit' && <TituloForm editing={titulo} onDone={() => setDialog(null)} />}
        {dialog?.kind === 'lot' && (
          <LotForm titulo={titulo} editing={dialog.lot} onDone={() => setDialog(null)} />
        )}
        {dialog?.kind === 'redemption' && (
          <RedemptionForm
            titulo={titulo}
            lots={lots}
            redemptions={redemptions}
            market={data.market}
            onDone={() => setDialog(null)}
          />
        )}
      </Modal>
    </>
  );
}
