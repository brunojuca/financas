import { TextInput, type TextInputProps } from '@mantine/core';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { centsFromTyped, formatBRL } from '../domain/money';

interface Props extends Omit<TextInputProps, 'value' | 'onChange' | 'defaultValue'> {
  /** Integer cents, or null when empty. */
  value?: number | null;
  onChange?: (cents: number | null) => void;
  allowNegative?: boolean;
}

/** Keeps the caret at the end: digits always enter from the right. */
function caretToEnd(input: HTMLInputElement) {
  // After React re-renders the formatted value.
  requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
}

/**
 * Money field typed "cash register" style: digits fill from the cents, no comma needed
 * (1, 2, 3, 4 → R$ 12,34). With `allowNegative`, typing "-" toggles the sign.
 */
export function MoneyInput({
  value = null,
  onChange = () => {},
  allowNegative = false,
  onKeyDown,
  onFocus,
  ...rest
}: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(centsFromTyped(e.currentTarget.value, allowNegative));
    caretToEnd(e.currentTarget);
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Backspace anywhere removes the last digit, so the cursor position never matters.
    if (e.key === 'Backspace' && value !== null && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const input = e.currentTarget;
      const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
      const next = allSelected ? 0 : Math.trunc(value / 10);
      onChange(next === 0 ? null : next);
    }
    onKeyDown?.(e);
  };
  return (
    <TextInput
      inputMode={allowNegative ? 'text' : 'numeric'}
      autoComplete="off"
      placeholder={formatBRL(0)}
      {...rest}
      value={value === null ? '' : formatBRL(value)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={(e) => {
        caretToEnd(e.currentTarget);
        onFocus?.(e);
      }}
    />
  );
}
