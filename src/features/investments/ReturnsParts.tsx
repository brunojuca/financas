import { ActionIcon, Group, Modal, Paper, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import type { Rate, Returns } from '../../domain/fixedIncome/portfolio';
import { formatPercent } from '../../domain/money';
import { t } from '../../i18n/pt-BR';
import { perYearText } from './format';

const MARKET_COLOR = 'blue';

/** Curve value on top; market value below (blue) when there is a market price. */
export function CurveMarket({
  curve,
  market,
  size = 'sm',
}: {
  curve: string;
  market: string | null;
  size?: 'xs' | 'sm';
}) {
  return (
    <Stack gap={0} align="flex-end" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      <Text size={size}>{curve}</Text>
      {market !== null && (
        <Text size="xs" c={MARKET_COLOR}>
          {market}
        </Text>
      )}
    </Stack>
  );
}

function RateCell({ rate, showTotal = false }: { rate: Rate | null; showTotal?: boolean }) {
  if (!rate) return <Text size="sm">—</Text>;
  return (
    <Stack gap={0} align="flex-end" style={{ whiteSpace: 'nowrap' }}>
      <Text size="sm">{perYearText(rate)}</Text>
      {showTotal && rate.perYear !== null && (
        <Text size="xs" c="dimmed">
          {formatPercent(rate.total)} {t.investments.inPeriod}
        </Text>
      )}
    </Stack>
  );
}

/** Help text for a topic (from `t.investments.help`), shown on hover. */
const helpText = (title: string) => t.investments.help.find((h) => h.title.startsWith(title))?.text ?? '';

function Label({ title, hint, help }: { title: string; hint: string; help: string }) {
  return (
    <Tooltip label={help} multiline w={320} withArrow openDelay={200} disabled={!help}>
      <div style={{ cursor: help ? 'help' : undefined }}>
        <Text size="sm">{title}</Text>
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      </div>
    </Tooltip>
  );
}

/** Info button that opens every explanation (works on touch screens, where tooltips don't). */
export function HelpButton() {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Tooltip label={t.investments.howToRead}>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t.investments.howToRead}
          onClick={() => setOpened(true)}
        >
          <IconInfoCircle size={18} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={opened} onClose={() => setOpened(false)} title={t.investments.howToRead} size="lg">
        <Stack gap="sm">
          {t.investments.help.map((item) => (
            <div key={item.title}>
              <Text size="sm" fw={600}>
                {item.title}
              </Text>
              <Text size="sm" c="dimmed">
                {item.text}
              </Text>
            </div>
          ))}
        </Stack>
      </Modal>
    </>
  );
}

/** The three returns (past, projected, keep-vs-sell), gross and net. */
export function ReturnsCard({ returns }: { returns: Returns }) {
  const { sincePurchase, toMaturity, fromToday } = returns;
  return (
    <Paper h="100%">
      <Group justify="space-between" mb="xs">
        <Text fw={600}>{t.investments.returnsTitle}</Text>
        <HelpButton />
      </Group>
      <Table verticalSpacing={6} horizontalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th ta="right">{t.investments.grossShort}</Table.Th>
            <Table.Th ta="right">{t.investments.netShort}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td>
              <Label
                title={`${t.investments.sincePurchase} · ${t.investments.onCurve}`}
                hint={t.investments.sincePurchaseHint}
                help={helpText('Desde a compra')}
              />
            </Table.Td>
            <Table.Td ta="right">
              <RateCell rate={sincePurchase.gross} showTotal />
            </Table.Td>
            <Table.Td ta="right">
              <RateCell rate={sincePurchase.net} showTotal />
            </Table.Td>
          </Table.Tr>
          {sincePurchase.marketNet && (
            <Table.Tr>
              <Table.Td>
                <Tooltip label={helpText('Mercado')} multiline w={320} withArrow openDelay={200}>
                  <div style={{ cursor: 'help' }}>
                    <Text size="sm" c={MARKET_COLOR}>
                      {t.investments.sincePurchase} · {t.investments.atMarketShort}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t.investments.sincePurchaseHint}
                    </Text>
                  </div>
                </Tooltip>
              </Table.Td>
              <Table.Td ta="right">
                <RateCell rate={sincePurchase.marketGross} showTotal />
              </Table.Td>
              <Table.Td ta="right">
                <RateCell rate={sincePurchase.marketNet} showTotal />
              </Table.Td>
            </Table.Tr>
          )}
          <Table.Tr>
            <Table.Td>
              <Label
                title={t.investments.toMaturity}
                hint={t.investments.toMaturityHint}
                help={helpText('Até o vencimento')}
              />
            </Table.Td>
            <Table.Td ta="right">
              <RateCell rate={toMaturity.gross} />
            </Table.Td>
            <Table.Td ta="right">
              <RateCell rate={toMaturity.net} />
            </Table.Td>
          </Table.Tr>
          {fromToday !== null && (
            <Table.Tr>
              <Table.Td>
                <Label
                  title={t.investments.fromToday}
                  hint={t.investments.fromTodayHint}
                  help={helpText('Mantendo')}
                />
              </Table.Td>
              <Table.Td ta="right">
                <Text size="sm">—</Text>
              </Table.Td>
              <Table.Td ta="right">
                <Text size="sm">
                  {formatPercent(fromToday)} {t.investments.perYear}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
