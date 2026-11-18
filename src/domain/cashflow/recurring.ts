import { addMonths, dateInMonth, monthsBetween } from '../dates';
import { signedAmount } from '../money';
import type { RecurringTemplate, Transaction, YearMonth } from '../types';
import type { CategoryIndex } from './summary';

/** Last month the template produces an entry, or null if it never ends. */
export function lastMonthOf(template: RecurringTemplate): YearMonth | null {
  if (template.installments !== null) return addMonths(template.startMonth, template.installments - 1);
  return template.endMonth;
}

export function isDueIn(template: RecurringTemplate, month: YearMonth): boolean {
  if (!template.active || month < template.startMonth) return false;
  const last = lastMonthOf(template);
  return last === null || month <= last;
}

/**
 * Transactions a month should get from the templates, skipping templates that already
 * generated an entry for that month (so running it twice is safe). Replaces the manual copy
 * from the spreadsheet's `Fixas_e_Parceladas` sheet.
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
      transferId: null,
      recurringId: template.id,
      recurringMonth: month,
      installment,
    });
  }
  return result;
}
