import { describe, expect, it } from 'vitest';
import { formatBRL, formatDecimal, signedAmount, toCents } from './money';

describe('money', () => {
  it('converts reais to integer cents without float drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1234.565)).toBe(123457);
    expect(toCents(19.99)).toBe(1999);
  });

  it('formats BRL', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(-500000)).toBe('-R$ 5.000,00');
    expect(formatDecimal(-9500)).toBe('-95,00');
  });

  it('applies sign from category kind', () => {
    expect(signedAmount('income', 1000)).toBe(1000);
    expect(signedAmount('expense', 1000)).toBe(-1000);
    expect(signedAmount('expense', -1000)).toBe(-1000);
  });
});
