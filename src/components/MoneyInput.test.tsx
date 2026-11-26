import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from './MoneyInput';

function Field() {
  const [value, setValue] = useState<number | null>(33_333);
  return (
    <MantineProvider>
      <MoneyInput aria-label="valor" value={value} onChange={setValue} />
    </MantineProvider>
  );
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

describe('MoneyInput', () => {
  it('clears on select-all + Backspace, even right after focusing, and types cents-first', async () => {
    const user = userEvent.setup();
    render(<Field />);
    const input = screen.getByLabelText('valor') as HTMLInputElement;
    expect(input.value).toBe('R$ 333,33');
    await user.click(input);
    await user.keyboard('{Control>}a{/Control}');
    await nextFrame(); // the caret-to-end of the focus handler must not undo the selection
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    await user.keyboard('{Backspace}');
    expect(input.value).toBe('');
    await user.keyboard('36667');
    expect(input.value).toBe('R$ 366,67');
    await user.keyboard('{Backspace}');
    expect(input.value).toBe('R$ 36,66');
  });
});
