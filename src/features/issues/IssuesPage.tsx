import {
  ActionIcon,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Tooltip,
  type ComboboxData,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCircleCheck, IconPencil } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Money, PageHeader } from '../../components/common';
import { categoryOptions } from '../../components/options';
import { findIssues, type Issue, type IssueLevel } from '../../domain/cashflow/validation';
import { formatDateBR } from '../../domain/dates';
import type { Transaction } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { updateTransaction } from '../../storage/repo';
import { useFinanceData, type FinanceData } from '../../storage/useFinanceData';
import { TransactionForm } from '../transactions/TransactionForm';

const PAGE_SIZE = 50;
const LEVEL_COLOR: Record<IssueLevel, string> = { error: 'red', warning: 'yellow' };

/** Categories grouped by kind, the kind matching the amount's sign first. */
function categoryGroups(data: FinanceData, tx: Transaction): ComboboxData {
  const order = tx.amountCents > 0 ? (['income', 'expense'] as const) : (['expense', 'income'] as const);
  return order.map((kind) => ({
    group: t.kindsPlural[kind],
    items: categoryOptions(data.categories, kind, null),
  }));
}

function IssueCard({
  issue,
  data,
  onEdit,
}: {
  issue: Issue;
  data: FinanceData;
  onEdit: (tx: Transaction) => void;
}) {
  const tx = issue.transaction;
  const account = data.accounts.find((a) => a.id === tx.accountId)?.name ?? '';
  const category = tx.categoryId ? data.categoryIndex.get(tx.categoryId)?.name : undefined;
  const subOptions = tx.categoryId ? categoryOptions(data.categories, null, tx.categoryId) : [];
  return (
    <Paper p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${LEVEL_COLOR[issue.level]}-filled)` }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap={6}>
            <Text fw={600} truncate>
              {tx.description}
            </Text>
            <Badge size="xs" variant="light" color={LEVEL_COLOR[issue.level]}>
              {t.issues.codes[issue.code]}
            </Badge>
            {tx.extraordinary && (
              <Badge size="xs" variant="light" color="grape">
                {t.transactions.extraordinary}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {formatDateBR(tx.date)} · {account}
            {category ? ` · ${category}` : ''}
          </Text>
        </Stack>
        <Group gap={4} wrap="nowrap">
          <Money cents={tx.amountCents} fw={600} />
          <Tooltip label={t.issues.edit}>
            <ActionIcon variant="subtle" aria-label={t.issues.edit} onClick={() => onEdit(tx)}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Group mt="xs" gap="xs" align="center">
        {issue.code === 'missingSubcategory' ? (
          <Select
            size="xs"
            w={240}
            placeholder={t.issues.pickSubcategory}
            data={subOptions}
            searchable
            value={null}
            onChange={(v) => v && void updateTransaction(tx.id, { subcategoryId: v })}
          />
        ) : (
          <Select
            size="xs"
            w={240}
            placeholder={t.issues.pickCategory}
            data={categoryGroups(data, tx)}
            searchable
            value={null}
            onChange={(v) => v && void updateTransaction(tx.id, { categoryId: v, subcategoryId: null })}
          />
        )}
        {issue.code !== 'missingSubcategory' && (
          <Button
            size="xs"
            variant="subtle"
            color="grape"
            onClick={() => void updateTransaction(tx.id, { extraordinary: !tx.extraordinary })}
          >
            {tx.extraordinary ? t.issues.unmarkExtraordinary : t.issues.markExtraordinary}
          </Button>
        )}
      </Group>
    </Paper>
  );
}

function IssueList({
  issues,
  data,
  onEdit,
  empty,
}: {
  empty: string;
  issues: Issue[];
  data: FinanceData;
  onEdit: (tx: Transaction) => void;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(issues.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  if (issues.length === 0) {
    return (
      <Center py="xl">
        <Group gap="xs" c="teal">
          <IconCircleCheck size={20} />
          <Text>{empty}</Text>
        </Group>
      </Center>
    );
  }
  return (
    <Stack gap="xs" mt="md">
      {issues.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((issue) => (
        <IssueCard key={issue.transaction.id} issue={issue} data={data} onEdit={onEdit} />
      ))}
      {pages > 1 && <Pagination total={pages} value={current} onChange={setPage} mt="sm" />}
    </Stack>
  );
}

export function IssuesPage() {
  const data = useFinanceData();
  const [tab, setTab] = useState<IssueLevel>('error');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const issues = useMemo(() => (data ? findIssues(data.transactions, data.categoryIndex) : []), [data]);
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <>
      <PageHeader title={t.nav.issues} />
      <Text size="sm" c="dimmed" mb="md">
        {t.issues.intro}
      </Text>
      <Tabs value={tab} onChange={(v) => setTab((v as IssueLevel) ?? 'error')}>
        <Tabs.List>
          <Tabs.Tab
            value="error"
            rightSection={
              <Badge size="sm" color="red" variant={errors.length ? 'filled' : 'light'}>
                {errors.length}
              </Badge>
            }
          >
            {t.issues.errors}
          </Tabs.Tab>
          <Tabs.Tab
            value="warning"
            rightSection={
              <Badge size="sm" color="yellow" variant="light">
                {warnings.length}
              </Badge>
            }
          >
            {t.issues.warnings}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="error">
          <IssueList issues={errors} data={data} onEdit={setEditing} empty={t.issues.noErrors} />
        </Tabs.Panel>
        <Tabs.Panel value="warning">
          <IssueList issues={warnings} data={data} onEdit={setEditing} empty={t.issues.noWarnings} />
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={t.transactions.edit}
        fullScreen={isMobile}
        size="lg"
      >
        {editing && <TransactionForm data={data} editing={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
