import { budgetId } from './cashflow/budget';
import { generateRecurring } from './cashflow/recurring';
import { indexCategories } from './cashflow/summary';
import { buildTransfer } from './cashflow/transfer';
import { addMonths, dateInMonth, monthRange } from './dates';
import { signedAmount } from './money';
import { createDefaultSeed, findTransferCategory } from './seed';
import type { Account, Budget, Category, RecurringTemplate, Transaction, YearMonth } from './types';

export interface DemoData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringTemplate[];
}

/** Small deterministic PRNG so demo data is the same on every run. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fictional data for trying the app: 6 months ending at `lastMonth`. */
export function createDemoData(lastMonth: YearMonth, newId: () => string): DemoData {
  const { accounts, categories } = createDefaultSeed(newId);
  const index = indexCategories(categories);
  const rand = mulberry32(42);
  const account = (type: Account['type']) => accounts.find((a) => a.type === type)!;
  const cat = (name: string) => categories.find((c) => c.parentId === null && c.name === name)!;
  const sub = (parent: string, name: string) =>
    categories.find((c) => c.parentId === cat(parent).id && c.name === name)!;

  const checking = account('checking');
  const savings = account('savings');
  const card = account('creditCard');
  const transferCategory = findTransferCategory(categories)!;
  const firstMonth = addMonths(lastMonth, -5);
  const months = monthRange(firstMonth, lastMonth);

  const recurringSpec: Array<[string, number, Account, string, string, number, number | null]> = [
    // description, reais, account, category, subcategory, day, installments
    ['Salário', 6500, checking, 'Salário', 'Salário mensal', 5, null],
    ['Aluguel', 1800, checking, 'Moradia', 'Aluguel', 10, null],
    ['Condomínio', 450, checking, 'Moradia', 'Condomínio', 10, null],
    ['Internet', 99.9, card, 'Pagamentos', 'Internet', 15, null],
    ['Plano de celular', 49.9, card, 'Pagamentos', 'Celular', 15, null],
    ['Academia', 119.9, card, 'Saúde', 'Academia', 3, null],
    ['Notebook', 400, card, 'Educação', 'Cursos', 20, 10],
  ];
  const recurring: RecurringTemplate[] = recurringSpec.map(([description, reais, acc, c, s, day, inst]) => ({
    id: newId(),
    description,
    amountCents: Math.round(reais * 100),
    accountId: acc.id,
    categoryId: cat(c).id,
    subcategoryId: sub(c, s).id,
    dayOfMonth: day,
    startMonth: inst ? addMonths(firstMonth, 1) : firstMonth,
    endMonth: null,
    installments: inst,
    active: true,
  }));

  const transactions: Transaction[] = [
    {
      id: newId(),
      date: dateInMonth(firstMonth, 1),
      description: 'Saldo inicial',
      amountCents: 520000,
      accountId: checking.id,
      categoryId: transferCategory.id,
      subcategoryId: null,
      extraordinary: false,
      transferId: null,
      recurringId: null,
      recurringMonth: null,
      installment: null,
    },
  ];

  const variable: Array<[string, string, string, number, number]> = [
    // description, category, subcategory, min reais, max reais
    ['Mercado', 'Alimentação', 'Mercado', 120, 380],
    ['Mercado', 'Alimentação', 'Mercado', 80, 250],
    ['Restaurante', 'Alimentação', 'Refeições', 45, 160],
    ['Delivery', 'Alimentação', 'Delivery', 35, 90],
    ['Padaria', 'Alimentação', 'Padaria', 12, 40],
    ['Gasolina', 'Carro', 'Gasolina', 150, 280],
    ['Farmácia', 'Saúde', 'Farmácia', 20, 120],
    ['Cinema', 'Lazer', 'Cinema', 40, 90],
    ['Transporte por app', 'Transporte', 'Privado', 15, 60],
  ];

  // An outlier: big one-off sale, flagged extraordinary and left uncategorized on purpose.
  transactions.push({
    id: newId(),
    date: dateInMonth(addMonths(lastMonth, -2), 18),
    description: 'Venda do carro antigo',
    amountCents: 18_000_00,
    accountId: checking.id,
    categoryId: null,
    subcategoryId: null,
    extraordinary: true,
    transferId: null,
    recurringId: null,
    recurringMonth: null,
    installment: null,
  });

  for (const month of months) {
    transactions.push(...generateRecurring(recurring, transactions, index, month, newId));
    for (const [description, c, s, min, max] of variable) {
      const cents = Math.round((min + rand() * (max - min)) * 100);
      transactions.push({
        id: newId(),
        date: dateInMonth(month, 1 + Math.floor(rand() * 27)),
        description,
        amountCents: signedAmount('expense', cents),
        accountId: card.id,
        categoryId: cat(c).id,
        subcategoryId: sub(c, s).id,
        extraordinary: false,
        transferId: null,
        recurringId: null,
        recurringMonth: null,
        installment: null,
      });
    }
    transactions.push(
      ...buildTransfer(
        {
          date: dateInMonth(month, 8),
          description: 'Pagamento da fatura',
          amountCents: 1500_00,
          fromAccountId: checking.id,
          toAccountId: card.id,
          transferCategoryId: transferCategory.id,
        },
        newId,
      ),
      ...buildTransfer(
        {
          date: dateInMonth(month, 6),
          description: 'Guardar na reserva',
          amountCents: 800_00,
          fromAccountId: checking.id,
          toAccountId: savings.id,
          transferCategoryId: transferCategory.id,
        },
        newId,
      ),
    );
  }

  const budgetSpec: Array<[string, number]> = [
    ['Salário', 6500],
    ['Alimentação', 1200],
    ['Moradia', 2300],
    ['Carro', 300],
    ['Pagamentos', 200],
    ['Lazer', 150],
    ['Saúde', 250],
    ['Educação', 400],
    ['Transporte', 100],
  ];
  const budgets: Budget[] = months.flatMap((month) =>
    budgetSpec.map(([name, reais]) => ({
      id: budgetId(month, cat(name).id),
      month,
      categoryId: cat(name).id,
      amountCents: reais * 100,
    })),
  );

  return { accounts, categories, transactions, budgets, recurring };
}
