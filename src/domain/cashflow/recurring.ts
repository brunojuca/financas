import { addMonths, dateInMonth, monthOf, monthRange, monthsBetween } from '../dates';
import { signedAmount } from '../money';
import type { IsoDate, RecurringTemplate, Transaction, YearMonth } from '../types';
import type { CategoryIndex } from './summary';

/*
 * Recurring entries: a template is the rule; its occurrences are not stored ahead of time.
 * - Occurrences dated up to today are stored automatically (`dueRecurring`), so balances match the bank.
 * - Later ones are computed on the fly (`projectRecurring`) and shown as "previsto"; editing one stores it.
 * - A stored occurrence keeps `recurringId` + `recurringMonth`, so its month is never computed again.
 * - Deleting one month adds it to `skippedMonths`; ending the template sets `endMonth`.
 */

/** Last month the template produces an entry, or null if it never ends. */
export function lastMonthOf(template: RecurringTemplate): YearMonth | null {
  if (template.installments === null) return template.endMonth;
  const last = addMonths(template.startMonth, template.installments - 1);
  return template.endMonth !== null && template.endMonth < last ? template.endMonth : last;
}

export function isDueIn(template: RecurringTemplate, month: YearMonth): boolean {
  if (!template.active || month < template.startMonth) return false;
  if (template.skippedMonths.includes(month)) return false;
  const last = lastMonthOf(template);
  return last === null || month <= last;
}

/**
 * Transactions a month should get from the templates, skipping templates that already
 * have an entry for that month (so running it twice is safe).
 */
export function generateRecurring(
  templates: RecurringTemplate[],
  existing: Transaction[],
  categories: CategoryIndex,
  month: YearMonth,
  newId: () => string,
): Transaction[] {
  const done = new Set(
    existing.filter((t) => t.recurringId !== null && t.recurringMonth === month).map((t) => t.recurringId),
  );
  const result: Transaction[] = [];
  for (const template of templates) {
    if (!isDueIn(template, month) || done.has(template.id)) continue;
    const category = categories.get(template.categoryId);
    if (!category || category.kind === 'transfer') continue;
    const installment =
      template.installments !== null
        ? { number: monthsBetween(template.startMonth, month) + 1, total: template.installments }
        : null;
    result.push({
      id: newId(),
      date: dateInMonth(month, template.dayOfMonth),
      description: installment
        ? `${template.description} (${installment.number}/${installment.total})`
        : template.description,
      amountCents: signedAmount(category.kind, template.amountCents),
      accountId: template.accountId,
      categoryId: template.categoryId,
      subcategoryId: template.subcategoryId,
      extraordinary: false,
      transferId: null,
      recurringId: template.id,
      recurringMonth: month,
      installment,
      billMonth: null,
      installmentGroupId: null,
    });
  }
  return result;
}

function occurrences(
  templates: RecurringTemplate[],
  existing: Transaction[],
  categories: CategoryIndex,
  from: YearMonth,
  to: YearMonth,
  newId: () => string,
): Transaction[] {
  const linked = existing.filter((t) => t.recurringId !== null);
  const result: Transaction[] = [];
  if (from > to) return result;
  for (const month of monthRange(from, to)) {
    const inMonth = linked.filter((t) => t.recurringMonth === month);
    result.push(...generateRecurring(templates, inMonth, categories, month, newId));
  }
  return result;
}

/** Occurrences dated up to `today` that are not stored yet: the app stores them automatically. */
export function dueRecurring(
  templates: RecurringTemplate[],
  existing: Transaction[],
  categories: CategoryIndex,
  today: IsoDate,
  newId: () => string,
): Transaction[] {
  const active = templates.filter((t) => t.active);
  if (active.length === 0) return [];
  const from = active.reduce((m, t) => (t.startMonth < m ? t.startMonth : m), active[0]!.startMonth);
  return occurrences(active, existing, categories, from, monthOf(today), newId).filter(
    (t) => t.date <= today,
  );
}

const PROJECTED = 'rec:';

/** Id of a computed occurrence (stable, never stored). */
export const projectedId = (templateId: string, month: YearMonth) => `${PROJECTED}${templateId}:${month}`;

/** A computed occurrence ("previsto"), not a stored entry. */
export const isProjected = (tx: Transaction) => tx.id.startsWith(PROJECTED);

/** Occurrences after `today` up to the end of `until`, computed (not stored). */
export function projectRecurring(
  templates: RecurringTemplate[],
  existing: Transaction[],
  categories: CategoryIndex,
  today: IsoDate,
  until: YearMonth,
): Transaction[] {
  const active = templates.filter((t) => t.active);
  return occurrences(active, existing, categories, monthOf(today), until, () => '')
    .filter((t) => t.date > today)
    .map((t) => ({ ...t, id: projectedId(t.recurringId!, t.recurringMonth!) }));
}

/**
 * Months before `before` that a template would produce but that have no entry: they become skipped.
 * Used once when automatic generation was introduced, so months the user never generated (or deleted)
 * are not created now.
 */
export function ungeneratedMonths(
  template: RecurringTemplate,
  existing: Transaction[],
  before: YearMonth,
): YearMonth[] {
  if (template.startMonth >= before) return [];
  const done = new Set(existing.filter((t) => t.recurringId === template.id).map((t) => t.recurringMonth));
  return monthRange(template.startMonth, addMonths(before, -1)).filter(
    (m) => isDueIn({ ...template, active: true }, m) && !done.has(m),
  );
}
