import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  businessDaysBetween,
  easterSunday,
  isBusinessDay,
  nationalHolidays,
} from './businessDays';
import { addDays, calendarDaysBetween, weekday } from './dates';

describe('holidays', () => {
  it('computes Easter', () => {
    expect(easterSunday(2008)).toBe('2008-03-23');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
  });

  it('lists national holidays, with Consciência Negra from 2024', () => {
    expect(nationalHolidays(2026)).toEqual([
      '2026-01-01',
      '2026-02-16', // Carnaval
      '2026-02-17',
      '2026-04-03', // Sexta-feira Santa
      '2026-04-21',
      '2026-05-01',
      '2026-06-04', // Corpus Christi
      '2026-09-07',
      '2026-10-12',
      '2026-11-02',
      '2026-11-15',
      '2026-11-20',
      '2026-12-25',
    ]);
    expect(nationalHolidays(2023)).not.toContain('2023-11-20');
  });

  it('knows business days', () => {
    expect(isBusinessDay('2026-11-18')).toBe(true);
    expect(isBusinessDay('2026-11-20')).toBe(false); // Consciência Negra (Friday)
    expect(isBusinessDay('2026-11-21')).toBe(false); // Saturday
    expect(addBusinessDays('2026-11-19', 1)).toBe('2026-11-23');
  });
});

describe('businessDaysBetween', () => {
  it('matches the Tesouro Nacional methodology examples', () => {
    expect(businessDaysBetween('2008-05-21', '2010-07-01')).toBe(532); // LTN
    expect(businessDaysBetween('2008-05-21', '2014-03-07')).toBe(1459); // LFT
    expect(businessDaysBetween('2008-05-21', '2008-08-15')).toBe(61); // NTN-B cash flows
    expect(businessDaysBetween('2008-05-21', '2010-08-15')).toBe(564);
  });

  it('matches the spreadsheet', () => {
    expect(businessDaysBetween('2025-03-10', '2028-03-10')).toBe(754);
    expect(businessDaysBetween('2025-06-02', '2029-03-01')).toBe(938);
    expect(businessDaysBetween('2025-08-15', '2035-05-15')).toBe(2440);
  });

  it('agrees with a day-by-day count', () => {
    const from = '2019-12-20';
    for (const to of ['2020-01-02', '2024-11-21', '2031-07-04']) {
      let count = 0;
      for (let d = from; d < to; d = addDays(d, 1)) if (isBusinessDay(d)) count++;
      expect(businessDaysBetween(from, to)).toBe(count);
      expect(businessDaysBetween(to, from)).toBe(-count);
    }
  });

  it('has date helpers consistent with it', () => {
    expect(calendarDaysBetween('2025-03-10', '2028-03-10')).toBe(1096);
    expect(weekday('2026-11-18')).toBe(3); // Wednesday
  });
});
