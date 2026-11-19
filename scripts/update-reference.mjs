// Refreshes the bundled public reference data in src/reference/ (run: npm run update-reference).
// Sources are public government APIs; requests carry only series codes and dates.
// The app fetches the same sources in src/reference/sources.ts — keep URLs and parsing in sync.
import { writeFile } from 'node:fs/promises';

const START = '2000-07-01'; // base date of the Tesouro Selic VNA
const OUT = new URL('../src/reference/', import.meta.url);

const pad = (n) => String(n).padStart(2, '0');
const toBr = (iso) => iso.split('-').reverse().join('/');
const fromBr = (br) => br.split('/').reverse().join('-');

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

/** Daily SGS series in 5-year windows (the API limits daily series to 10 years per request). */
async function sgsDaily(code) {
  const rows = [];
  const today = new Date();
  for (let year = Number(START.slice(0, 4)); year <= today.getFullYear(); year += 5) {
    const from = year === 2000 ? START : `${year}-01-01`;
    const to = `${Math.min(year + 4, today.getFullYear())}-12-31`;
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${toBr(from)}&dataFinal=${toBr(to)}`;
    rows.push(...(await getJson(url)));
  }
  return rows.map((r) => [fromBr(r.data), Number(r.valor)]);
}

/**
 * Run-length encoding: keep a row only when the value changes; every business day until the next row has the
 * same value. The app expands it with its own business-day calendar (tests check both calendars agree).
 */
function runLength(rows) {
  return rows.filter((row, i) => i === 0 || row[1] !== rows[i - 1][1]);
}

async function save(name, series, unit, rows, extra = {}, last = rows.at(-1)[0]) {
  const data = { source: series, unit, lastDate: last, ...extra, values: rows };
  await writeFile(new URL(`${name}.json`, OUT), JSON.stringify(data) + '\n');
  console.log(`${name}: ${rows.length} rows, last ${last}`);
}

const selic = await sgsDaily(11);
await save(
  'selic',
  'BCB SGS 11 — Selic diária',
  '% a.d.',
  runLength(selic),
  { firstDate: selic[0][0], days: selic.length },
  selic.at(-1)[0],
);
const cdi = await sgsDaily(4389);
await save(
  'cdi',
  'BCB SGS 4389 — CDI anualizado base 252',
  '% a.a.',
  runLength(cdi),
  { firstDate: cdi[0][0], days: cdi.length },
  cdi.at(-1)[0],
);
const meta = await sgsDaily(432);
await save('selic-meta', 'BCB SGS 432 — Meta Selic (Copom)', '% a.a.', runLength(meta), {}, meta.at(-1)[0]);

const ipcaRows = await getJson(
  `https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/${'199912'}-${new Date().getFullYear()}${pad(12)}`,
);
const ipca = ipcaRows
  .slice(1)
  .filter((r) => r.V !== '...' && r.V !== '-')
  .map((r) => [`${r.D3C.slice(0, 4)}-${r.D3C.slice(4)}`, Number(r.V)]);
await save('ipca', 'IBGE SIDRA 1737/2266 — IPCA número-índice (dez/1993 = 100)', 'index', ipca);

// Focus (BCB Expectativas de Mercado): latest survey, medians of all respondents (baseCalculo 0).
const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata';
async function focus(resource, indicator) {
  const filter = encodeURIComponent(`Indicador eq '${indicator}' and baseCalculo eq 0`);
  const url = `${OLINDA}/${resource}?$format=json&$top=200&$orderby=Data%20desc&$select=Data,DataReferencia,Mediana&$filter=${filter}`;
  const rows = (await getJson(url)).value;
  const latest = rows[0].Data;
  return { latest, rows: rows.filter((r) => r.Data === latest) };
}
const selicYear = await focus('ExpectativasMercadoAnuais', 'Selic');
const ipcaYear = await focus('ExpectativasMercadoAnuais', 'IPCA');
const ipcaMonth = await focus('ExpectativaMercadoMensais', 'IPCA');
const survey = {
  source: 'BCB Olinda — Expectativas de Mercado (Focus), mediana, baseCalculo 0',
  date: [selicYear.latest, ipcaYear.latest, ipcaMonth.latest].sort().at(-1),
  selicYearEnd: selicYear.rows.map((r) => [Number(r.DataReferencia), r.Mediana]).sort((a, b) => a[0] - b[0]),
  ipcaAnnual: ipcaYear.rows.map((r) => [Number(r.DataReferencia), r.Mediana]).sort((a, b) => a[0] - b[0]),
  ipcaMonthly: ipcaMonth.rows
    .map((r) => [`${r.DataReferencia.slice(3)}-${r.DataReferencia.slice(0, 2)}`, r.Mediana])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
};
await writeFile(new URL('focus.json', OUT), JSON.stringify(survey) + '\n');
console.log(
  `focus: survey ${survey.date}, Selic ${survey.selicYearEnd.length} years, IPCA ${survey.ipcaMonthly.length} months`,
);
