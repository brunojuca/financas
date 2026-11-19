// Public reference-data sources (GET only, no cookies, no identifiers). The refresh script
// scripts/update-reference.mjs fetches the same URLs — keep both in sync.
import type { FocusSurvey } from '../domain/fixedIncome/focus';
import { parseTesouroLive, type LivePrices } from '../domain/fixedIncome/tesouroPrices';
import type { IsoDate, YearMonth } from '../domain/types';

const toBr = (iso: IsoDate) => iso.split('-').reverse().join('/');
const fromBr = (br: string) => br.split('/').reverse().join('-');

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Daily rows of an SGS series from `from` (inclusive). An empty period answers 404: treated as no rows. */
export async function fetchSgs(code: number, from: IsoDate): Promise<[IsoDate, number][]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${toBr(from)}`;
  try {
    const rows = (await getJson(url)) as { data: string; valor: string }[];
    return rows.map((r) => [fromBr(r.data), Number(r.valor)]);
  } catch (e) {
    if (e instanceof Error && e.message === 'HTTP 404') return [];
    throw e;
  }
}

/** IPCA number index (IBGE SIDRA table 1737, variable 2266) for [from, to]. */
export async function fetchIpcaIndex(from: YearMonth, to: YearMonth): Promise<[YearMonth, number][]> {
  const period = `${from.replace('-', '')}-${to.replace('-', '')}`;
  const rows = (await getJson(`https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/${period}`)) as {
    V: string;
    D3C: string;
  }[];
  return rows
    .slice(1)
    .filter((r) => r.V !== '...' && r.V !== '-' && r.V !== '')
    .map((r) => [`${r.D3C.slice(0, 4)}-${r.D3C.slice(4)}`, Number(r.V)]);
}

const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata';

async function focusRows(resource: string, indicator: string) {
  const filter = encodeURIComponent(`Indicador eq '${indicator}' and baseCalculo eq 0`);
  const url = `${OLINDA}/${resource}?$format=json&$top=200&$orderby=Data%20desc&$select=Data,DataReferencia,Mediana&$filter=${filter}`;
  const rows = (
    (await getJson(url)) as { value: { Data: string; DataReferencia: string; Mediana: number }[] }
  ).value;
  if (rows.length === 0) throw new Error('Focus: no rows');
  const latest = rows[0]!.Data;
  return { latest, rows: rows.filter((r) => r.Data === latest) };
}

/** Latest Focus survey: year-end Selic, annual IPCA and monthly IPCA (medians, all respondents). */
export async function fetchFocus(): Promise<FocusSurvey> {
  const [selic, ipcaYear, ipcaMonth] = await Promise.all([
    focusRows('ExpectativasMercadoAnuais', 'Selic'),
    focusRows('ExpectativasMercadoAnuais', 'IPCA'),
    focusRows('ExpectativaMercadoMensais', 'IPCA'),
  ]);
  const byYear = (rows: { DataReferencia: string; Mediana: number }[]) =>
    rows.map((r): [number, number] => [Number(r.DataReferencia), r.Mediana]).sort((a, b) => a[0] - b[0]);
  return {
    date: [selic.latest, ipcaYear.latest, ipcaMonth.latest].sort().at(-1)!,
    selicYearEnd: byYear(selic.rows),
    ipcaAnnual: byYear(ipcaYear.rows),
    ipcaMonthly: ipcaMonth.rows
      .map((r): [YearMonth, number] => [
        `${r.DataReferencia.slice(3)}-${r.DataReferencia.slice(0, 2)}`,
        r.Mediana,
      ])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}

/**
 * Official daily Tesouro Direto price file (Tesouro Transparente open data). Its CORS header blocks fetch(), so
 * the user downloads it with a normal link and picks the file (decision D1).
 */
export const TESOURO_PRICES_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';

/**
 * Current Tesouro Direto redemption prices, from the endpoint the Tesouro Direto website itself uses
 * (undocumented: may change without notice; the imported price file is the fallback — decision D13).
 */
export async function fetchTesouroLive(): Promise<LivePrices> {
  return parseTesouroLive(await getJson('https://www.tesourodireto.com.br/o/rentabilidade/resgatar'));
}
