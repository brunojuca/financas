import { Button, FileButton, Group, Paper, Radio, Stack, Switch, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconDatabaseExport,
  IconDatabaseImport,
  IconFileImport,
  IconFileSpreadsheet,
  IconFlask,
  IconTrash,
} from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common';
import { downloadFile } from '../../components/download';
import { currentMonth, formatDateBR, todayIso } from '../../domain/dates';
import { t } from '../../i18n/pt-BR';
import { transactionsToCsv } from '../../storage/backup';
import { db, getMeta, isStoragePersisted, META, requestPersistentStorage, setMeta } from '../../storage/db';
import { clearAllData, loadDemoData } from '../../storage/repo';
import { exportBackupFile, importBackupFile } from './backupActions';

function Section({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <Paper style={danger ? { borderColor: 'var(--mantine-color-red-filled)' } : undefined}>
      <Title order={4} mb="xs" c={danger ? 'red' : undefined}>
        {title}
      </Title>
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}

export function SettingsPage() {
  const lastBackupAt = useLiveQuery(() => getMeta(META.lastBackupAt), []);
  const cardReportMode = useLiveQuery(() => getMeta(META.cardReportMode), []);
  const showAlt = useLiveQuery(() => getMeta(META.showAltCardReport), []);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);

  const exportCsv = async () => {
    const [transactions, accounts, categories] = await Promise.all([
      db.transactions.toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),
    ]);
    downloadFile(
      `financas-lancamentos-${todayIso()}.csv`,
      transactionsToCsv(transactions, accounts, categories),
      'text/csv;charset=utf-8',
    );
  };

  const confirm = (title: string, text: string, label: string, action: () => Promise<void>) =>
    modals.openConfirmModal({
      title,
      children: <Text size="sm">{text}</Text>,
      labels: { confirm: label, cancel: t.common.cancel },
      confirmProps: { color: 'red' },
      onConfirm: () => void action(),
    });

  return (
    <>
      <PageHeader title={t.nav.settings} />
      <Stack maw={720}>
        <Section title={t.settings.cardReportTitle}>
          <Text size="sm" c="dimmed">
            {t.settings.cardReportText}
          </Text>
          <Radio.Group
            value={cardReportMode === 'purchase' ? 'purchase' : 'bill'}
            onChange={(v) => void setMeta(META.cardReportMode, v)}
          >
            <Stack gap="xs">
              <Radio
                value="bill"
                label={t.settings.cardReportBill}
                description={t.settings.cardReportBillHint}
              />
              <Radio
                value="purchase"
                label={t.settings.cardReportPurchase}
                description={t.settings.cardReportPurchaseHint}
              />
            </Stack>
          </Radio.Group>
          <Switch
            label={t.settings.showAltCardReport}
            description={t.settings.showAltCardReportHint}
            checked={showAlt === 'true'}
            onChange={(e) => void setMeta(META.showAltCardReport, String(e.currentTarget.checked))}
          />
        </Section>
        <Section title={t.settings.backupTitle}>
          <Text size="sm" c="dimmed">
            {t.settings.backupText}
          </Text>
          <Text size="sm" fw={500}>
            {lastBackupAt
              ? t.settings.lastBackup(formatDateBR(lastBackupAt.slice(0, 10)))
              : t.settings.neverBackedUp}
          </Text>
          <Group>
            <Button leftSection={<IconDatabaseExport size={18} />} onClick={() => void exportBackupFile()}>
              {t.settings.exportBackup}
            </Button>
            <FileButton onChange={(f) => void importBackupFile(f, true)} accept="application/json,.json">
              {(props) => (
                <Button variant="default" leftSection={<IconDatabaseImport size={18} />} {...props}>
                  {t.settings.importBackup}
                </Button>
              )}
            </FileButton>
          </Group>
        </Section>

        <Section title={t.settings.exportCsv}>
          <Text size="sm" c="dimmed">
            {t.settings.csvText}
          </Text>
          <Group>
            <Button
              variant="default"
              leftSection={<IconFileSpreadsheet size={18} />}
              onClick={() => void exportCsv()}
            >
              {t.settings.exportCsv}
            </Button>
            <Button
              variant="default"
              leftSection={<IconFileImport size={18} />}
              component={Link}
              to="/importar"
            >
              {t.nav.import}
            </Button>
          </Group>
        </Section>

        <Section title={t.settings.storageTitle}>
          <Text size="sm" c="dimmed">
            {persisted ? t.settings.persisted : t.settings.notPersisted}
          </Text>
          {persisted === false && (
            <Group>
              <Button variant="default" onClick={() => void requestPersistentStorage().then(setPersisted)}>
                {t.settings.requestPersist}
              </Button>
            </Group>
          )}
        </Section>

        <Section title={t.settings.privacyTitle}>
          <Text size="sm" c="dimmed">
            {t.settings.privacyText}
          </Text>
        </Section>

        <Section title={t.settings.demoTitle}>
          <Text size="sm" c="dimmed">
            {t.settings.demoText}
          </Text>
          <Group>
            <Button
              variant="default"
              leftSection={<IconFlask size={18} />}
              onClick={() =>
                confirm(t.settings.demoConfirmTitle, t.settings.demoConfirmText, t.settings.loadDemo, () =>
                  loadDemoData(currentMonth()),
                )
              }
            >
              {t.settings.loadDemo}
            </Button>
          </Group>
        </Section>

        <Section title={t.settings.dangerTitle} danger>
          <Text size="sm" c="dimmed">
            {t.settings.dangerText}
          </Text>
          <Group>
            <Button
              color="red"
              leftSection={<IconTrash size={18} />}
              onClick={() =>
                confirm(
                  t.settings.eraseConfirmTitle,
                  t.settings.eraseConfirmText,
                  t.settings.eraseAll,
                  clearAllData,
                )
              }
            >
              {t.settings.eraseAll}
            </Button>
          </Group>
        </Section>
      </Stack>
    </>
  );
}
