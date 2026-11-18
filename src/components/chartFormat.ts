import { useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { formatBRL } from '../domain/money';

/** Theme color for a Mantine color name, matching the chart palette shade. */
export function useChartColor() {
  const theme = useMantineTheme();
  const scheme = useComputedColorScheme('light');
  return (name: string) => theme.colors[name]![scheme === 'dark' ? 5 : 6];
}

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
/** Axis label for values in reais: `1,2 mil`. */
export const axisMoney = (reais: number) => compact.format(reais);
/** Tooltip value for values in reais. */
export const tooltipMoney = (reais: unknown) => formatBRL(Math.round(Number(reais) * 100));
