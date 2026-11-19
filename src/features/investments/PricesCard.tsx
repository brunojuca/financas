import { Anchor, Button, FileButton, Group, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconFileImport, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { formatDateBR } from '../../domain/dates';
import type { LivePrices, TesouroPrices } from '../../domain/fixedIncome/tesouroPrices';
import { t } from '../../i18n/pt-BR';
import { TESOURO_PRICES_URL } from '../../reference/sources';
import { importTesouroPrices, updateTesouroLive } from '../../storage/referenceUpdates';

/** "2026-11-18T18:00:02" → "18/11/2026 18:00" (the Tesouro's own clock, Brasília time). */
function formatPricedAt(iso: string): string {
  return `${formatDateBR(iso.slice(0, 10))} ${iso.slice(11, 16)}`;
}

export function PricesCard({ prices, live }: { prices: TesouroPrices | null; live: LivePrices | null }) {
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    const ok = await updateTesouroLive();
    setRefreshing(false);
    notifications.show(
      ok
        ? { color: 'teal', message: t.investments.liveUpdated }
        : { color: 'yellow', message: t.investments.liveFailed },
    );
  };
  const pick = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const imported = await importTesouroPrices(file);
      notifications.show({
        color: 'teal',
        message: t.investments.pricesImported(formatDateBR(imported.lastDate)),
      });
    } catch {
      notifications.show({ color: 'red', message: t.investments.pricesInvalid });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper h="100%">
      <Stack gap="xs">
        <Text fw={600}>{t.investments.pricesTitle}</Text>
        <Group justify="space-between" align="center">
          <Text size="sm">
            {live ? t.investments.liveStatus(formatPricedAt(live.pricedAt)) : t.investments.liveNone}
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={16} />}
            loading={refreshing}
            onClick={() => void refresh()}
          >
            {t.investments.liveUpdate}
          </Button>
        </Group>
        <Text size="sm">
          {prices ? t.investments.pricesStatus(formatDateBR(prices.lastDate)) : t.investments.pricesNone}
        </Text>
        <Text size="xs" c="dimmed">
          {t.investments.pricesHowTo}
        </Text>
        <Group gap="sm">
          <Anchor href={TESOURO_PRICES_URL} target="_blank" rel="noopener noreferrer" size="sm">
            <Group gap={4}>
              <IconDownload size={16} />
              {t.investments.pricesDownload}
            </Group>
          </Anchor>
          <FileButton onChange={(f) => void pick(f)} accept=".csv,text/csv">
            {(props) => (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconFileImport size={16} />}
                loading={busy}
                {...props}
              >
                {t.investments.pricesImport}
              </Button>
            )}
          </FileButton>
        </Group>
      </Stack>
    </Paper>
  );
}
