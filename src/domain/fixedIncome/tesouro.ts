import { round, trunc } from './precision';

/**
 * Tesouro Direto pricing, following Tesouro Nacional, "Metodologia de Cálculo dos Títulos Públicos Federais
 * Ofertados nos Leilões Primários" (29/04/2024), Table 3 precision rules:
 * rate truncated at 6 decimals (in %), day exponent du/252 truncated at 14, quote truncated at 4 (in %),
 * VNA and price truncated at 6.
 *
 * Rates here are decimals (0.1436 = 14,36% a.a.); `du` = business days from settlement (inclusive)
 * to maturity (exclusive).
 */

/** Rate as quoted (% truncated at 6 decimals), back to a decimal. */
function quotedRate(rate: number): number {
  return trunc(rate * 100, 6) / 100;
}

function dayExponent(du: number): number {
  return trunc(du / 252, 14);
}

/** Discount factor (1 + rate)^(du/252), with the official exponent truncation. */
function growth(rate: number, du: number): number {
  return (1 + quotedRate(rate)) ** dayExponent(du);
}

/** Tesouro Prefixado (LTN): unit price for face value R$ 1.000. */
export function prefixadoPrice(rate: number, du: number): number {
  return trunc(1000 / growth(rate, du), 6);
}

/** Quote (%) of a título with a single final payment (Tesouro Selic / LFT, Tesouro IPCA+ / NTN-B Principal). */
export function singlePaymentQuote(rate: number, du: number): number {
  return trunc(100 / growth(rate, du), 4);
}

/** Price = quote (%) × projected VNA, truncated at 6 decimals. */
export function priceFromQuote(quotePercent: number, vna: number): number {
  return trunc((quotePercent / 100) * vna, 6);
}

/** Rate implied by a price (inverse of `prefixadoPrice` / `singlePaymentQuote`), truncated at 6 decimals in %. */
export function impliedRate(presentValue: number, finalValue: number, du: number): number {
  return trunc(((finalValue / presentValue) ** (252 / du) - 1) * 100, 6) / 100;
}

// ---------- VNA ----------

/** Tesouro Selic VNA = R$ 1.000 × accumulated Selic factor since 01/07/2000 (factor rounded at 16). */
export function selicVna(accumulatedFactor: number): number {
  return trunc(1000 * round(accumulatedFactor, 16), 6);
}

/**
 * Projects the Tesouro Selic VNA one business day ahead using the Selic target (decimal a.a.):
 * VNA × (1 + meta)^(1/252), exponent truncated at 14.
 */
export function projectSelicVna(vna: number, selicTarget: number): number {
  return trunc(vna * (1 + selicTarget) ** trunc(1 / 252, 14), 6);
}

/**
 * Tesouro IPCA+ VNA on a 15th = R$ 1.000 × IPCA index ratio since 15/07/2000 (ratio rounded at 16).
 * `indexRatio` = IPCA number index of the month before the 15th ÷ index of June 2000.
 */
export function ipcaVnaOn15th(indexRatio: number): number {
  return trunc(1000 * round(indexRatio, 16), 6);
}

/**
 * Projects the IPCA VNA from the last 15th to the settlement date, pro rata by **calendar** days between
 * the 15ths: VNA × (1 + projected IPCA)^(days since 15th ÷ days in the period), IPCA rounded at 2 decimals (in %),
 * exponent truncated at 14.
 */
export function projectIpcaVna(
  vnaOn15th: number,
  monthlyIpca: number,
  daysSince15th: number,
  daysInPeriod: number,
): number {
  const ipca = round(monthlyIpca * 100, 2) / 100;
  return trunc(vnaOn15th * (1 + ipca) ** trunc(daysSince15th / daysInPeriod, 14), 6);
}
