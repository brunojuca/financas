import { isIsoDate, toIsoDate } from '../dates';
import type { Cents, IsoDate } from '../types';

// Parsing of the spreadsheet's transaction layout:
// Data | Descrição | Valor | Conta | Categoria | Subcategoria | (Extraordinário)

/** Lowercase, no accents, trimmed, single spaces. Used to match names. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type Delimiter = '\t' | ';' | ',';

/** Picks the delimiter that appears most in the header line. */
export function detectDelimiter(headerLine: string): Delimiter {
  const candidates: Delimiter[] = ['\t', ';', ','];
  let best: Delimiter = '\t';
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180-style split: quoted fields may contain delimiters, quotes ("") and line breaks. */
export function splitCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** `18/11/2026`, `18/11/26`, `2026-11-18` → ISO date, or null. */
export function parseBrDate(value: string): IsoDate | null {
  const s = value.trim();
  if (isIsoDate(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = toIsoDate(year, Number(m[2]), Number(m[1]));
  return isIsoDate(iso) ? iso : null;
}

/**
 * `R$ 1.234,56`, `-R$ 95,00`, `-95,00`, `1234.56`, `(95,00)`, `R$ -1.234` → signed cents, or null.
 * Brazilian format first: `.` thousands and `,` decimals. A lone `.` followed by 1–2 digits is a decimal point.
 */
export function parseBrAmount(value: string): Cents | null {
  let s = value.replace(/[\s\u00a0]/g, '').replace(/R\$/gi, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.includes('-')) {
    negative = !negative;
    s = s.replace(/-/g, '');
  }
  s = s.replace(/^\+/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative && cents !== 0 ? -cents : cents;
}

const TRUTHY = new Set(['sim', 's', 'x', 'true', '1', 'yes']);

const COLUMNS = {
  date: 'data',
  description: 'descricao',
  amount: 'valor',
  account: 'conta',
  category: 'categoria',
  subcategory: 'subcategoria',
  extraordinary: 'extraordinario',
} as const;
type Column = keyof typeof COLUMNS;
const REQUIRED: Column[] = ['date', 'description', 'amount', 'account'];

export type RowProblem = 'date' | 'description' | 'amount' | 'account';

export interface CsvRow {
  /** 1-based line number in the file (header = 1). */
  line: number;
  date: IsoDate | null;
  description: string;
  amountCents: Cents | null;
  account: string;
  category: string;
  subcategory: string;
  extraordinary: boolean;
  /** Missing/invalid required fields. Rows with problems are not imported. */
  problems: RowProblem[];
  /** Original cell text, for showing rejected rows. */
  raw: string[];
}

export interface ValidCsvRow extends CsvRow {
  date: IsoDate;
  amountCents: Cents;
}

export const isValidRow = (r: CsvRow): r is ValidCsvRow => r.problems.length === 0;

export interface ParsedCsv {
  rows: CsvRow[];
  /** Pt-BR header names of required columns not found. Non-empty = file can't be imported. */
  missingColumns: string[];
  delimiter: Delimiter;
}

const HEADER_LABEL: Record<Column, string> = {
  date: 'Data',
  description: 'Descrição',
  amount: 'Valor',
  account: 'Conta',
  category: 'Categoria',
  subcategory: 'Subcategoria',
  extraordinary: 'Extraordinário',
};

export function parseTransactionsCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\ufeff/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const [header = [], ...body] = splitCsv(clean, delimiter);

  const index = {} as Record<Column, number>;
  const normalizedHeader = header.map(normalizeName);
  for (const [column, name] of Object.entries(COLUMNS) as [Column, string][]) {
    index[column] = normalizedHeader.indexOf(name);
  }
  const missingColumns = REQUIRED.filter((c) => index[c] < 0).map((c) => HEADER_LABEL[c]);
  if (missingColumns.length > 0) return { rows: [], missingColumns, delimiter };

  const cell = (cells: string[], column: Column) =>
    index[column] >= 0 ? (cells[index[column]] ?? '').trim() : '';
  const rows: CsvRow[] = [];
  body.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return; // blank line
    const rawDate = cell(cells, 'date');
    const rawAmount = cell(cells, 'amount');
    const date = parseBrDate(rawDate);
    const amountCents = parseBrAmount(rawAmount);
    const row: CsvRow = {
      line: i + 2,
      date,
      description: cell(cells, 'description'),
      amountCents,
      account: cell(cells, 'account'),
      category: cell(cells, 'category'),
      subcategory: cell(cells, 'subcategory'),
      extraordinary: TRUTHY.has(normalizeName(cell(cells, 'extraordinary'))),
      problems: [],
      raw: cells,
    };
    if (!date) row.problems.push('date');
    if (!row.description) row.problems.push('description');
    if (amountCents === null || amountCents === 0) row.problems.push('amount');
    if (!row.account) row.problems.push('account');
    // A subcategory without category can't be placed.
    if (!row.category) row.subcategory = '';
    rows.push(row);
  });
  return { rows, missingColumns, delimiter };
}
