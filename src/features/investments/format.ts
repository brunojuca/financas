import type { Rate } from '../../domain/fixedIncome/portfolio';
import { formatPercent } from '../../domain/money';
import { isPricedTesouro, type Titulo } from '../../domain/fixedIncome/types';
import { t } from '../../i18n/pt-BR';

const quantity = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const unitPrice = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export const formatQuantity = (n: number) => quantity.format(n);
export const formatUnitPrice = (n: number) => `R$ ${unitPrice.format(n)}`;

/**
 * "110% do CDI", "CDI + 1,00%", "12,50% a.a.", "IPCA + 6,00%" for bank products; empty for Tesouro Selic,
 * Prefixado and IPCA+, whose rates are per purchase.
 */
export function describeTerms(titulo: Titulo): string {
  if (titulo.product === 'tesouroReserva') return '100% da Selic';
  if (isPricedTesouro(titulo.product)) return '';
  switch (titulo.indexer) {
    case 'cdi':
      return `${quantity.format(titulo.cdiPercent).replace(',00', '')}% do CDI`;
    case 'cdiSpread':
      return `CDI + ${formatPercent(titulo.rate)}`;
    case 'pre':
      return `${formatPercent(titulo.rate)} ${t.investments.perYear}`;
    case 'ipca':
      return `IPCA + ${formatPercent(titulo.rate)}`;
    default:
      return '';
  }
}

/** "12,34% a.a." or, when too short to annualize, the total of the period. */
export function perYearText(rate: Rate | null): string {
  if (!rate) return '—';
  if (rate.perYear === null) return `${formatPercent(rate.total)} ${t.investments.inPeriod}`;
  return `${formatPercent(rate.perYear)} ${t.investments.perYear}`;
}

/** Percent without trailing zeros: 22,50% → 22,5%; 15,00% → 15%. */
export function formatPercentShort(rate: number): string {
  return formatPercent(rate).replace(/0+%$/, '%').replace(/,%$/, '%');
}
