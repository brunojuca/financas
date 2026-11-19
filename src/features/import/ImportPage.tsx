import {
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  FileButton,
  Group,
  Loader,
  Paper,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconDatabaseExport, IconFileImport } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common';
import { findIssues } from '../../domain/cashflow/validation';
import { indexCategories } from '../../domain/cashflow/summary';
import { isValidRow, parseTransactionsCsv, type ParsedCsv, type ValidCsvRow } from '../../domain/import/csv';
import {
  buildImportPlan,
  summarizeSource,
  suggestMappings,
  type AccountMapping,
  type CategoryMapping,
  type ImportOptions,
  type ImportSource,
  type Mappings,
  type SubcategoryMapping,
} from '../../domain/import/plan';
import type { AccountType, CategoryKind } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { applyImportPlan, newId } from '../../storage/repo';
import { useFinanceData, type FinanceData } from '../../storage/useFinanceData';
import { exportBackupFile } from '../settings/backupActions';

const ACCOUNT_TYPES = Object.entries(t.accountTypes).map(([value, label]) => ({ value, label }));
const KINDS = (['expense', 'income', 'transfer'] as const).map((value) => ({ value, label: t.kinds[value] }));

interface Loaded {
  fileName: string;
  parsed: ParsedCsv;
  valid: ValidCsvRow[];
  source: ImportSource;
}

// ---------- step 1: file ----------

function FileStep({ loaded, onLoad }: { loaded: Loaded | null; onLoad: (file: File) => void }) {
  const rejected = loaded?.parsed.rows.filter((r) => !isValidRow(r)) ?? [];
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t.import.intro}
      </Text>
      <Group>
        <FileButton onChange={(f) => f && onLoad(f)} accept=".csv,.tsv,.txt,text/csv,text/plain">
          {(props) => (
            <Button leftSection={<IconFileImport size={18} />} {...props}>
              {t.import.chooseFile}
            </Button>
          )}
        </FileButton>
        {loaded && <Text size="sm">{loaded.fileName}</Text>}
      </Group>
      {loaded && loaded.parsed.missingColumns.length > 0 && (
        <Alert color="red">{t.import.missingColumns(loaded.parsed.missingColumns.join(', '))}</Alert>
      )}
      {loaded && loaded.parsed.missingColumns.length === 0 && (
        <Alert color={loaded.valid.length ? 'teal' : 'red'}>
          {loaded.valid.length
            ? t.import.fileSummary(loaded.valid.length, rejected.length)
            : t.import.noValidRows}
        </Alert>
      )}
      {rejected.length > 0 && (
        <Paper p={0}>
          <Text fw={600} p="sm" c="red">
            {t.import.rejectedTitle}
          </Text>
          <Table.ScrollContainer minWidth={500} maxHeight={300}>
            <Table verticalSpacing={4} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t.import.line}</Table.Th>
                  <Table.Th>{t.import.problem}</Table.Th>
                  <Table.Th>Conteúdo</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rejected.slice(0, 200).map((r) => (
                  <Table.Tr key={r.line}>
                    <Table.Td>{r.line}</Table.Td>
                    <Table.Td c="red">{r.problems.map((p) => t.import.problems[p]).join(', ')}</Table.Td>
                    <Table.Td c="dimmed">{r.raw.join(' | ')}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}

// ---------- step 2: accounts ----------

function AccountsStep({
  loaded,
  mappings,
  data,
  onChange,
}: {
  loaded: Loaded;
  mappings: Mappings;
  data: FinanceData;
  onChange: (key: string, m: AccountMapping) => void;
}) {
  const options = data.accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: a.name }));
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t.import.accountsIntro}
      </Text>
      {loaded.source.accounts.map((a) => {
        const m = mappings.accounts[a.key]!;
        return (
          <Paper key={a.key} p="sm">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{a.name}</Text>
              <Badge variant="light">{t.import.rows(a.count)}</Badge>
            </Group>
            <SegmentedControl
              fullWidth
              size="xs"
              mb="xs"
              value={m.action}
              disabled={options.length === 0}
              data={[
                { value: 'new', label: t.import.createNew },
                { value: 'existing', label: t.import.linkTo },
              ]}
              onChange={(action) =>
                onChange(
                  a.key,
                  action === 'new'
                    ? { action: 'new', name: a.name, type: 'checking' }
                    : { action: 'existing', accountId: options[0]?.value ?? '' },
                )
              }
            />
            {m.action === 'new' ? (
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
                <TextInput
                  aria-label={t.import.newName}
                  value={m.name}
                  onChange={(e) => onChange(a.key, { ...m, name: e.currentTarget.value })}
                  error={!m.name.trim()}
                />
                <Select
                  aria-label={t.accounts.type}
                  data={ACCOUNT_TYPES}
                  value={m.type}
                  allowDeselect={false}
                  onChange={(v) => onChange(a.key, { ...m, type: (v ?? 'checking') as AccountType })}
                />
              </SimpleGrid>
            ) : (
              <Select
                aria-label={t.import.linkTo}
                data={options}
                value={m.accountId || null}
                allowDeselect={false}
                searchable
                onChange={(v) => onChange(a.key, { action: 'existing', accountId: v ?? '' })}
              />
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}

// ---------- step 3: categories ----------

function categoryKindOf(m: CategoryMapping, data: FinanceData): CategoryKind | undefined {
  return m.action === 'new' ? m.kind : data.categoryIndex.get(m.categoryId)?.kind;
}

function CategoriesStep({
  loaded,
  mappings,
  data,
  onCategory,
  onSubcategory,
}: {
  loaded: Loaded;
  mappings: Mappings;
  data: FinanceData;
  onCategory: (key: string, m: CategoryMapping) => void;
  onSubcategory: (key: string, m: SubcategoryMapping) => void;
}) {
  const topLevel = data.categories
    .filter((c) => c.parentId === null && !c.archived)
    .map((c) => ({ value: c.id, label: `${c.name} · ${t.kinds[c.kind]}` }));
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t.import.categoriesIntro}
      </Text>
      {loaded.source.categories.map((c) => {
        const m = mappings.categories[c.key]!;
        const kind = categoryKindOf(m, data);
        const subs = loaded.source.subcategories.filter((s) => s.categoryKey === c.key);
        const existingSubs =
          m.action === 'existing'
            ? data.categories
                .filter((x) => x.parentId === m.categoryId && !x.archived)
                .map((x) => ({ value: x.id, label: x.name }))
            : [];
        return (
          <Paper key={c.key} p="sm">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{c.name}</Text>
              <Badge variant="light">{t.import.rows(c.count)}</Badge>
            </Group>
            <SegmentedControl
              fullWidth
              size="xs"
              mb="xs"
              value={m.action}
              data={[
                { value: 'new', label: t.import.createNew },
                { value: 'existing', label: t.import.linkTo },
              ]}
              onChange={(action) =>
                onCategory(
                  c.key,
                  action === 'new'
                    ? { action: 'new', name: c.name, kind: c.suggestedKind }
                    : { action: 'existing', categoryId: topLevel[0]?.value ?? '' },
                )
              }
            />
            {m.action === 'new' ? (
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
                <TextInput
                  aria-label={t.import.newName}
                  value={m.name}
                  onChange={(e) => onCategory(c.key, { ...m, name: e.currentTarget.value })}
                  error={!m.name.trim()}
                />
                <Select
                  aria-label={t.import.kind}
                  data={KINDS}
                  value={m.kind}
                  allowDeselect={false}
                  onChange={(v) => onCategory(c.key, { ...m, kind: (v ?? 'expense') as CategoryKind })}
                />
              </SimpleGrid>
            ) : (
              <Select
                aria-label={t.import.linkTo}
                data={topLevel}
                value={m.categoryId || null}
                allowDeselect={false}
                searchable
                onChange={(v) => onCategory(c.key, { action: 'existing', categoryId: v ?? '' })}
              />
            )}

            {subs.length > 0 && kind !== 'transfer' && (
              <Stack
                gap="xs"
                mt="sm"
                pl="sm"
                style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
              >
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  {t.import.subcategoriesOf(c.name)}
                </Text>
                {subs.map((s) => {
                  const sm = mappings.subcategories[s.key]!;
                  return (
                    <Stack key={s.key} gap={4}>
                      <Group justify="space-between">
                        <Text size="sm" fw={500}>
                          {s.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {t.import.rows(s.count)}
                        </Text>
                      </Group>
                      <SegmentedControl
                        size="xs"
                        fullWidth
                        value={sm.action}
                        data={[
                          { value: 'new', label: t.import.createNew },
                          { value: 'existing', label: t.import.linkTo, disabled: existingSubs.length === 0 },
                          { value: 'drop', label: t.import.drop },
                        ]}
                        onChange={(action) =>
                          onSubcategory(
                            s.key,
                            action === 'new'
                              ? { action: 'new', name: s.name }
                              : action === 'existing'
                                ? { action: 'existing', categoryId: existingSubs[0]?.value ?? '' }
                                : { action: 'drop' },
                          )
                        }
                      />
                      {sm.action === 'new' && (
                        <TextInput
                          size="xs"
                          aria-label={t.import.newName}
                          value={sm.name}
                          onChange={(e) =>
                            onSubcategory(s.key, { action: 'new', name: e.currentTarget.value })
                          }
                          error={!sm.name.trim()}
                        />
                      )}
                      {sm.action === 'existing' && (
                        <Select
                          size="xs"
                          aria-label={t.import.linkTo}
                          data={existingSubs}
                          value={sm.categoryId || null}
                          allowDeselect={false}
                          onChange={(v) => onSubcategory(s.key, { action: 'existing', categoryId: v ?? '' })}
                        />
                      )}
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Paper>
        );
      })}
      {loaded.source.categories.length === 0 && <Text c="dimmed">—</Text>}
    </Stack>
  );
}

// ---------- page ----------

function mappingsValid(m: Mappings | null): boolean {
  if (!m) return false;
  const accounts = Object.values(m.accounts).every((a) => (a.action === 'new' ? a.name.trim() : a.accountId));
  const categories = Object.values(m.categories).every((c) =>
    c.action === 'new' ? c.name.trim() : c.categoryId,
  );
  const subs = Object.values(m.subcategories).every((s) =>
    s.action === 'new' ? s.name.trim() : s.action === 'existing' ? s.categoryId : true,
  );
  return Boolean(accounts && categories && subs);
}

export function ImportPage() {
  const data = useFinanceData();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mappings, setMappings] = useState<Mappings | null>(null);
  const [options, setOptions] = useState<ImportOptions>({ uncategorized: 'keep', skipDuplicates: true });
  const [busy, setBusy] = useState(false);

  const plan = useMemo(
    () =>
      data && loaded && mappings && mappingsValid(mappings)
        ? buildImportPlan(loaded.valid, mappings, options, data, newId)
        : null,
    [data, loaded, mappings, options],
  );

  if (!data) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  const load = async (file: File) => {
    const parsed = parseTransactionsCsv(await file.text());
    const valid = parsed.rows.filter(isValidRow);
    const source = summarizeSource(valid);
    setLoaded({ fileName: file.name, parsed, valid, source });
    setMappings(suggestMappings(source, data.accounts, data.categories));
  };

  const setCategory = (key: string, m: CategoryMapping) =>
    setMappings((prev) => {
      if (!prev || !loaded) return prev;
      // The parent changed: reset its subcategories to "create" (or "drop" under transfers).
      const kind = categoryKindOf(m, data);
      const subcategories = { ...prev.subcategories };
      for (const s of loaded.source.subcategories.filter((x) => x.categoryKey === key)) {
        subcategories[s.key] = kind === 'transfer' ? { action: 'drop' } : { action: 'new', name: s.name };
      }
      return { ...prev, categories: { ...prev.categories, [key]: m }, subcategories };
    });

  const runImport = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await applyImportPlan(plan);
      notifications.show({ color: 'teal', message: t.import.done(plan.stats.imported) });
      const index = indexCategories([...data.categories, ...plan.categories]);
      const hasErrors = findIssues(plan.transactions, index).some((i) => i.level === 'error');
      navigate(hasErrors ? '/pendencias' : '/lancamentos');
    } finally {
      setBusy(false);
    }
  };

  const canAdvance =
    step === 0 ? Boolean(loaded && loaded.valid.length > 0) : step < 3 ? mappingsValid(mappings) : false;
  const hasUncategorized = loaded?.valid.some((r) => !r.category) ?? false;

  return (
    <>
      <PageHeader title={t.nav.import} />
      <Stack maw={860}>
        <Stepper active={step} onStepClick={setStep} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label={t.import.steps.file} />
          <Stepper.Step label={t.import.steps.accounts} />
          <Stepper.Step label={t.import.steps.categories} />
          <Stepper.Step label={t.import.steps.review} />
        </Stepper>

        {step === 0 && <FileStep loaded={loaded} onLoad={(f) => void load(f)} />}
        {step === 1 && loaded && mappings && (
          <AccountsStep
            loaded={loaded}
            mappings={mappings}
            data={data}
            onChange={(key, m) => setMappings((p) => p && { ...p, accounts: { ...p.accounts, [key]: m } })}
          />
        )}
        {step === 2 && loaded && mappings && (
          <CategoriesStep
            loaded={loaded}
            mappings={mappings}
            data={data}
            onCategory={setCategory}
            onSubcategory={(key, m) =>
              setMappings((p) => p && { ...p, subcategories: { ...p.subcategories, [key]: m } })
            }
          />
        )}
        {step === 3 && plan && (
          <Stack>
            {hasUncategorized && (
              <Paper>
                <Text fw={600} mb="xs">
                  {t.import.uncategorizedTitle}
                </Text>
                <Radio.Group
                  value={options.uncategorized}
                  onChange={(v) =>
                    setOptions((o) => ({ ...o, uncategorized: v as ImportOptions['uncategorized'] }))
                  }
                >
                  <Stack gap="xs">
                    <Radio value="keep" label={t.import.uncategorizedKeep} />
                    <Radio value="extraordinary" label={t.import.uncategorizedExtraordinary} />
                  </Stack>
                </Radio.Group>
              </Paper>
            )}
            <Paper>
              <Checkbox
                checked={options.skipDuplicates}
                onChange={(e) => {
                  // Read the event now: React clears currentTarget before deferred updaters run.
                  const skipDuplicates = e.currentTarget.checked;
                  setOptions((o) => ({ ...o, skipDuplicates }));
                }}
                label={t.import.skipDuplicates}
              />
            </Paper>
            <Paper>
              <Text fw={600} mb="xs">
                {t.import.summary}
              </Text>
              <Stack gap={4}>
                {(Object.keys(t.import.stats) as (keyof typeof t.import.stats)[]).map((key) => (
                  <Group key={key} justify="space-between">
                    <Text size="sm">{t.import.stats[key]}</Text>
                    <Text
                      size="sm"
                      fw={600}
                      c={
                        plan.stats[key] > 0 && (key === 'uncategorized' || key === 'unpairedTransfers')
                          ? 'yellow'
                          : undefined
                      }
                    >
                      {plan.stats[key]}
                    </Text>
                  </Group>
                ))}
              </Stack>
              {plan.unpairedTransferLines.length > 0 && (
                <Text size="xs" c="dimmed" mt="xs">
                  {t.import.unpairedLines(plan.unpairedTransferLines.join(', '))}
                </Text>
              )}
            </Paper>
            <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
              <Group justify="space-between">
                <Text size="sm">{t.import.backupFirst}</Text>
                <Button
                  size="xs"
                  variant="light"
                  color="yellow"
                  leftSection={<IconDatabaseExport size={14} />}
                  onClick={() => void exportBackupFile()}
                >
                  {t.dashboard.backupNow}
                </Button>
              </Group>
            </Alert>
          </Stack>
        )}

        <Group justify="space-between">
          <Button variant="default" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            {t.import.back}
          </Button>
          {step < 3 ? (
            <Button disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
              {t.import.next}
            </Button>
          ) : (
            <Button
              loading={busy}
              disabled={!plan || plan.stats.imported === 0}
              onClick={() => void runImport()}
            >
              {plan && plan.stats.imported === 0 ? t.import.nothing : t.import.confirm}
            </Button>
          )}
        </Group>
      </Stack>
    </>
  );
}
