import { parseYearMonth } from '../dates';
import type { YearMonth } from '../types';
import type { Lot, Redemption, Titulo } from './types';

export interface DemoInvestments {
  titulos: Titulo[];
  lots: Lot[];
  redemptions: Redemption[];
}

/** Fictional fixed-income portfolio for the demo data, dated relative to `lastMonth`. */
export function createDemoInvestments(lastMonth: YearMonth, newId: () => string): DemoInvestments {
  const { year } = parseYearMonth(lastMonth);
  const base = {
    indexer: null,
    rate: 0,
    cdiPercent: 100,
    redemptionOrder: 'fifo' as const,
    issuer: '',
    accountId: null,
    archived: false,
  };
  const titulos: Titulo[] = [];
  const lots: Lot[] = [];
  const redemptions: Redemption[] = [];
  const add = (titulo: Omit<Titulo, 'id'>, ...purchases: Omit<Lot, 'id' | 'tituloId'>[]) => {
    const id = newId();
    titulos.push({ ...titulo, id });
    for (const p of purchases) lots.push({ ...p, id: newId(), tituloId: id });
    return id;
  };
  const byRate = (date: string, amountCents: number, rate: number) => ({
    date,
    amountCents,
    quantity: null,
    unitPrice: null,
    rate,
  });
  const byAmount = (date: string, amountCents: number) => ({
    date,
    amountCents,
    quantity: null,
    unitPrice: null,
    rate: null,
  });

  add(
    { ...base, name: `Tesouro Selic ${year + 3}`, product: 'tesouroSelic', maturity: `${year + 3}-03-01` },
    byRate(`${year - 1}-02-03`, 800_000, 0.0008),
    byRate(`${year - 1}-08-04`, 500_000, 0.0006),
  );
  add(
    {
      ...base,
      name: `Tesouro Prefixado ${year + 3}`,
      product: 'tesouroPrefixado',
      maturity: `${year + 3}-01-01`,
    },
    byRate(`${year - 1}-05-05`, 600_000, 0.138),
  );
  add(
    { ...base, name: `Tesouro IPCA+ ${year + 9}`, product: 'tesouroIpca', maturity: `${year + 9}-05-15` },
    byRate(`${year - 1}-03-10`, 400_000, 0.071),
  );
  const cdb = add(
    {
      ...base,
      name: 'CDB Banco Exemplo 110% CDI',
      product: 'cdb',
      maturity: `${year + 2}-04-10`,
      indexer: 'cdi',
      cdiPercent: 110,
      issuer: 'Banco Exemplo',
    },
    byAmount(`${year - 1}-04-10`, 1_000_000),
  );
  redemptions.push({
    id: newId(),
    tituloId: cdb,
    date: `${year}-01-12`,
    quantity: null,
    grossCents: 200_000,
    netCents: null,
  });
  add(
    {
      ...base,
      name: 'LCI Banco Exemplo 12,5%',
      product: 'lci',
      maturity: `${year + 1}-09-15`,
      indexer: 'pre',
      rate: 0.125,
      issuer: 'Banco Exemplo',
    },
    byAmount(`${year - 1}-09-15`, 300_000),
  );
  add(
    { ...base, name: 'Tesouro Reserva', product: 'tesouroReserva', maturity: null },
    byAmount(`${year}-06-02`, 250_000),
  );
  return { titulos, lots, redemptions };
}
