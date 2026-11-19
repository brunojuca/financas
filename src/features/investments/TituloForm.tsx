import { Button, Divider, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { isIsoDate } from '../../domain/dates';
import {
  isPricedTesouro,
  type BankIndexer,
  type Product,
  type RedemptionOrder,
  type Titulo,
} from '../../domain/fixedIncome/types';
import type { IsoDate } from '../../domain/types';
import { t } from '../../i18n/pt-BR';
import { newId, saveTitulo } from '../../storage/repo';
import { describeTerms } from './format';
import { LotFields } from './LotFields';
import { draftToLot, emptyLot, validateLot, type LotDraft } from './lotDraft';

interface Values {
  product: Product;
  name: string;
  maturity: IsoDate | null;
  issuer: string;
  indexer: BankIndexer;
  cdiPercent: number | string;
  ratePercent: number | string;
  redemptionOrder: RedemptionOrder;
  lot: LotDraft;
}

const PRODUCTS = (Object.keys(t.investments.products) as Product[]).map((value) => ({
  value,
  label: t.investments.products[value],
}));
const INDEXERS = (Object.keys(t.investments.indexers) as BankIndexer[]).map((value) => ({
  value,
  label: t.investments.indexers[value],
}));

const isBank = (p: Product) => p === 'cdb' || p === 'lci' || p === 'lca';
/** NumberInput gives a string for values like "20240.50" (trailing zeros); '' when empty. */
const num = (v: number | string) => (typeof v === 'number' ? v : v.trim() === '' ? NaN : Number(v));

function toTitulo(v: Values, id: string, previous: Titulo | null): Titulo {
  const bank = isBank(v.product);
  const titulo: Titulo = {
    id,
    name: '',
    product: v.product,
    maturity: v.product === 'tesouroReserva' ? null : v.maturity,
    indexer: bank ? v.indexer : null,
    rate: bank && v.indexer !== 'cdi' ? num(v.ratePercent) / 100 : 0,
    cdiPercent: bank && v.indexer === 'cdi' ? num(v.cdiPercent) : 100,
    redemptionOrder: bank ? v.redemptionOrder : 'fifo',
    issuer: bank ? v.issuer.trim() : '',
    accountId: previous?.accountId ?? null,
    archived: previous?.archived ?? false,
  };
  titulo.name = v.name.trim() || defaultName(titulo);
  return titulo;
}

/** "Tesouro Selic 2029", "CDB Banco X 110% do CDI", "Tesouro Reserva". */
function defaultName(titulo: Titulo): string {
  const product = t.investments.products[titulo.product];
  if (titulo.product === 'tesouroReserva') return product;
  if (isPricedTesouro(titulo.product)) return `${product} ${titulo.maturity?.slice(0, 4) ?? ''}`.trim();
  return [product, titulo.issuer, describeTerms(titulo)].filter(Boolean).join(' ');
}

const rateProps = {
  decimalSeparator: ',',
  thousandSeparator: '.',
  decimalScale: 4,
  suffix: ' %',
  hideControls: true,
} as const;

export function TituloForm({
  editing,
  onDone,
}: {
  editing: Titulo | null;
  /** Called with the saved título's id, or without arguments on cancel. */
  onDone: (savedId?: string) => void;
}) {
  const form = useForm<Values>({
    initialValues: {
      product: editing?.product ?? 'tesouroSelic',
      name: editing?.name ?? '',
      maturity: editing?.maturity ?? null,
      issuer: editing?.issuer ?? '',
      indexer: editing?.indexer ?? 'cdi',
      cdiPercent: editing?.cdiPercent ?? 100,
      ratePercent: editing && editing.indexer !== 'cdi' ? editing.rate * 100 : '',
      redemptionOrder: editing?.redemptionOrder ?? 'fifo',
      lot: emptyLot(),
    },
    validate: (v) => {
      const errors: Record<string, string> = {};
      if (v.product !== 'tesouroReserva' && !isIsoDate(v.maturity)) errors.maturity = t.common.required;
      if (isBank(v.product)) {
        if (v.indexer === 'cdi' && !(num(v.cdiPercent) > 0)) errors.cdiPercent = t.common.required;
        if (v.indexer !== 'cdi' && Number.isNaN(num(v.ratePercent))) errors.ratePercent = t.common.required;
      }
      if (!editing) Object.assign(errors, validateLot(v.product, v.lot, v.maturity));
      return errors;
    },
  });
  const v = form.getValues();
  const bank = isBank(v.product);

  const submit = async (values: Values) => {
    const id = editing?.id ?? newId();
    const titulo = toTitulo(values, id, editing);
    await saveTitulo(titulo, editing ? undefined : draftToLot(values.product, values.lot, newId(), id));
    notifications.show({ color: 'teal', message: t.investments.saved });
    onDone(id);
  };

  return (
    <form onSubmit={form.onSubmit((values) => void submit(values))}>
      <Stack>
        <Select
          label={t.investments.product}
          data={PRODUCTS}
          allowDeselect={false}
          disabled={editing !== null}
          key={form.key('product')}
          {...form.getInputProps('product')}
        />
        {v.product !== 'tesouroReserva' ? (
          <DateInput
            label={t.investments.maturity}
            valueFormat="DD/MM/YYYY"
            placeholder={t.transactions.datePlaceholder}
            key={form.key('maturity')}
            {...form.getInputProps('maturity')}
          />
        ) : (
          <Text size="sm" c="dimmed">
            {t.investments.reservaNote}
          </Text>
        )}
        {bank && (
          <>
            <TextInput
              label={t.investments.issuer}
              key={form.key('issuer')}
              {...form.getInputProps('issuer')}
            />
            <Group grow align="flex-start">
              <Select
                label={t.investments.indexer}
                data={INDEXERS}
                allowDeselect={false}
                key={form.key('indexer')}
                {...form.getInputProps('indexer')}
              />
              {v.indexer === 'cdi' ? (
                <NumberInput
                  label={t.investments.cdiPercent}
                  {...rateProps}
                  decimalScale={2}
                  key={form.key('cdiPercent')}
                  {...form.getInputProps('cdiPercent')}
                />
              ) : (
                <NumberInput
                  label={
                    v.indexer === 'pre'
                      ? t.investments.fixedRate
                      : v.indexer === 'cdiSpread'
                        ? t.investments.spread
                        : t.investments.realRate
                  }
                  {...rateProps}
                  key={form.key('ratePercent')}
                  {...form.getInputProps('ratePercent')}
                />
              )}
            </Group>
            <Select
              label={t.investments.redemptionOrder}
              data={[
                { value: 'fifo', label: t.investments.fifo },
                { value: 'lifo', label: t.investments.lifo },
              ]}
              allowDeselect={false}
              key={form.key('redemptionOrder')}
              {...form.getInputProps('redemptionOrder')}
            />
          </>
        )}
        <TextInput
          label={t.investments.name}
          placeholder={t.investments.namePlaceholder}
          key={form.key('name')}
          {...form.getInputProps('name')}
        />
        {!editing && (
          <>
            <Divider label={t.investments.firstPurchase} labelPosition="left" mt="xs" />
            <LotFields form={form} product={v.product} />
          </>
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={() => onDone()}>
            {t.common.cancel}
          </Button>
          <Button type="submit">{t.common.save}</Button>
        </Group>
      </Stack>
    </form>
  );
}
