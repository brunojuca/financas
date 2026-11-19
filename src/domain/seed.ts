import type { Account, AccountType, Category, CategoryKind } from './types';

// Generic starting point for any user. Everything here is editable in the app.
// Keep this list in sync with docs/spreadsheet-reference.md. Never put personal data here.

export const DEFAULT_ACCOUNTS: ReadonlyArray<{ name: string; type: AccountType }> = [
  { name: 'Conta corrente', type: 'checking' },
  { name: 'Reserva', type: 'savings' },
  { name: 'Cartão de crédito', type: 'creditCard' },
  { name: 'Corretora', type: 'brokerage' },
];

export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  kind: CategoryKind;
  subcategories: string[];
}> = [
  { name: 'Salário', kind: 'income', subcategories: ['Salário mensal', '13º salário', 'Férias', 'Bônus'] },
  { name: 'Rendimentos', kind: 'income', subcategories: ['Aluguéis', 'Juros', 'Cashback'] },
  {
    name: 'Outras receitas',
    kind: 'income',
    subcategories: ['Freelance', 'Reembolsos', 'Bolsas e auxílios'],
  },
  {
    name: 'Alimentação',
    kind: 'expense',
    subcategories: ['Mercado', 'Refeições', 'Padaria', 'Delivery', 'Lanche'],
  },
  {
    name: 'Moradia',
    kind: 'expense',
    subcategories: ['Aluguel', 'Condomínio', 'Seguro Residencial', 'IPTU', 'Taxas'],
  },
  {
    name: 'Carro',
    kind: 'expense',
    subcategories: [
      'Gasolina',
      'Pedágio',
      'Lavagem',
      'Seguro Automotivo',
      'Manutenção',
      'Garagem',
      'Estacionamento',
      'IPVA',
      'Licenciamento',
    ],
  },
  {
    name: 'Pagamentos',
    kind: 'expense',
    subcategories: ['Luz', 'Água', 'Gás', 'Internet', 'Celular', 'Streaming'],
  },
  {
    name: 'Lazer',
    kind: 'expense',
    subcategories: ['Cinema', 'Ingressos', 'Esportes', 'Bebidas', 'Encontro'],
  },
  {
    name: 'Saúde',
    kind: 'expense',
    subcategories: ['Médico', 'Psicólogo', 'Fisioterapia', 'Farmácia', 'Academia', 'Barbeiro'],
  },
  { name: 'Educação', kind: 'expense', subcategories: ['Cursos', 'Livros', 'Certificações'] },
  { name: 'Transporte', kind: 'expense', subcategories: ['Público', 'Privado'] },
  { name: 'Roupas', kind: 'expense', subcategories: [] },
  { name: 'Presentes', kind: 'expense', subcategories: [] },
  { name: 'Doações', kind: 'expense', subcategories: [] },
  { name: 'Outras', kind: 'expense', subcategories: [] },
  { name: 'Transferências', kind: 'transfer', subcategories: [] },
];

export interface Seed {
  accounts: Account[];
  categories: Category[];
}

export function createDefaultSeed(newId: () => string): Seed {
  const accounts: Account[] = DEFAULT_ACCOUNTS.map((a, order) => ({
    id: newId(),
    name: a.name,
    type: a.type,
    archived: false,
    order,
    includeInTotal: true,
  }));
  const categories: Category[] = [];
  DEFAULT_CATEGORIES.forEach((c, order) => {
    const id = newId();
    categories.push({ id, name: c.name, kind: c.kind, parentId: null, archived: false, order });
    c.subcategories.forEach((name, subOrder) => {
      categories.push({ id: newId(), name, kind: c.kind, parentId: id, archived: false, order: subOrder });
    });
  });
  return { accounts, categories };
}

/** The category used for transfers and opening balances. */
export function findTransferCategory(categories: Category[]): Category | undefined {
  return (
    categories.find((c) => c.kind === 'transfer' && c.parentId === null && !c.archived) ??
    categories.find((c) => c.kind === 'transfer' && c.parentId === null)
  );
}
