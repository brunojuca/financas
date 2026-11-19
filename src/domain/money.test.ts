import { describe, expect, it } from 'vitest';
import { centsFromTyped, formatBRL, formatDecimal, signedAmount, toCents } from './money';

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

describe('centsFromTyped', () => {
  it('shifts typed digits in from the cents side', () => {
    expect(centsFromTyped('1')).toBe(1);
    expect(centsFromTyped('R$ 0,012')).toBe(12);
    expect(centsFromTyped('R$ 0,123')).toBe(123);
    expect(centsFromTyped('R$ 1,234')).toBe(1234);
    expect(centsFromTyped('R$ 12.345,678')).toBe(12345678);
  });

  it('removes the last digit on backspace and clears at zero', () => {
    expect(centsFromTyped('R$ 12,3')).toBe(123);
    expect(centsFromTyped('R$ 0,0')).toBeNull();
    expect(centsFromTyped('')).toBeNull();
    expect(centsFromTyped('R$ ')).toBeNull();
  });

  it('reads pasted amounts', () => {
    expect(centsFromTyped('1.234,56')).toBe(123456);
  });

  it('toggles the sign with "-" only when negatives are allowed', () => {
    expect(centsFromTyped('R$ 1,00-', true)).toBe(-100);
    expect(centsFromTyped('-R$ 1,00-', true)).toBe(100);
    expect(centsFromTyped('-R$ 1,005', true)).toBe(-1005);
    expect(centsFromTyped('R$ 1,00-')).toBe(100);
  });
});
