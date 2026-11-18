import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'cyan',
  primaryShade: { light: 8, dark: 6 },
  defaultRadius: 'md',
  fontFamily:
    'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  headings: { fontWeight: '650' },
  components: {
    Paper: { defaultProps: { withBorder: true, p: 'md' } },
  },
});

/** Semantic colors used across screens and charts. */
export const semantic = {
  income: 'teal',
  expense: 'red',
  transfer: 'gray',
} as const;
