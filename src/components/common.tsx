import { ActionIcon, Group, Text, Title, Tooltip, type TextProps } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { addMonths, currentMonth, formatMonthLong } from '../domain/dates';
import { formatBRL } from '../domain/money';
import type { Cents, YearMonth } from '../domain/types';
import { t } from '../i18n/pt-BR';
import { semantic } from '../theme';

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);

/** Money with color by sign. */
export function Money({ cents, colored = true, ...props }: { cents: Cents; colored?: boolean } & TextProps) {
  const color = !colored || cents === 0 ? undefined : cents > 0 ? semantic.income : semantic.expense;
  return (
    <Text
      component="span"
      c={color}
      style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      {...props}
    >
      {formatBRL(cents)}
    </Text>
  );
}

export function MonthSwitcher({ value, onChange }: { value: YearMonth; onChange: (m: YearMonth) => void }) {
  const isCurrent = value === currentMonth();
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label={t.common.previousMonth}>
        <ActionIcon
          variant="default"
          size="lg"
          onClick={() => onChange(addMonths(value, -1))}
          aria-label={t.common.previousMonth}
        >
          <IconChevronLeft size={18} />
        </ActionIcon>
      </Tooltip>
      <Text
        fw={600}
        ta="center"
        miw={150}
        style={{ cursor: isCurrent ? undefined : 'pointer' }}
        title={isCurrent ? undefined : t.common.currentMonth}
        onClick={() => onChange(currentMonth())}
      >
        {capitalize(formatMonthLong(value))}
      </Text>
      <Tooltip label={t.common.nextMonth}>
        <ActionIcon
          variant="default"
          size="lg"
          onClick={() => onChange(addMonths(value, 1))}
          aria-label={t.common.nextMonth}
        >
          <IconChevronRight size={18} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Group justify="space-between" mb="md" gap="sm">
      <Title order={2}>{title}</Title>
      {children && (
        <Group gap="sm" wrap="wrap">
          {children}
        </Group>
      )}
    </Group>
  );
}
