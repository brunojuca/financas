import { beforeEach, describe, expect, it } from 'vitest';
import { findTransferCategory } from '../domain/seed';
import { BackupError, createBackup, parseBackup, restoreBackup, transactionsToCsv } from './backup';
import { db } from './db';
import {
  clearAllData,
  copyBudgetFromPreviousMonth,
  deleteTransaction,
  generateRecurringForMonth,
  initializeWithSeed,
  loadDemoData,
  removeAccount,
  removeCategory,
  saveTransfer,
  setBudget,
} from './repo';

beforeEach(async () => {
  await clearAllData();
});

describe('storage', () => {
  it('seeds generic accounts and categories', async () => {
    await initializeWithSeed();
    expect(await db.accounts.count()).toBe(4);
    expect(findTransferCategory(await db.categories.toArray())).toBeDefined();
  });

  it('archives used accounts and deletes unused ones', async () => {
    await loadDemoData('2026-11');
    const accounts = await db.accounts.toArray();
    const checking = accounts.find((a) => a.type === 'checking')!;
    const brokerage = accounts.find((a) => a.type === 'brokerage')!;
    expect(await removeAccount(checking.id)).toBe('archived');
    expect((await db.accounts.get(checking.id))?.archived).toBe(true);
    expect(await removeAccount(brokerage.id)).toBe('deleted');
    expect(await db.accounts.get(brokerage.id)).toBeUndefined();
  });

  it('archives used categories with their subcategories, deletes unused', async () => {
    await loadDemoData('2026-11');
    const categories = await db.categories.toArray();
    const food = categories.find((c) => c.name === 'Alimentação' && c.parentId === null)!;
    const gifts = categories.find((c) => c.name === 'Presentes')!;
    expect(await removeCategory(food.id)).toBe('archived');
    const subs = await db.categories.where('parentId').equals(food.id).toArray();
    expect(subs.every((s) => s.archived)).toBe(true);
    expect(await removeCategory(gifts.id)).toBe('deleted');
  });

  it('edits and deletes transfers as a pair', async () => {
    await initializeWithSeed();
    const [a, b] = await db.accounts.toArray();
    const transferCategoryId = findTransferCategory(await db.categories.toArray())!.id;
    await saveTransfer({
      date: '2026-11-10',
      description: 'Reserva',
      amountCents: 1000,
      fromAccountId: a!.id,
      toAccountId: b!.id,
      transferCategoryId,
    });
    const legs = await db.transactions.toArray();
    expect(legs).toHaveLength(2);
    await saveTransfer({
      date: '2026-11-10',
      description: 'Reserva',
      amountCents: 2500,
      fromAccountId: a!.id,
      toAccountId: b!.id,
      transferCategoryId,
      transferId: legs[0]!.transferId!,
    });
    const edited = await db.transactions.toArray();
    expect(edited).toHaveLength(2);
    expect(edited.map((t) => t.amountCents).sort((x, y) => x - y)).toEqual([-2500, 2500]);
    await deleteTransaction(edited[0]!);
    expect(await db.transactions.count()).toBe(0);
  });

  it('generates recurring entries once per month', async () => {
    await loadDemoData('2026-11');
    const first = await generateRecurringForMonth('2026-12');
    expect(first).toBeGreaterThan(0);
    expect(await generateRecurringForMonth('2026-12')).toBe(0);
  });

  it('copies budgets from the previous month', async () => {
    await initializeWithSeed();
    const food = (await db.categories.toArray()).find((c) => c.name === 'Alimentação')!;
    await setBudget('2026-10', food.id, -70000);
    expect(await copyBudgetFromPreviousMonth('2026-11')).toBe(1);
    expect((await db.budgets.where('month').equals('2026-11').first())?.amountCents).toBe(70000);
  });
});

describe('backup', () => {
  it('round-trips through JSON', async () => {
    await loadDemoData('2026-11');
    const backup = await createBackup();
    const counts = Object.fromEntries(Object.entries(backup.data).map(([k, v]) => [k, v.length]));
    await clearAllData();
    await restoreBackup(parseBackup(JSON.parse(JSON.stringify(backup))));
    const restored = await createBackup();
    expect(Object.fromEntries(Object.entries(restored.data).map(([k, v]) => [k, v.length]))).toEqual(counts);
  });

  it('rejects files that are not valid backups', () => {
    expect(() => parseBackup({ hello: 1 })).toThrow(BackupError);
    expect(() =>
      parseBackup({
        app: 'financas',
        schemaVersion: 1,
        exportedAt: '',
        data: {
          accounts: [],
          categories: [],
          budgets: [],
          recurring: [],
          transactions: [{ id: 'x', date: '18/11/2026' }],
        },
      }),
    ).toThrow(/transactions\[0\]/);
    expect(() =>
      parseBackup({
        app: 'financas',
        schemaVersion: 99,
        exportedAt: '',
        data: { accounts: [], categories: [], budgets: [], recurring: [], transactions: [] },
      }),
    ).toThrow(/newer/);
  });

  it('exports CSV in the spreadsheet layout', async () => {
    await loadDemoData('2026-11');
    const csv = transactionsToCsv(
      await db.transactions.toArray(),
      await db.accounts.toArray(),
      await db.categories.toArray(),
    );
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Data;Descrição;Valor;Conta;Categoria;Subcategoria');
    expect(lines[1]).toMatch(/^01\/06\/2026;Saldo inicial;5\.200,00;Conta corrente;Transferências;$/);
  });
});
