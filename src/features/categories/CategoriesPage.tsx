import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconPencil,
  IconPlus,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { PageHeader } from '../../components/common';
import type { Category, CategoryKind } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { newId, removeCategory, saveCategory, swapCategoryOrder } from '../../storage/repo';
import { useFinanceData } from '../../storage/useFinanceData';

type Editing =
  { mode: 'rename'; category: Category } | { mode: 'create'; kind: CategoryKind; parent: Category | null };

function NameForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <Stack>
        <TextInput
          label={t.categories.name}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            {t.common.save}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function CategoryActions({
  category,
  siblings,
  onRename,
  onAddSub,
}: {
  category: Category;
  siblings: Category[];
  onRename: () => void;
  onAddSub?: () => void;
}) {
  const index = siblings.findIndex((s) => s.id === category.id);
  const confirmRemove = () =>
    modals.openConfirmModal({
      title: t.categories.removeTitle,
      children: <Text size="sm">{t.categories.removeText}</Text>,
      labels: { confirm: t.common.delete, cancel: t.common.cancel },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const result = await removeCategory(category.id);
        notifications.show({
          message: result === 'deleted' ? t.categories.removedDeleted : t.categories.removedArchived,
        });
      },
    });
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label={t.common.actions}>
          <IconDots size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={16} />} onClick={onRename}>
          {t.categories.rename}
        </Menu.Item>
        {onAddSub && (
          <Menu.Item leftSection={<IconPlus size={16} />} onClick={onAddSub}>
            {t.categories.addSubcategory}
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<IconArrowUp size={16} />}
          disabled={index <= 0}
          onClick={() => void swapCategoryOrder(category, siblings[index - 1]!)}
        >
          {t.common.moveUp}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconArrowDown size={16} />}
          disabled={index < 0 || index >= siblings.length - 1}
          onClick={() => void swapCategoryOrder(category, siblings[index + 1]!)}
        >
          {t.common.moveDown}
        </Menu.Item>
        {category.archived ? (
          <Menu.Item
            leftSection={<IconRestore size={16} />}
            onClick={() => void saveCategory({ ...category, archived: false })}
          >
            {t.common.restore}
          </Menu.Item>
        ) : (
          <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={confirmRemove}>
            {t.common.delete}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

function ArchivedBadge({ show }: { show: boolean }) {
  return show ? (
    <Badge size="xs" variant="outline" color="gray">
      {t.common.archived}
    </Badge>
  ) : null;
}

export function CategoriesPage() {
  const data = useFinanceData();
  const [tab, setTab] = useState<CategoryKind>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  const visible = data.categories.filter((c) => showArchived || !c.archived);
  const childrenOf = (id: string | null, kind: CategoryKind) =>
    visible.filter((c) => c.parentId === id && c.kind === kind);

  const save = async (name: string) => {
    if (!editing) return;
    if (editing.mode === 'rename') await saveCategory({ ...editing.category, name });
    else {
      const siblings = data.categories.filter((c) => c.parentId === (editing.parent?.id ?? null));
      await saveCategory({
        id: newId(),
        name,
        kind: editing.kind,
        parentId: editing.parent?.id ?? null,
        archived: false,
        order: Math.max(-1, ...siblings.map((c) => c.order)) + 1,
      });
    }
    setEditing(null);
  };

  const list = (kind: CategoryKind) => {
    const top = childrenOf(null, kind);
    return (
      <Stack gap="xs" mt="md">
        {kind === 'transfer' ? (
          <Alert>{t.categories.transferNote}</Alert>
        ) : (
          <Group justify="flex-end">
            <Button
              leftSection={<IconPlus size={18} />}
              variant="light"
              onClick={() => setEditing({ mode: 'create', kind, parent: null })}
            >
              {t.categories.newCategory}
            </Button>
          </Group>
        )}
        {top.map((category) => {
          const subs = childrenOf(category.id, kind);
          return (
            <Paper key={category.id} p="sm" opacity={category.archived ? 0.6 : 1}>
              <Group justify="space-between" wrap="nowrap">
                <Group gap={6}>
                  <Text fw={600}>{category.name}</Text>
                  <ArchivedBadge show={category.archived} />
                </Group>
                {kind !== 'transfer' && (
                  <CategoryActions
                    category={category}
                    siblings={top}
                    onRename={() => setEditing({ mode: 'rename', category })}
                    onAddSub={() => setEditing({ mode: 'create', kind, parent: category })}
                  />
                )}
                {kind === 'transfer' && (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={t.categories.rename}
                    onClick={() => setEditing({ mode: 'rename', category })}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                )}
              </Group>
              {subs.length > 0 && (
                <Stack
                  gap={2}
                  mt="xs"
                  pl="md"
                  style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
                >
                  {subs.map((sub) => (
                    <Group
                      key={sub.id}
                      justify="space-between"
                      wrap="nowrap"
                      opacity={sub.archived ? 0.6 : 1}
                    >
                      <Group gap={6}>
                        <Text size="sm">{sub.name}</Text>
                        <ArchivedBadge show={sub.archived} />
                      </Group>
                      <CategoryActions
                        category={sub}
                        siblings={subs}
                        onRename={() => setEditing({ mode: 'rename', category: sub })}
                      />
                    </Group>
                  ))}
                </Stack>
              )}
            </Paper>
          );
        })}
      </Stack>
    );
  };

  return (
    <>
      <PageHeader title={t.nav.categories}>
        <Switch
          label={t.common.showArchived}
          checked={showArchived}
          onChange={(e) => setShowArchived(e.currentTarget.checked)}
        />
      </PageHeader>
      <Tabs value={tab} onChange={(v) => setTab((v as CategoryKind) ?? 'expense')}>
        <Tabs.List>
          <Tabs.Tab value="expense">{t.kindsPlural.expense}</Tabs.Tab>
          <Tabs.Tab value="income">{t.kindsPlural.income}</Tabs.Tab>
          <Tabs.Tab value="transfer">{t.kindsPlural.transfer}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="expense">{list('expense')}</Tabs.Panel>
        <Tabs.Panel value="income">{list('income')}</Tabs.Panel>
        <Tabs.Panel value="transfer">{list('transfer')}</Tabs.Panel>
      </Tabs>
      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing?.mode === 'rename'
            ? t.categories.rename
            : editing?.parent
              ? `${t.categories.newSubcategory} · ${editing.parent.name}`
              : t.categories.newCategory
        }
      >
        {editing && (
          <NameForm
            initial={editing.mode === 'rename' ? editing.category.name : ''}
            onSave={(name) => void save(name)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
