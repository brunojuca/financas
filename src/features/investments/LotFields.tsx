import { Checkbox, Group, NumberInput, Stack, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import type { UseFormReturnType } from '@mantine/form';
import { MoneyInput } from '../../components/MoneyInput';
import { isPricedTesouro, usesUnits, type Product } from '../../domain/fixedIncome/types';
import { formatBRL } from '../../domain/money';
import { t } from '../../i18n/pt-BR';
import { pricedAmountCents, type LotDraft } from './lotDraft';

const rateProps = {
  decimalSeparator: ',',
  thousandSeparator: '.',
  decimalScale: 4,
  suffix: ' %',
  hideControls: true,
} as const;

export function LotFields<V extends { lot: LotDraft }>({
  form,
  product,
}: {
  form: UseFormReturnType<V>;
  product: Product;
}) {
  const lot = form.getValues().lot;
  const priced = isPricedTesouro(product);
  const units = usesUnits(product);
  const reserva = product === 'tesouroReserva';
  const computed = units && !lot.useRate ? pricedAmountCents(lot) : null;
  return (
    <Stack gap="sm">
      <DateInput
        label={t.investments.purchaseDate}
        valueFormat="DD/MM/YYYY"
        placeholder={t.transactions.datePlaceholder}
        key={form.key('lot.date')}
        {...form.getInputProps('lot.date')}
      />
      {units && (
        <Checkbox
          label={reserva ? t.investments.reservaAmountOnly : t.investments.useRate}
          key={form.key('lot.useRate')}
          {...form.getInputProps('lot.useRate', { type: 'checkbox' })}
        />
      )}
      {units && !lot.useRate ? (
        <>
          <Group grow align="flex-start">
            <NumberInput
              label={t.investments.quantity}
              decimalSeparator=","
              thousandSeparator="."
              decimalScale={reserva ? 6 : 2}
              min={0}
              hideControls
              key={form.key('lot.quantity')}
              {...form.getInputProps('lot.quantity')}
            />
            <NumberInput
              label={t.investments.unitPrice}
              decimalSeparator=","
              thousandSeparator="."
              decimalScale={6}
              min={0}
              hideControls
              key={form.key('lot.unitPrice')}
              {...form.getInputProps('lot.unitPrice')}
            />
          </Group>
          {computed !== null && (
            <Text size="sm" c="dimmed">
              {t.investments.computedAmount(formatBRL(computed))}
            </Text>
          )}
          {priced ? (
            <NumberInput
              label={t.investments.statementRate}
              description={t.investments.statementRateHint}
              {...rateProps}
              key={form.key('lot.ratePercent')}
              {...form.getInputProps('lot.ratePercent')}
            />
          ) : (
            <Text size="xs" c="dimmed">
              {t.investments.reservaUnitsHint}
            </Text>
          )}
        </>
      ) : (
        <Group grow align="flex-start">
          <MoneyInput
            label={t.investments.amount}
            key={form.key('lot.amount')}
            {...form.getInputProps('lot.amount')}
          />
          {priced && (
            <NumberInput
              label={t.investments.contractedRate}
              description={product === 'tesouroSelic' ? t.investments.contractedRateHint : undefined}
              {...rateProps}
              key={form.key('lot.ratePercent')}
              {...form.getInputProps('lot.ratePercent')}
            />
          )}
        </Group>
      )}
    </Stack>
  );
}
