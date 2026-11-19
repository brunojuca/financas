import type { Cents } from '../types';
import type { PortfolioSummary, TituloSummary } from './portfolio';
import type { Product } from './types';

/** What a título's return follows. */
export type IndexerGroup = 'selic' | 'cdi' | 'pre' | 'ipca';

export function indexerGroup(row: TituloSummary): IndexerGroup {
  const { product, indexer } = row.titulo;
  if (product === 'tesouroSelic' || product === 'tesouroReserva') return 'selic';
  if (product === 'tesouroPrefixado') return 'pre';
  if (product === 'tesouroIpca') return 'ipca';
  if (indexer === 'pre') return 'pre';
  if (indexer === 'ipca') return 'ipca';
  return 'cdi';
}

export interface Slice<K extends string> {
  key: K;
  /** Net value today (market price when available, else curve). */
  value: Cents;
  share: number;
}

function group<K extends string>(rows: TituloSummary[], keyOf: (r: TituloSummary) => K): Slice<K>[] {
  const totals = new Map<K, number>();
  for (const r of rows) totals.set(keyOf(r), (totals.get(keyOf(r)) ?? 0) + (r.market ?? r.today).net);
  const sum = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value, share: sum > 0 ? value / sum : 0 }))
    .sort((a, b) => b.value - a.value);
}

/** How the títulos still held split by product and by indexer, by net value today. */
export function distribution(summary: PortfolioSummary): {
  byProduct: Slice<Product>[];
  byIndexer: Slice<IndexerGroup>[];
} {
  const held = summary.rows.filter((r) => !r.matured && r.today.invested > 0);
  return { byProduct: group(held, (r) => r.titulo.product), byIndexer: group(held, indexerGroup) };
}
