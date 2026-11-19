import { describe, expect, it } from 'vitest';
import { indexCategories } from '../cashflow/summary';
import { findIssues } from '../cashflow/validation';
import { createDefaultSeed } from '../seed';
import { isValidRow, parseBrAmount, parseBrDate, parseTransactionsCsv, splitCsv } from './csv';
import { buildImportPlan, summarizeSource, suggestMappings, type ImportOptions } from './plan';

let n = 0;
const newId = () => `id${++n}`;

describe('csv parsing', () => {
  it('parses Brazilian amounts', () => {
    expect(parseBrAmount('R$ 1.234,56')).toBe(123456);
    expect(parseBrAmount('-R$ 95,00')).toBe(-9500);
    expect(parseBrAmount('R$ -95,00')).toBe(-9500);
    expect(parseBrAmount('-95')).toBe(-9500);
    expect(parseBrAmount('1234.5')).toBe(123450);
    expect(parseBrAmount('1.234')).toBe(123400);
    expect(parseBrAmount('(45,10)')).toBe(-4510);
    expect(parseBrAmount('abc')).toBeNull();
    expect(parseBrAmount('')).toBeNull();
  });

  it('parses dates', () => {
    expect(parseBrDate('18/11/2026')).toBe('2026-11-18');
    expect(parseBrDate('8/1/26')).toBe('2026-01-08');
    expect(parseBrDate('2026-11-18')).toBe('2026-11-18');
    expect(parseBrDate('31/02/2026')).toBeNull();
    expect(parseBrDate('')).toBeNull();
  });

  it('splits quoted fields', () => {
    expect(splitCsv('a;"b;c";"d ""e"""\r\n1;2;3', ';')).toEqual([
      ['a', 'b;c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('requires the mandatory columns', () => {
    expect(parseTransactionsCsv('Data;Valor\n01/01/2026;10').missingColumns).toEqual(['Descrição', 'Conta']);
  });

  it('flags rows missing required fields and maps columns by header name', () => {
    const csv = [
      'Conta\tData\tValor\tDescrição\tCategoria\tSubcategoria',
      'Banco A\t01/10/2026\t-R$ 10,00\tPão\tAlimentação\tPadaria',
      '\t02/10/2026\t-R$ 10,00\tSem conta\t\t',
      'Banco A\t\tx\t\t\t',
      '',
    ].join('\n');
    const parsed = parseTransactionsCsv(csv);
    expect(parsed.delimiter).toBe('\t');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      date: '2026-10-01',
      amountCents: -1000,
      account: 'Banco A',
      problems: [],
    });
    expect(parsed.rows[1]!.problems).toEqual(['account']);
    expect(parsed.rows[2]!.problems).toEqual(['date', 'description', 'amount']);
  });
});

describe('import plan', () => {
  const seed = createDefaultSeed(newId);
  const checking = seed.accounts[0]!; // "Conta corrente"
  const csv = [
    'Data\tDescrição\tValor\tConta\tCategoria\tSubcategoria',
    '05/10/2026\tSalário\tR$ 5.000,00\tconta CORRENTE\tSalario\tSalário mensal',
    '08/10/2026\tFatura\t-R$ 1.500,00\tconta corrente\tTransferências\t',
    '08/10/2026\tFatura\tR$ 1.500,00\tCrédito Banco X\tTransferências\t',
    '09/10/2026\tGuardar\t-R$ 300,00\tconta corrente\tTransferências\t',
    '10/10/2026\tMercado\t-R$ 250,00\tCrédito Banco X\tAlimentação\t',
    '12/10/2026\tVenda da moto\tR$ 9.000,00\tconta corrente\t\t',
    '15/10/2026\tAula\t-R$ 80,00\tconta corrente\tHobbies\tViolão',
  ].join('\n');
  const rows = parseTransactionsCsv(csv).rows.filter(isValidRow);
  const source = summarizeSource(rows);
  const mappings = suggestMappings(source, seed.accounts, seed.categories);
  const options: ImportOptions = { uncategorized: 'keep', skipDuplicates: true };

  it('suggests links by accent/case-insensitive name and creates the rest', () => {
    expect(mappings.accounts['conta corrente']).toEqual({ action: 'existing', accountId: checking.id });
    expect(mappings.accounts['credito banco x']).toEqual({
      action: 'new',
      name: 'Crédito Banco X',
      type: 'creditCard',
    });
    const salary = seed.categories.find((c) => c.name === 'Salário')!;
    expect(mappings.categories['salario']).toEqual({ action: 'existing', categoryId: salary.id });
    expect(mappings.categories['transferencias']).toMatchObject({ action: 'existing' });
    expect(mappings.categories['hobbies']).toEqual({ action: 'new', name: 'Hobbies', kind: 'expense' });
    expect(mappings.subcategories['salario/salario mensal']).toMatchObject({ action: 'existing' });
    expect(mappings.subcategories['hobbies/violao']).toEqual({ action: 'new', name: 'Violão' });
  });

  const existing = { ...seed, transactions: [] };
  const plan = buildImportPlan(rows, mappings, options, existing, newId);

  it('pairs transfers and keeps unpaired legs as single entries', () => {
    const legs = plan.transactions.filter((t) => t.description === 'Fatura');
    expect(legs[0]!.transferId).not.toBeNull();
    expect(legs[0]!.transferId).toBe(legs[1]!.transferId);
    expect(plan.stats.transfersPaired).toBe(1);
    expect(plan.unpairedTransferLines).toEqual([5]);
    expect(plan.transactions.find((t) => t.description === 'Guardar')!.transferId).toBeNull();
  });

  it('creates new accounts, categories and subcategories under the right parent', () => {
    expect(plan.accounts.map((a) => a.name)).toEqual(['Crédito Banco X']);
    const hobbies = plan.categories.find((c) => c.name === 'Hobbies')!;
    const violao = plan.categories.find((c) => c.name === 'Violão')!;
    expect(violao).toMatchObject({ parentId: hobbies.id, kind: 'expense' });
    expect(plan.transactions.find((t) => t.description === 'Aula')).toMatchObject({
      categoryId: hobbies.id,
      subcategoryId: violao.id,
    });
  });

  it('keeps uncategorized rows as issues, or flags them extraordinary on request', () => {
    const sale = plan.transactions.find((t) => t.description === 'Venda da moto')!;
    expect(sale).toMatchObject({ categoryId: null, extraordinary: false });
    expect(plan.stats.uncategorized).toBe(1);

    const flagged = buildImportPlan(
      rows,
      mappings,
      { ...options, uncategorized: 'extraordinary' },
      existing,
      newId,
    );
    expect(flagged.transactions.find((t) => t.description === 'Venda da moto')!.extraordinary).toBe(true);

    const index = indexCategories([...seed.categories, ...plan.categories]);
    const issues = findIssues(plan.transactions, index);
    expect(issues[0]).toMatchObject({ code: 'uncategorized', level: 'error' });
    // Mercado: Alimentação has subcategories but none given → warning. Transfers never flagged.
    expect(issues.map((i) => i.transaction.description).sort()).toEqual(['Mercado', 'Venda da moto']);
    const flaggedIssues = findIssues(
      flagged.transactions,
      indexCategories([...seed.categories, ...flagged.categories]),
    );
    expect(flaggedIssues.find((i) => i.transaction.description === 'Venda da moto')?.level).toBe('warning');
  });

  it('skips rows that already exist when importing the same file again', () => {
    const again = buildImportPlan(
      rows,
      suggestMappings(source, [...seed.accounts, ...plan.accounts], [...seed.categories, ...plan.categories]),
      options,
      {
        accounts: [...seed.accounts, ...plan.accounts],
        categories: [...seed.categories, ...plan.categories],
        transactions: plan.transactions,
      },
      newId,
    );
    expect(again.stats.duplicatesSkipped).toBe(rows.length);
    expect(again.transactions).toEqual([]);
    expect(again.accounts).toEqual([]);
  });

  it('can drop subcategories and merge two CSV categories into one new category', () => {
    const custom = buildImportPlan(
      rows,
      {
        ...mappings,
        categories: {
          ...mappings.categories,
          hobbies: { action: 'new', name: 'Lazer extra', kind: 'expense' },
          alimentacao: { action: 'new', name: 'lazer EXTRA', kind: 'expense' },
        },
        subcategories: { ...mappings.subcategories, 'hobbies/violao': { action: 'drop' } },
      },
      options,
      existing,
      newId,
    );
    expect(custom.categories.filter((c) => c.parentId === null)).toHaveLength(1);
    expect(custom.transactions.find((t) => t.description === 'Aula')!.subcategoryId).toBeNull();
  });
});
