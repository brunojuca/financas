import { Button, Group, NumberInput, Stack, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { MoneyInput } from '../../components/MoneyInput';
import { isIsoDate } from '../../domain/dates';
import type { MarketData } from '../../domain/fixedIncome/market';
import { applyRedemptions, positionOn } from '../../domain/fixedIncome/redemption';
import { isPricedTesouro, type Lot, type Redemption, type Titulo } from '../../domain/fixedIncome/types';
import { lotGrossValue, lotQuantity } from '../../domain/fixedIncome/valuation';
import { formatBRL } from '../../domain/money';
import type { IsoDate } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { newId, saveLot, saveRedemption } from '../../storage/repo';
import { formatQuantity } from './format';
import { LotFields } from './LotFields';
import { draftToLot, emptyLot, lotToDraft, validateLot, type LotDraft } from './lotDraft';

function Actions({ onCancel }: { onCancel: () => void }) {
  return (
    <Group justify="flex-end" mt="sm">
      <Button variant="default" onClick={onCancel}>
        {t.common.cancel}
      </Button>
      <Button type="submit">{t.common.save}</Button>
    </Group>
  );
}

/** New purchase of an existing título, or editing one. */
export function LotForm({
  titulo,
  editing,
  onDone,
}: {
  titulo: Titulo;
  editing: Lot | null;
  onDone: () => void;
}) {
  const form = useForm<{ lot: LotDraft }>({
    initialValues: { lot: editing ? lotToDraft(editing) : emptyLot() },
    validate: (v) => validateLot(titulo.product, v.lot, titulo.maturity),
  });
  const submit = async ({ lot }: { lot: LotDraft }) => {
    await saveLot(draftToLot(titulo.product, lot, editing?.id ?? newId(), titulo.id));
    notifications.show({ color: 'teal', message: t.investments.saved });
    onDone();
  };
  return (
    <form onSubmit={form.onSubmit((v) => void submit(v))}>
      <Stack>
        <LotFields form={form} product={titulo.product} />
        <Actions onCancel={onDone} />
      </Stack>
    </form>
  );
}

interface RedemptionValues {
  date: IsoDate | null;
  quantity: number | string;
  gross: number | null;
  net: number | null;
}

/** Partial (or total) redemption. Validated against the position held on that date. */
export function RedemptionForm({
  titulo,
  lots,
  redemptions,
  market,
  onDone,
}: {
  titulo: Titulo;
  lots: Lot[];
  redemptions: Redemption[];
  market: MarketData;
  onDone: () => void;
}) {
  const priced = isPricedTesouro(titulo.product);
  const form = useForm<RedemptionValues>({
    initialValues: { date: null, quantity: '', gross: null, net: null },
    validate: {
      date: (v) => (isIsoDate(v) ? null : t.common.required),
      quantity: (v) => (!priced || Number(v) > 0 ? null : t.common.required),
      gross: (v) => (priced || (v !== null && v > 0) ? null : t.transactions.amountPositive),
    },
  });
  const { date } = form.getValues();

  // What is held on the chosen date, to show and to validate against.
  let available: string | null = null;
  if (isIsoDate(date)) {
    const held = positionOn(titulo, lots, redemptions, date, market);
    available = priced
      ? t.investments.held(formatQuantity(held.reduce((s, l) => s + lotQuantity(titulo, l, market), 0)))
      : formatBRL(Math.round(held.reduce((s, l) => s + lotGrossValue(titulo, l, date, market), 0) * 100));
  }

  const submit = async (v: RedemptionValues) => {
    const redemption: Redemption = {
      id: newId(),
      tituloId: titulo.id,
      date: v.date!,
      quantity: priced ? Number(v.quantity) : null,
      grossCents: priced ? null : v.gross,
      netCents: v.net,
    };
    try {
      applyRedemptions(titulo, lots, [...redemptions, redemption], market);
    } catch {
      form.setFieldError(priced ? 'quantity' : 'gross', t.investments.exceedsPosition);
      return;
    }
    await saveRedemption(redemption);
    notifications.show({ color: 'teal', message: t.investments.saved });
    onDone();
  };

  return (
    <form onSubmit={form.onSubmit((v) => void submit(v))}>
      <Stack>
        <DateInput
          label={t.investments.redemptionDate}
          valueFormat="DD/MM/YYYY"
          placeholder={t.transactions.datePlaceholder}
          key={form.key('date')}
          {...form.getInputProps('date')}
        />
        {available && (
          <Text size="sm" c="dimmed">
            {available}
          </Text>
        )}
        {priced ? (
          <NumberInput
            label={t.investments.redemptionQuantity}
            decimalSeparator=","
            thousandSeparator="."
            decimalScale={2}
            min={0}
            hideControls
            key={form.key('quantity')}
            {...form.getInputProps('quantity')}
          />
        ) : (
          <MoneyInput
            label={t.investments.grossAmount}
            key={form.key('gross')}
            {...form.getInputProps('gross')}
          />
        )}
        <MoneyInput
          label={t.investments.netReceived}
          description={t.investments.netReceivedHint}
          key={form.key('net')}
          {...form.getInputProps('net')}
        />
        <Actions onCancel={onDone} />
      </Stack>
    </form>
  );
}
