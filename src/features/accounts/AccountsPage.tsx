import {
  ActionIcon,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  NumberInput,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconArchive, IconDots, IconPencil, IconPlus, IconRestore } from '@tabler/icons-react';
import { useState } from 'react';
import { Money, PageHeader } from '../../components/common';
import { MoneyInput } from '../../components/MoneyInput';
import { accountBalances, totalBalance } from '../../domain/cashflow/summary';
import { currentMonth, formatDateBR, monthEnd, todayIso } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import type { Account, AccountType } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { db } from '../../storage/db';
import { newId, removeAccount, saveAccount } from '../../storage/repo';
import { useFinanceData } from '../../storage/useFinanceData';

const TYPES = Object.entries(t.accountTypes).map(([value, label]) => ({ value, label }));
const isDay = (v: number | string) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31;

function AccountForm({
  editing,
  nextOrder,
  accounts,
  onDone,
}: {
  editing: Account | null;
  nextOrder: number;
  accounts: Account[];
  onDone: () => void;
}) {
  const form = useForm({
    initialValues: {
      name: editing?.name ?? '',
      type: (editing?.type ?? 'checking') as AccountType,
      includeInTotal: editing?.includeInTotal ?? true,
      /** Cents; may be negative (debt). */
      openingBalance: null as number | null,
      closingDay: (editing?.creditCard?.closingDay ?? '') as number | string,
      dueDay: (editing?.creditCard?.dueDay ?? '') as number | string,
      limitCents: editing?.creditCard?.limitCents ?? (null as number | null),
      payingAccountId: editing?.creditCard?.payingAccountId ?? (null as string | null),
    },
    validate: {
      name: (v) => (v.trim() ? null : t.common.required),
      closingDay: (v, values) => (values.type !== 'creditCard' || isDay(v) ? null : t.accounts.invalidDay),
      dueDay: (v, values) => (values.type !== 'creditCard' || isDay(v) ? null : t.accounts.invalidDay),
    },
  });
  const isCard = form.getValues().type === 'creditCard';
  const payers = accounts
    .filter((a) => !a.archived && a.type !== 'creditCard' && a.id !== editing?.id)
    .map((a) => ({ value: a.id, label: a.name }));
  const submit = async (v: typeof form.values) => {
    await saveAccount(
      {
        id: editing?.id ?? newId(),
        name: v.name.trim(),
        type: v.type,
        archived: editing?.archived ?? false,
        order: editing?.order ?? nextOrder,
        includeInTotal: v.includeInTotal,
        creditCard:
          v.type === 'creditCard'
            ? {
                closingDay: Number(v.closingDay),
                dueDay: Number(v.dueDay),
                limitCents: v.limitCents,
                payingAccountId: v.payingAccountId,
              }
            : null,
      },
      editing ? 0 : (v.openingBalance ?? 0),
    );
    onDone();
  };
  return (
    <form onSubmit={form.onSubmit((v) => void submit(v))}>
      <Stack>
        <TextInput label={t.accounts.name} data-autofocus {...form.getInputProps('name')} />
        <Select label={t.accounts.type} data={TYPES} allowDeselect={false} {...form.getInputProps('type')} />
        {isCard && (
          <>
            <Group grow align="flex-start">
              <NumberInput
                label={t.accounts.closingDay}
                description={t.accounts.closingDayHint}
                min={1}
                max={31}
                allowDecimal={false}
                {...form.getInputProps('closingDay')}
              />
              <NumberInput
                label={t.accounts.dueDay}
                min={1}
                max={31}
                allowDecimal={false}
                {...form.getInputProps('dueDay')}
              />
            </Group>
            <Group grow align="flex-start">
              <MoneyInput label={t.accounts.limit} {...form.getInputProps('limitCents')} />
              <Select
                label={t.accounts.payingAccount}
                description={t.accounts.payingAccountHint}
                data={payers}
                clearable
                {...form.getInputProps('payingAccountId')}
              />
            </Group>
          </>
        )}
        <Switch
          label={t.accounts.includeInTotal}
          description={t.accounts.includeInTotalHint}
          {...form.getInputProps('includeInTotal', { type: 'checkbox' })}
        />
        {!editing && (
          <MoneyInput
            label={t.accounts.openingBalance}
            description={t.accounts.openingBalanceHint}
            allowNegative
            {...form.getInputProps('openingBalance')}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            {t.common.cancel}
          </Button>
          <Button type="submit">{t.common.save}</Button>
        </Group>
      </Stack>
    </form>
  );
}

export function AccountsPage() {
  const data = useFinanceData();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const isMobile = useMediaQuery('(max-width: 48em)');
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  const today = todayIso();
  // "Previsto": at the end of this month, with future entries and recurring ones still to come.
  const end = monthEnd(currentMonth());
  const balances = accountBalances([...data.transactions, ...data.projected], end);
  // Card limit: everything owed that is stored (future installments included), as the bank counts it.
  const owed = accountBalances(data.transactions);
  const balancesToday = accountBalances(data.transactions, today);
  const totalToday = totalBalance(balancesToday, data.accounts);
  const visible = data.accounts.filter((a) => showArchived || !a.archived);
  const total = totalBalance(balances, data.accounts);

  const confirmRemove = (account: Account) =>
    modals.openConfirmModal({
      title: t.accounts.removeTitle,
      children: <Text size="sm">{t.accounts.removeText}</Text>,
      labels: { confirm: t.common.delete, cancel: t.common.cancel },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const result = await removeAccount(account.id);
        notifications.show({
          message: result === 'deleted' ? t.accounts.removedDeleted : t.accounts.removedArchived,
        });
      },
    });

  return (
    <>
      <PageHeader title={t.nav.accounts}>
        <Switch
          label={t.common.showArchived}
          checked={showArchived}
          onChange={(e) => setShowArchived(e.currentTarget.checked)}
        />
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditing('new')}>
          {t.accounts.new}
        </Button>
      </PageHeader>

      <Paper mb="md">
        <Group justify="space-between">
          <div>
            <Text fw={600}>{t.dashboard.totalBalance}</Text>
            <Text size="xs" c="dimmed">
              {t.accounts.balanceTodayHint}
            </Text>
          </div>
          <Stack gap={0} align="flex-end">
            <Money cents={totalToday} fw={700} size="xl" />
            {total !== totalToday && (
              <Text size="xs" c="dimmed">
                {t.accounts.balanceProjected(formatBRL(total), formatDateBR(end))}
              </Text>
            )}
          </Stack>
        </Group>
      </Paper>

      {visible.length === 0 && (
        <Text c="dimmed" ta="center">
          {t.accounts.empty}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {visible.map((account) => (
          <Paper key={account.id} opacity={account.archived ? 0.6 : 1}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={4} style={{ minWidth: 0 }}>
                <Text fw={600} truncate>
                  {account.name}
                </Text>
                <Group gap={6}>
                  <Badge variant="light" size="sm">
                    {t.accountTypes[account.type]}
                  </Badge>
                  {account.archived && (
                    <Badge variant="outline" color="gray" size="sm">
                      {t.common.archived}
                    </Badge>
                  )}
                  {!account.includeInTotal && (
                    <Badge variant="outline" color="yellow" size="sm">
                      {t.accounts.outOfTotal}
                    </Badge>
                  )}
                </Group>
              </Stack>
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label={t.common.actions}>
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => setEditing(account)}>
                    {t.common.edit}
                  </Menu.Item>
                  {account.archived ? (
                    <Menu.Item
                      leftSection={<IconRestore size={16} />}
                      onClick={() => void db.accounts.update(account.id, { archived: false })}
                    >
                      {t.common.restore}
                    </Menu.Item>
                  ) : (
                    <Menu.Item
                      color="red"
                      leftSection={<IconArchive size={16} />}
                      onClick={() => confirmRemove(account)}
                    >
                      {t.common.delete}
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
            {account.type === 'creditCard' ? (
              <>
                <Text size="xs" c="dimmed" mt="md">
                  {t.accounts.limitUsed}
                </Text>
                <Money cents={-(owed.get(account.id) ?? 0)} colored={false} fw={700} size="lg" />
                {account.creditCard?.limitCents != null && (
                  <Text size="xs" c="dimmed">
                    {t.accounts.limitAvailable(
                      formatBRL(account.creditCard.limitCents + (owed.get(account.id) ?? 0)),
                    )}
                  </Text>
                )}
                <Text size="xs" c="dimmed">
                  {account.creditCard
                    ? t.accounts.cardDays(account.creditCard.closingDay, account.creditCard.dueDay)
                    : t.accounts.cardNotSet}
                </Text>
              </>
            ) : (
              <>
                <Text size="xs" c="dimmed" mt="md">
                  {t.accounts.balanceToday}
                </Text>
                <Money cents={balancesToday.get(account.id) ?? 0} fw={700} size="lg" />
                {(balancesToday.get(account.id) ?? 0) !== (balances.get(account.id) ?? 0) && (
                  <Text size="xs" c="dimmed">
                    {t.accounts.balanceProjected(formatBRL(balances.get(account.id) ?? 0), formatDateBR(end))}
                  </Text>
                )}
              </>
            )}
          </Paper>
        ))}
      </SimpleGrid>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t.accounts.new : t.accounts.edit}
        fullScreen={isMobile}
      >
        {editing !== null && (
          <AccountForm
            editing={editing === 'new' ? null : editing}
            nextOrder={Math.max(-1, ...data.accounts.map((a) => a.order)) + 1}
            accounts={data.accounts}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
