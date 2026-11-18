import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconRepeat, IconSearch, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Money, MonthSwitcher, PageHeader } from '../../components/common';
import { accountOptions, categoryOptions, pendingRecurringCount } from '../../components/options';
import { isTransfer } from '../../domain/cashflow/summary';
import { currentMonth, dateInMonth, formatDateBR, monthOf, parseIsoDate, todayIso } from '../../domain/dates';
import type { Transaction, YearMonth } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { deleteTransaction, generateRecurringForMonth } from '../../storage/repo';
import { useFinanceData, type FinanceData } from '../../storage/useFinanceData';
import { TransactionForm } from './TransactionForm';

interface Row {
  tx: Transaction;
  title: string;
  detail: string;
  accountLabel: string;
  isTransfer: boolean;
}

function buildRows(
  data: FinanceData,
  month: YearMonth,
  accountId: string | null,
  categoryId: string | null,
  search: string,
) {
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const legsByTransfer = new Map<string, Transaction[]>();
  for (const tx of data.transactions) {
    if (tx.transferId) legsByTransfer.set(tx.transferId, [...(legsByTransfer.get(tx.transferId) ?? []), tx]);
  }
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const rows: Row[] = [];
  for (const tx of data.transactions) {
    if (monthOf(tx.date) !== month) continue;
    if (accountId && tx.accountId !== accountId) continue;
    if (categoryId && tx.categoryId !== categoryId) continue;
    if (query && !tx.description.toLocaleLowerCase('pt-BR').includes(query)) continue;
    const transfer = isTransfer(tx, data.categoryIndex);
    let accountLabel = accountName.get(tx.accountId) ?? '';
    if (tx.transferId) {
      // Without an account filter, show each transfer once (from its outgoing leg).
      if (!accountId && tx.amountCents > 0) continue;
      const other = legsByTransfer.get(tx.transferId)?.find((l) => l.id !== tx.id);
      const otherName = other ? (accountName.get(other.accountId) ?? '') : '';
      accountLabel = tx.amountCents < 0 ? `${accountLabel} → ${otherName}` : `${otherName} → ${accountLabel}`;
    }
    const category = data.categoryIndex.get(tx.categoryId)?.name ?? '';
    const sub = tx.subcategoryId ? data.categoryIndex.get(tx.subcategoryId)?.name : undefined;
    rows.push({
      tx,
      title: tx.description || category,
      detail: sub ? `${category} › ${sub}` : category,
      accountLabel,
      isTransfer: transfer,
    });
  }
  rows.sort((a, b) =>
    a.tx.date < b.tx.date ? 1 : a.tx.date > b.tx.date ? -1 : a.title.localeCompare(b.title, 'pt-BR'),
  );
  return rows;
}

function Badges({ row }: { row: Row }) {
  return (
    <>
      {row.tx.transferId && (
        <Badge size="xs" variant="light" color="gray">
          {t.transactions.transferBadge}
        </Badge>
      )}
      {row.tx.recurringId && (
        <Badge size="xs" variant="light" leftSection={<IconRepeat size={10} />}>
          {t.transactions.recurringBadge}
        </Badge>
      )}
    </>
  );
}

export function TransactionsPage() {
  const data = useFinanceData();
  const [month, setMonth] = useState(currentMonth());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Transaction | null | 'new'>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');

  const rows = useMemo(
    () => (data ? buildRows(data, month, accountId, categoryId, search) : []),
    [data, month, accountId, categoryId, search],
  );
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  // With an account filter, show the account's real movement; otherwise ignore transfers.
  const counted = rows.filter((r) => accountId || !r.isTransfer);
  const inflow = counted.reduce((s, r) => s + Math.max(0, r.tx.amountCents), 0);
  const outflow = counted.reduce((s, r) => s + Math.min(0, r.tx.amountCents), 0);
  const pending = pendingRecurringCount(data, month);
  const today = todayIso();
  const defaultDate = monthOf(today) === month ? today : dateInMonth(month, parseIsoDate(today).day);

  const confirmDelete = (tx: Transaction) =>
    modals.openConfirmModal({
      title: t.transactions.deleteTitle,
      children: (
        <Text size="sm">{tx.transferId ? t.transactions.deleteTransferText : t.transactions.deleteText}</Text>
      ),
      labels: { confirm: t.common.delete, cancel: t.common.cancel },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await deleteTransaction(tx);
        notifications.show({ message: t.transactions.deleted });
      },
    });

  return (
    <>
      <PageHeader title={t.nav.transactions}>
        <MonthSwitcher value={month} onChange={setMonth} />
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditing('new')}>
          {t.transactions.new}
        </Button>
      </PageHeader>

      {pending > 0 && (
        <Alert mb="md" icon={<IconRepeat size={18} />}>
          <Group justify="space-between">
            <Text size="sm">{t.dashboard.pendingRecurring(pending)}</Text>
            <Button size="xs" variant="light" onClick={() => void generateRecurringForMonth(month)}>
              {t.dashboard.generateNow}
            </Button>
          </Group>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, xs: 3 }} mb="md" spacing="sm">
        <Select
          placeholder={t.transactions.account}
          data={accountOptions(data.accounts, accountId)}
          value={accountId}
          onChange={setAccountId}
          clearable
        />
        <Select
          placeholder={t.transactions.category}
          data={categoryOptions(data.categories, null, null, categoryId)}
          value={categoryId}
          onChange={setCategoryId}
          clearable
          searchable
        />
        <TextInput
          placeholder={t.transactions.search}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </SimpleGrid>

      <Group mb="sm" gap="lg">
        <Text size="sm">
          {t.transactions.inflow}: <Money cents={inflow} fw={600} />
        </Text>
        <Text size="sm">
          {t.transactions.outflow}: <Money cents={outflow} fw={600} />
        </Text>
      </Group>

      {rows.length === 0 ? (
        <Paper>
          <Text c="dimmed" ta="center">
            {t.transactions.empty}
          </Text>
        </Paper>
      ) : isMobile ? (
        <Stack gap="xs">
          {rows.map((row) => (
            <Paper key={row.tx.id} p="sm" onClick={() => setEditing(row.tx)} style={{ cursor: 'pointer' }}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Group gap={6}>
                    <Text fw={500} truncate>
                      {row.title}
                    </Text>
                    <Badges row={row} />
                  </Group>
                  <Text size="xs" c="dimmed" truncate>
                    {formatDateBR(row.tx.date)} ·{' '}
                    {row.isTransfer ? row.accountLabel : `${row.detail} · ${row.accountLabel}`}
                  </Text>
                </Stack>
                <Money cents={row.tx.amountCents} colored={!row.isTransfer || !!accountId} fw={600} />
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Paper p={0}>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t.transactions.date}</Table.Th>
                <Table.Th>{t.transactions.description}</Table.Th>
                <Table.Th>{t.transactions.category}</Table.Th>
                <Table.Th>{t.transactions.account}</Table.Th>
                <Table.Th ta="right">{t.transactions.amount}</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.tx.id} onClick={() => setEditing(row.tx)} style={{ cursor: 'pointer' }}>
                  <Table.Td>{formatDateBR(row.tx.date)}</Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Text size="sm">{row.title}</Text>
                      <Badges row={row} />
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {row.isTransfer ? '—' : row.detail}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{row.accountLabel}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Money cents={row.tx.amountCents} colored={!row.isTransfer || !!accountId} size="sm" />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t.common.delete}
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(row.tx);
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t.transactions.new : t.transactions.edit}
        fullScreen={isMobile}
        size="lg"
      >
        {editing !== null && (
          <Stack>
            <TransactionForm
              data={data}
              editing={editing === 'new' ? null : editing}
              defaultDate={defaultDate}
              onDone={() => setEditing(null)}
            />
            {editing !== 'new' && isMobile && (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => {
                  setEditing(null);
                  confirmDelete(editing);
                }}
              >
                {t.common.delete}
              </Button>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
