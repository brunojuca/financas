import {
  ActionIcon,
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
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconPlus,
  IconRepeat,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Money, MonthSwitcher, PageHeader } from '../../components/common';
import { accountOptions, categoryOptions } from '../../components/options';
import { billOf, isCardPayment } from '../../domain/cashflow/creditCard';
import { isProjected } from '../../domain/cashflow/recurring';
import { isTransfer } from '../../domain/cashflow/summary';
import {
  currentMonth,
  dateInMonth,
  formatDateBR,
  formatMonthShort,
  monthOf,
  todayIso,
} from '../../domain/dates';
import type { Transaction, YearMonth } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { getMeta, META, setMeta } from '../../storage/db';
import { deleteInstallmentGroup, deleteTransaction, endRecurringFrom } from '../../storage/repo';
import { useFinanceData, type FinanceData } from '../../storage/useFinanceData';
import { TransactionForm } from './TransactionForm';

interface Row {
  tx: Transaction;
  /** Date the entry counts on (card purchases: the bill's due date or the installment's month, per the setting). */
  date: string;
  title: string;
  detail: string;
  accountLabel: string;
  isTransfer: boolean;
  /** Credit-card bill of the entry ("dez/26"), when the account is a configured card. */
  bill: string | null;
  /** Bill item (anything but a payment) on a configured card: can be grouped into its bill. */
  billKey: string | null;
}

/** Card purchases of one bill shown as a single expandable line. */
interface BillGroup {
  key: string;
  date: string;
  bill: string;
  accountLabel: string;
  total: number;
  rows: Row[];
}

type ListItem = { kind: 'row'; row: Row } | { kind: 'bill'; group: BillGroup };

/** Rows as list items, with card purchases collapsed into one line per bill when `group` is on. */
function toItems(rows: Row[], group: boolean): ListItem[] {
  if (!group) return rows.map((row) => ({ kind: 'row', row }));
  const items: ListItem[] = [];
  const groups = new Map<string, BillGroup>();
  for (const row of rows) {
    if (!row.billKey || !row.bill) {
      items.push({ kind: 'row', row });
      continue;
    }
    let g = groups.get(row.billKey);
    if (!g) {
      g = {
        key: row.billKey,
        date: row.date,
        bill: row.bill,
        accountLabel: row.accountLabel,
        total: 0,
        rows: [],
      };
      groups.set(row.billKey, g);
      items.push({ kind: 'bill', group: g });
    }
    g.total += row.tx.amountCents;
    g.rows.push(row);
  }
  return items;
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
  // Month as in reports: card installments may count in a later month (setting in Configurações).
  const reportDate = new Map(data.budgetTransactions.map((t) => [t.id, t.date]));
  const cards = new Map(data.accounts.filter((a) => a.creditCard).map((a) => [a.id, a.creditCard!]));
  const billLabel = (tx: Transaction) => {
    const card = cards.get(tx.accountId);
    return card ? formatMonthShort(billOf(card, tx, data.categoryIndex)) : null;
  };
  for (const tx of [...data.transactions, ...data.projected]) {
    const date = reportDate.get(tx.id) ?? tx.date;
    if (monthOf(date) !== month) continue;
    if (accountId && tx.accountId !== accountId) continue;
    if (categoryId === UNCATEGORIZED ? tx.categoryId !== null : categoryId && tx.categoryId !== categoryId)
      continue;
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
    const category = tx.categoryId
      ? (data.categoryIndex.get(tx.categoryId)?.name ?? '')
      : t.transactions.uncategorized;
    const sub = tx.subcategoryId ? data.categoryIndex.get(tx.subcategoryId)?.name : undefined;
    const card = cards.get(tx.accountId);
    rows.push({
      tx,
      date,
      title: tx.description || category,
      detail: sub ? `${category} › ${sub}` : category,
      accountLabel,
      isTransfer: transfer,
      bill: billLabel(tx),
      // Everything on the bill except its payments (refunds and transfers out of the card included), as in the bill math.
      billKey:
        card && !isCardPayment(tx, data.categoryIndex)
          ? `${tx.accountId}:${billOf(card, tx, data.categoryIndex)}`
          : null,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title, 'pt-BR')));
  return rows;
}

/** What the entry modal is showing. */
type Editor = { kind: 'new' } | { kind: 'edit'; tx: Transaction } | { kind: 'duplicate'; tx: Transaction };

const EDITOR_TITLE = {
  new: t.transactions.new,
  edit: t.transactions.edit,
  duplicate: t.transactions.duplicateTitle,
} as const;

/** Projected recurring entries ("previsto") are shown faded. */
const PROJECTED_OPACITY = 0.65;

/** Filter value for transactions without category. */
const UNCATEGORIZED = '__uncategorized__';

function Badges({ row }: { row: Row }) {
  return (
    <>
      {row.bill && (
        <Badge size="xs" variant="light" color="indigo">
          {t.transactions.billBadge(row.bill)}
        </Badge>
      )}
      {row.tx.transferId && (
        <Badge size="xs" variant="light" color="gray">
          {t.transactions.transferBadge}
        </Badge>
      )}
      {row.tx.categoryId === null && !row.isTransfer && (
        <Badge size="xs" variant="light" color={row.tx.extraordinary ? 'yellow' : 'red'}>
          {t.transactions.uncategorized}
        </Badge>
      )}
      {row.tx.extraordinary && (
        <Badge size="xs" variant="light" color="grape">
          {t.transactions.extraordinary}
        </Badge>
      )}
      {row.tx.recurringId && (
        <Badge
          size="xs"
          variant={isProjected(row.tx) ? 'outline' : 'light'}
          leftSection={<IconRepeat size={10} />}
        >
          {isProjected(row.tx) ? t.transactions.projectedBadge : t.transactions.recurringBadge}
        </Badge>
      )}
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />;
}

/** Date the entry counts on, plus the purchase date when they differ (card purchases counted by bill). */
function DateCell({ row, size = 'sm' }: { row: Row; size?: 'xs' | 'sm' }) {
  return (
    <>
      <Text size={size} span>
        {formatDateBR(row.date)}
      </Text>
      {row.date !== row.tx.date && (
        <Text size="xs" c="dimmed">
          {t.transactions.purchasedOn(formatDateBR(row.tx.date))}
        </Text>
      )}
    </>
  );
}

function MobileRow({
  row,
  accountId,
  onEdit,
}: {
  row: Row;
  accountId: string | null;
  onEdit: (tx: Transaction) => void;
}) {
  return (
    <Paper
      p="sm"
      onClick={() => onEdit(row.tx)}
      style={{ cursor: 'pointer', opacity: isProjected(row.tx) ? PROJECTED_OPACITY : undefined }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap={6}>
            <Text fw={500} truncate>
              {row.title}
            </Text>
            <Badges row={row} />
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {formatDateBR(row.date)} ·{' '}
            {row.isTransfer ? row.accountLabel : `${row.detail} · ${row.accountLabel}`}
          </Text>
          {row.date !== row.tx.date && (
            <Text size="xs" c="dimmed">
              {t.transactions.purchasedOn(formatDateBR(row.tx.date))}
            </Text>
          )}
        </Stack>
        <Money cents={row.tx.amountCents} colored={!row.isTransfer || !!accountId} fw={600} />
      </Group>
    </Paper>
  );
}

function TableRow({
  row,
  accountId,
  onEdit,
  onDuplicate,
  onDelete,
  indent = false,
}: {
  row: Row;
  accountId: string | null;
  onEdit: (tx: Transaction) => void;
  onDuplicate: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  indent?: boolean;
}) {
  return (
    <Table.Tr
      onClick={() => onEdit(row.tx)}
      style={{ cursor: 'pointer', opacity: isProjected(row.tx) ? PROJECTED_OPACITY : undefined }}
    >
      <Table.Td pl={indent ? 'xl' : undefined}>
        <DateCell row={row} />
      </Table.Td>
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
        <Group gap={2} wrap="nowrap">
          <Tooltip label={t.transactions.duplicate}>
            <ActionIcon
              variant="subtle"
              aria-label={t.transactions.duplicate}
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(row.tx);
              }}
            >
              <IconCopy size={16} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={t.common.delete}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row.tx);
            }}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth());
  const data = useFinanceData(month);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isMobile = useMediaQuery('(max-width: 48em)');
  const groupPref = useLiveQuery(() => getMeta(META.groupCardBills), []);

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
  const today = todayIso();
  // The date picker opens on the month being viewed.
  const calendarDate = monthOf(today) === month ? today : dateInMonth(month, 1);
  const canGroup = data.cardReportMode === 'bill' && rows.some((r) => r.billKey);
  const grouped = canGroup && groupPref === 'true';
  const items = toItems(rows, grouped);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const edit = (tx: Transaction) => setEditor({ kind: 'edit', tx });
  const duplicate = (tx: Transaction) => setEditor({ kind: 'duplicate', tx });

  /** Delete just this entry or the whole series (installment purchase, recurring entry). */
  const chooseDelete = (
    tx: Transaction,
    texts: { title: string; text: string; one: string; all: string },
    deleteAll: () => Promise<void>,
  ) => {
    const id = modals.open({
      title: texts.title,
      children: (
        <Stack>
          <Text size="sm">{texts.text}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => modals.close(id)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="light"
              color="red"
              onClick={() => {
                modals.close(id);
                void deleteTransaction(tx).then(() =>
                  notifications.show({ message: t.transactions.deleted }),
                );
              }}
            >
              {texts.one}
            </Button>
            <Button
              color="red"
              onClick={() => {
                modals.close(id);
                void deleteAll().then(() => notifications.show({ message: t.transactions.deleted }));
              }}
            >
              {texts.all}
            </Button>
          </Group>
        </Stack>
      ),
    });
  };

  const confirmDelete = (tx: Transaction) => {
    if (tx.installmentGroupId && tx.installment) {
      const groupId = tx.installmentGroupId;
      chooseDelete(
        tx,
        {
          title: t.transactions.deleteInstallmentsTitle,
          text: t.transactions.deleteInstallmentsText(tx.installment.total),
          one: t.transactions.deleteThisInstallment,
          all: t.transactions.deleteAllInstallments,
        },
        () => deleteInstallmentGroup(groupId),
      );
      return;
    }
    if (tx.recurringId && tx.recurringMonth) {
      const { recurringId, recurringMonth } = tx;
      const template = data.recurring.find((r) => r.id === recurringId);
      chooseDelete(
        tx,
        {
          title: t.transactions.deleteRecurringTitle,
          text: t.transactions.deleteRecurringText(template?.description ?? tx.description),
          one: t.transactions.deleteThisMonth,
          all: t.transactions.deleteThisAndNext,
        },
        () => endRecurringFrom(recurringId, recurringMonth),
      );
      return;
    }
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
  };

  return (
    <>
      <PageHeader title={t.nav.transactions}>
        <MonthSwitcher value={month} onChange={setMonth} />
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditor({ kind: 'new' })}>
          {t.transactions.new}
        </Button>
      </PageHeader>

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
          data={[
            { value: UNCATEGORIZED, label: t.transactions.uncategorized },
            ...categoryOptions(data.categories, null, null, categoryId),
          ]}
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
        {canGroup && (
          <Switch
            size="sm"
            label={t.transactions.groupBills}
            checked={grouped}
            onChange={(e) => void setMeta(META.groupCardBills, String(e.currentTarget.checked))}
          />
        )}
      </Group>

      {rows.length === 0 ? (
        <Paper>
          <Text c="dimmed" ta="center">
            {t.transactions.empty}
          </Text>
        </Paper>
      ) : isMobile ? (
        <Stack gap="xs">
          {items.map((item) =>
            item.kind === 'row' ? (
              <MobileRow key={item.row.tx.id} row={item.row} accountId={accountId} onEdit={edit} />
            ) : (
              <Stack key={item.group.key} gap={4}>
                <Paper p="sm" onClick={() => toggle(item.group.key)} style={{ cursor: 'pointer' }}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Group gap={6}>
                        <Chevron open={expanded.has(item.group.key)} />
                        <Text fw={600}>{t.transactions.billGroupTitle(item.group.bill)}</Text>
                        <Badge size="xs" variant="light" color="indigo">
                          {t.transactions.billGroupCount(item.group.rows.length)}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {formatDateBR(item.group.date)} · {item.group.accountLabel}
                      </Text>
                    </Stack>
                    <Money cents={item.group.total} fw={600} />
                  </Group>
                </Paper>
                {expanded.has(item.group.key) &&
                  item.group.rows.map((row) => (
                    <div key={row.tx.id} style={{ paddingLeft: 16 }}>
                      <MobileRow row={row} accountId={accountId} onEdit={edit} />
                    </div>
                  ))}
              </Stack>
            ),
          )}
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
                <Table.Th w={80} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.flatMap((item) =>
                item.kind === 'row'
                  ? [
                      <TableRow
                        key={item.row.tx.id}
                        row={item.row}
                        accountId={accountId}
                        onEdit={edit}
                        onDuplicate={duplicate}
                        onDelete={confirmDelete}
                      />,
                    ]
                  : [
                      <Table.Tr
                        key={item.group.key}
                        onClick={() => toggle(item.group.key)}
                        style={{ cursor: 'pointer' }}
                        bg="var(--mantine-color-default-hover)"
                      >
                        <Table.Td>{formatDateBR(item.group.date)}</Table.Td>
                        <Table.Td>
                          <Group gap={6}>
                            <Chevron open={expanded.has(item.group.key)} />
                            <Text size="sm" fw={600}>
                              {t.transactions.billGroupTitle(item.group.bill)}
                            </Text>
                            <Badge size="xs" variant="light" color="indigo">
                              {t.transactions.billGroupCount(item.group.rows.length)}
                            </Badge>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{item.group.accountLabel}</Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Money cents={item.group.total} size="sm" fw={600} />
                        </Table.Td>
                        <Table.Td />
                      </Table.Tr>,
                      ...(expanded.has(item.group.key)
                        ? item.group.rows.map((row) => (
                            <TableRow
                              key={row.tx.id}
                              row={row}
                              accountId={accountId}
                              onEdit={edit}
                              onDuplicate={duplicate}
                              onDelete={confirmDelete}
                              indent
                            />
                          ))
                        : []),
                    ],
              )}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <Modal
        opened={editor !== null}
        onClose={() => setEditor(null)}
        title={editor ? EDITOR_TITLE[editor.kind] : ''}
        fullScreen={isMobile}
        size="lg"
      >
        {editor !== null && (
          <Stack>
            <TransactionForm
              // Remount when switching from editing to duplicating the same entry.
              key={editor.kind}
              data={data}
              editing={editor.kind === 'edit' ? editor.tx : null}
              duplicateOf={editor.kind === 'duplicate' ? editor.tx : null}
              calendarDate={calendarDate}
              onDone={() => setEditor(null)}
            />
            {editor.kind === 'edit' && (
              <Group grow>
                <Button
                  variant="subtle"
                  leftSection={<IconCopy size={16} />}
                  onClick={() => duplicate(editor.tx)}
                >
                  {t.transactions.duplicate}
                </Button>
                {isMobile && (
                  <Button
                    variant="subtle"
                    color="red"
                    leftSection={<IconTrash size={16} />}
                    onClick={() => {
                      setEditor(null);
                      confirmDelete(editor.tx);
                    }}
                  >
                    {t.common.delete}
                  </Button>
                )}
              </Group>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
