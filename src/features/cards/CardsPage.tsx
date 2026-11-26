import {
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart, type ChartOption } from '../../components/Chart';
import { axisMoney, tooltipMoney, useChartColor } from '../../components/chartFormat';
import { Money, PageHeader } from '../../components/common';
import { MoneyInput } from '../../components/MoneyInput';
import {
  billStatements,
  currentBill,
  isCardPayment,
  limitUsed,
  type BillStatement,
} from '../../domain/cashflow/creditCard';
import { addMonths, formatDateBR, formatMonthShort, isIsoDate, todayIso } from '../../domain/dates';
import { formatBRL, fromCents } from '../../domain/money';
import { findTransferCategory } from '../../domain/seed';
import type { Account, CardSettings, YearMonth } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { saveTransfer } from '../../storage/repo';
import { useFinanceData, type FinanceData } from '../../storage/useFinanceData';

type Status = keyof typeof t.cards.statuses;
const STATUS_COLOR: Record<Status, string> = {
  future: 'gray',
  open: 'blue',
  closed: 'yellow',
  paid: 'teal',
  partial: 'orange',
  overdue: 'red',
};

/** Domain status, with bills after the open one shown as "Futura". */
function statusOf(bill: BillStatement, open: YearMonth): Status {
  return bill.status === 'open' && bill.month > open ? 'future' : bill.status;
}

function StatusBadge({ bill, open }: { bill: BillStatement; open: YearMonth }) {
  const status = statusOf(bill, open);
  return (
    <Badge size="sm" variant="light" color={STATUS_COLOR[status]}>
      {t.cards.statuses[status]}
    </Badge>
  );
}

function PayBillForm({
  data,
  account,
  card,
  bill,
  onDone,
}: {
  data: FinanceData;
  account: Account;
  card: CardSettings;
  bill: BillStatement;
  onDone: () => void;
}) {
  const payers = data.accounts
    .filter((a) => !a.archived && a.type !== 'creditCard')
    .map((a) => ({ value: a.id, label: a.name }));
  const [from, setFrom] = useState<string | null>(card.payingAccountId ?? payers[0]?.value ?? null);
  const [amount, setAmount] = useState<number | null>(Math.max(0, bill.remaining) || null);
  const [date, setDate] = useState<string | null>(todayIso());

  const pay = async () => {
    const transferCategory = findTransferCategory(data.categories);
    if (!from || !amount || amount <= 0 || !isIsoDate(date) || !transferCategory) return;
    await saveTransfer({
      date,
      description: t.cards.payDescription(formatMonthShort(bill.month)),
      amountCents: amount,
      fromAccountId: from,
      toAccountId: account.id,
      transferCategoryId: transferCategory.id,
      // A payment made here always pays this bill, whatever its date.
      billMonths: { to: bill.month },
    });
    notifications.show({ color: 'teal', message: t.cards.paid });
    onDone();
  };

  return (
    <Stack>
      <Select label={t.cards.payFrom} data={payers} value={from} onChange={setFrom} allowDeselect={false} />
      <MoneyInput
        label={t.cards.payAmount}
        description={t.cards.payHint}
        value={amount}
        onChange={setAmount}
      />
      <DateInput label={t.cards.payDate} valueFormat="DD/MM/YYYY" value={date} onChange={setDate} />
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button onClick={() => void pay()} disabled={!from || !amount || !isIsoDate(date)}>
          {t.cards.pay}
        </Button>
      </Group>
    </Stack>
  );
}

function BillDetail({ data, bill }: { data: FinanceData; bill: BillStatement }) {
  const line = (label: string, cents: number, strong = false) => (
    <Group justify="space-between">
      <Text size="sm" fw={strong ? 700 : undefined}>
        {label}
      </Text>
      <Money cents={cents} colored={false} size="sm" fw={strong ? 700 : undefined} />
    </Group>
  );
  return (
    <Stack>
      <Paper withBorder p="sm">
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {t.cards.closesOn(formatDateBR(bill.closing))} · {t.cards.dueOn(formatDateBR(bill.due))}
          </Text>
          {line(t.cards.previous, bill.previous)}
          {line(t.cards.purchases, bill.purchases)}
          {line(t.cards.total, bill.total, true)}
          {line(t.cards.payments, -bill.payments)}
          {line(t.cards.remaining, bill.remaining, true)}
        </Stack>
      </Paper>
      <Text fw={600}>{t.cards.entries}</Text>
      <Table verticalSpacing={4}>
        <Table.Tbody>
          {bill.transactions.map((tx) => (
            <Table.Tr key={tx.id}>
              <Table.Td>
                <Text size="sm">{formatDateBR(tx.date)}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{tx.description}</Text>
                <Text size="xs" c="dimmed">
                  {isCardPayment(tx, data.categoryIndex)
                    ? t.cards.payments
                    : (data.categoryIndex.get(tx.categoryId ?? '')?.name ?? t.transactions.uncategorized)}
                </Text>
              </Table.Td>
              <Table.Td ta="right">
                <Money cents={-tx.amountCents} colored={false} size="sm" />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function CardView({ data, account }: { data: FinanceData; account: Account }) {
  const color = useChartColor();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [dialog, setDialog] = useState<{ kind: 'view' | 'pay'; bill: BillStatement } | null>(null);
  const today = todayIso();
  const card = account.creditCard;
  const cardTxs = useMemo(
    () => data.transactions.filter((tx) => tx.accountId === account.id),
    [data.transactions, account.id],
  );
  const open = card ? currentBill(card, today) : null;
  const bills = useMemo(
    () => (card && open ? billStatements(card, cardTxs, data.categoryIndex, today, open) : []),
    [card, open, cardTxs, data.categoryIndex, today],
  );
  const [selected, setSelected] = useState<YearMonth | null>(null);

  if (!card || !open) {
    return (
      <Alert color="yellow" mt="md">
        <Group justify="space-between">
          <Text size="sm">{t.cards.notConfigured}</Text>
          <Anchor component={Link} to="/contas" size="sm">
            {t.cards.goToAccounts}
          </Anchor>
        </Group>
      </Alert>
    );
  }

  const openBill = bills.find((b) => b.month === open);
  const toPay = bills.filter((b) => b.month < open && b.remaining > 0).at(-1) ?? null;
  const used = limitUsed(cardTxs);
  const shown = bills.filter((b) => b.month >= addMonths(open, -12));
  const focus = bills.find((b) => b.month === (selected ?? open)) ?? openBill ?? null;

  // Purchases per category in the focused bill.
  const byCategory = new Map<string, number>();
  for (const tx of focus?.transactions ?? []) {
    if (isCardPayment(tx, data.categoryIndex)) continue;
    const category = data.categoryIndex.get(tx.categoryId ?? '');
    const top = category?.parentId ? data.categoryIndex.get(category.parentId) : category;
    const name = top?.name ?? t.transactions.uncategorized;
    byCategory.set(name, (byCategory.get(name) ?? 0) - tx.amountCents);
  }
  const categoryData = [...byCategory]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value: fromCents(value) }));

  const billsChart: ChartOption = {
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: tooltipMoney },
    xAxis: { type: 'category', data: shown.map((b) => formatMonthShort(b.month)) },
    yAxis: { type: 'value', axisLabel: { formatter: axisMoney } },
    series: [
      {
        name: t.cards.purchases,
        type: 'bar',
        data: shown.map((b) => ({
          value: fromCents(b.purchases),
          itemStyle: { color: color('indigo'), opacity: b.month >= open ? 0.45 : 1 },
        })),
      },
    ],
  };
  const donut: ChartOption = {
    tooltip: { trigger: 'item', valueFormatter: tooltipMoney },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle' },
    series: [
      {
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['30%', '50%'],
        label: { show: false },
        data: categoryData,
      },
    ],
  };

  return (
    <Stack mt="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <Paper>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t.cards.openBill} · {formatMonthShort(open)}
          </Text>
          <Money cents={openBill?.total ?? 0} colored={false} size="xl" fw={700} />
          <Text size="xs" c="dimmed">
            {t.cards.closesOn(formatDateBR(openBill?.closing ?? ''))} ·{' '}
            {t.cards.dueOn(formatDateBR(openBill?.due ?? ''))}
          </Text>
        </Paper>
        <Paper>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t.cards.nextDue}
            {toPay && ` · ${formatMonthShort(toPay.month)}`}
          </Text>
          {toPay ? (
            <>
              <Group justify="space-between" align="flex-end">
                <Money cents={toPay.remaining} colored={false} size="xl" fw={700} />
                <Button size="xs" onClick={() => setDialog({ kind: 'pay', bill: toPay })}>
                  {t.cards.pay}
                </Button>
              </Group>
              <Group gap={6}>
                <Text size="xs" c="dimmed">
                  {t.cards.dueOn(formatDateBR(toPay.due))}
                </Text>
                <StatusBadge bill={toPay} open={open} />
              </Group>
            </>
          ) : (
            <Text size="sm" mt={6}>
              {t.cards.noBillDue}
            </Text>
          )}
        </Paper>
        <Paper>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {t.cards.limit}
          </Text>
          {card.limitCents ? (
            <>
              <Text size="xl" fw={700}>
                {formatBRL(card.limitCents)}
              </Text>
              <Progress value={Math.min(100, (used / card.limitCents) * 100)} mt={4} />
              <Text size="xs" c="dimmed" mt={2}>
                {t.cards.limitUsed(formatBRL(used))} ·{' '}
                {t.cards.limitAvailable(formatBRL(card.limitCents - used))}
              </Text>
            </>
          ) : (
            <>
              <Text size="xl" fw={700}>
                {t.cards.limitUsed(formatBRL(used))}
              </Text>
              <Text size="xs" c="dimmed">
                {t.cards.noLimit}
              </Text>
            </>
          )}
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
        <Paper>
          <Title order={5}>{t.cards.billsChart}</Title>
          <Text size="xs" c="dimmed" mb="xs">
            {t.cards.billsChartHint}
          </Text>
          <Chart option={billsChart} aria-label={t.cards.billsChart} height={240} />
        </Paper>
        <Paper>
          <Title order={5} mb="xs">
            {t.cards.byCategory(formatMonthShort(focus?.month ?? open))}
          </Title>
          {categoryData.length ? (
            <Chart
              option={donut}
              aria-label={t.cards.byCategory(formatMonthShort(focus?.month ?? open))}
              height={240}
            />
          ) : (
            <Center h={240}>
              <Text c="dimmed">{t.cards.noPurchases}</Text>
            </Center>
          )}
        </Paper>
      </SimpleGrid>

      <Title order={4}>{t.cards.bills}</Title>
      <Paper p={0}>
        <Table.ScrollContainer minWidth={900}>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t.cards.month}</Table.Th>
                <Table.Th>{t.cards.due}</Table.Th>
                <Table.Th ta="right">{t.cards.previous}</Table.Th>
                <Table.Th ta="right">{t.cards.purchases}</Table.Th>
                <Table.Th ta="right">{t.cards.total}</Table.Th>
                <Table.Th ta="right">{t.cards.payments}</Table.Th>
                <Table.Th ta="right">{t.cards.remaining}</Table.Th>
                <Table.Th>{t.cards.status}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...shown].reverse().map((bill) => (
                <Table.Tr
                  key={bill.month}
                  onClick={() => setSelected(bill.month)}
                  style={{ cursor: 'pointer' }}
                  bg={bill.month === focus?.month ? 'var(--mantine-color-default-hover)' : undefined}
                >
                  <Table.Td fw={600}>{formatMonthShort(bill.month)}</Table.Td>
                  <Table.Td>{formatDateBR(bill.due)}</Table.Td>
                  <Table.Td ta="right">
                    <Money cents={bill.previous} colored={false} size="sm" />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Money cents={bill.purchases} colored={false} size="sm" />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Money cents={bill.total} colored={false} size="sm" fw={600} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Money cents={bill.payments} colored={false} size="sm" />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Money cents={bill.remaining} colored={false} size="sm" />
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge bill={bill} open={open} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDialog({ kind: 'view', bill });
                        }}
                      >
                        {t.cards.view}
                      </Button>
                      {bill.remaining > 0 && bill.month <= open && (
                        <Button
                          size="compact-xs"
                          variant="light"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialog({ kind: 'pay', bill });
                          }}
                        >
                          {t.cards.pay}
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal
        opened={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog
            ? dialog.kind === 'pay'
              ? t.cards.payTitle(formatMonthShort(dialog.bill.month))
              : t.cards.billTitle(formatMonthShort(dialog.bill.month), account.name)
            : ''
        }
        fullScreen={isMobile}
        size="lg"
      >
        {dialog?.kind === 'view' && <BillDetail data={data} bill={dialog.bill} />}
        {dialog?.kind === 'pay' && (
          <PayBillForm
            data={data}
            account={account}
            card={card}
            bill={dialog.bill}
            onDone={() => setDialog(null)}
          />
        )}
      </Modal>
    </Stack>
  );
}

export function CardsPage() {
  const data = useFinanceData();
  const [cardId, setCardId] = useState<string | null>(null);
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  const cards = data.accounts.filter((a) => a.type === 'creditCard' && !a.archived);
  const account = cards.find((a) => a.id === cardId) ?? cards[0];
  return (
    <>
      <PageHeader title={t.nav.cards}>
        {cards.length > 1 && (
          <SegmentedControl
            value={account?.id}
            onChange={setCardId}
            data={cards.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
      </PageHeader>
      {account ? (
        <CardView key={account.id} data={data} account={account} />
      ) : (
        <Paper>
          <Text c="dimmed" ta="center">
            {t.cards.empty}
          </Text>
        </Paper>
      )}
    </>
  );
}
