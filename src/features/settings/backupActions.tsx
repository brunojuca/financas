import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Text } from '@mantine/core';
import { downloadFile } from '../../components/download';
import { formatDateBR, todayIso } from '../../domain/dates';
import { backupErrors, t } from '../../i18n/pt-BR';
import {
  BackupError,
  createBackup,
  markBackupDone,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from '../../storage/backup';

export async function exportBackupFile(): Promise<void> {
  const backup = await createBackup();
  downloadFile(`financas-backup-${todayIso()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  await markBackupDone();
}

async function readBackup(file: File): Promise<BackupFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new BackupError('JSON inválido');
  }
  return parseBackup(raw);
}

/** Reads, validates and (after confirmation when `confirm` is set) restores a backup file. */
export async function importBackupFile(file: File | null, confirm: boolean): Promise<void> {
  if (!file) return;
  let backup: BackupFile;
  try {
    backup = await readBackup(file);
  } catch (e) {
    const reason = e instanceof BackupError ? (backupErrors[e.message] ?? e.message) : String(e);
    notifications.show({ color: 'red', message: t.settings.importError(reason) });
    return;
  }
  const restore = async () => {
    await restoreBackup(backup);
    notifications.show({ color: 'teal', message: t.settings.imported });
  };
  if (!confirm) return restore();
  modals.openConfirmModal({
    title: t.settings.importConfirmTitle,
    children: (
      <Text size="sm">{t.settings.importConfirmText(formatDateBR(backup.exportedAt.slice(0, 10)))}</Text>
    ),
    confirmProps: { color: 'red' },
    onConfirm: () => void restore(),
  });
}
