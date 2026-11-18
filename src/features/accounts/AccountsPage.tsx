import {
  ActionIcon,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
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
import { accountBalances } from '../../domain/cashflow/summary';
import { toCents } from '../../domain/money';
import type { Account, AccountType } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { db } from '../../storage/db';
import { newId, removeAccount, saveAccount } from '../../storage/repo';
import { useFinanceData } from '../../storage/useFinanceData';

const TYPES = Object.entries(t.accountTypes).map(([value, label]) => ({ value, label }));

function AccountForm({
  editing,
  nextOrder,
  onDone,
}: {
  editing: Account | null;
  nextOrder: number;
  onDone: () => void;
}) {
  const form = useForm({
    initialValues: {
      name: editing?.name ?? '',
      type: (editing?.type ?? 'checking') as AccountType,
      openingBalance: 0 as number | string,
    },
    validate: { name: (v) => (v.trim() ? null : t.common.required) },
  });
  const submit = async (v: typeof form.values) => {
    await saveAccount(
      {
        id: editing?.id ?? newId(),
        name: v.name.trim(),
        type: v.type,
        archived: editing?.archived ?? false,
        order: editing?.order ?? nextOrder,
      },
      editing ? 0 : toCents(Number(v.openingBalance) || 0),
    );
    onDone();
  };
  return (
    <form onSubmit={form.onSubmit((v) => void submit(v))}>
      <Stack>
        <TextInput label={t.accounts.name} data-autofocus {...form.getInputProps('name')} />
        <Select label={t.accounts.type} data={TYPES} allowDeselect={false} {...form.getInputProps('type')} />
        {!editing && (
          <NumberInput
            label={t.accounts.openingBalance}
            description={t.accounts.openingBalanceHint}
            prefix="R$ "
            decimalSeparator=","
            thousandSeparator="."
            decimalScale={2}
            fixedDecimalScale
            hideControls
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
  const balances = accountBalances(data.transactions);
  const visible = data.accounts.filter((a) => showArchived || !a.archived);
  const total = data.accounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);

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
          <Text fw={600}>{t.dashboard.totalBalance}</Text>
          <Money cents={total} fw={700} size="xl" />
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
            <Text size="xs" c="dimmed" mt="md">
              {t.accounts.balance}
            </Text>
            <Money cents={balances.get(account.id) ?? 0} fw={700} size="lg" />
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
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
