/**
 * Rounding helpers for the official formulas, which specify "truncate at n decimals" or "round at n decimals".
 *
 * Floating-point results such as 753.3153229999999 must truncate to 753.315323, not 753.315322: a value within
 * a tiny tolerance of the next decimal step is treated as that step (float noise, not a real difference).
 */
const EPS = 1e-7; // in units of the last kept decimal

/** Float noise allowed around a scaled value: a few ulps of the value, at least EPS. */
function tolerance(scaled: number): number {
  return Math.max(EPS, Math.abs(scaled) * 4e-15);
}

export function trunc(x: number, decimals: number): number {
  const scale = 10 ** decimals;
  const scaled = x * scale;
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) < tolerance(scaled)) return nearest / scale;
  return Math.trunc(scaled) / scale;
}

/** Round half away from zero (the market convention), robust to float noise at the .5 boundary. */
export function round(x: number, decimals: number): number {
  const scale = 10 ** decimals;
  const scaled = Math.abs(x) * scale;
  const tol = tolerance(scaled);
  const floor = Math.floor(scaled + tol);
  const result = scaled - floor >= 0.5 - tol ? floor + 1 : floor;
  return (Math.sign(x) * result) / scale;
}

// ---------- exact decimal products (BigInt fixed point) ----------
// Long products such as the B3 DI factor are specified at 16 decimals, beyond float precision.

/** Parses a non-negative decimal string ("1.00050788") into an integer scaled by 10^scale (truncating). */
export function toFixed(value: string, scale: number): bigint {
  const [int = '0', frac = ''] = value.split('.');
  return BigInt(int + frac.padEnd(scale, '0').slice(0, scale));
}

/**
 * Converts a non-negative number known to have at most `decimals` decimals (e.g. a rate already rounded to 8)
 * into a scaled integer. Going through `toFixed(decimals)` drops float noise such as 1.1000000000000001.
 */
export function numberToFixed(value: number, scale: number, decimals: number): bigint {
  return toFixed(value.toFixed(decimals), scale);
}

/** a × b, both scaled by 10^scale, truncated back to 10^scale. */
export function mulTrunc(a: bigint, b: bigint, scale: number): bigint {
  return (a * b) / 10n ** BigInt(scale);
}

/** Rounds (half up) a scaled integer from `scale` decimals to `decimals`, keeping the original scale. */
export function roundFixed(a: bigint, scale: number, decimals: number): bigint {
  const step = 10n ** BigInt(scale - decimals);
  return ((a + step / 2n) / step) * step;
}

export function fixedToNumber(a: bigint, scale: number): number {
  const s = a.toString().padStart(scale + 1, '0');
  return Number(`${s.slice(0, -scale)}.${s.slice(-scale)}`);
}
