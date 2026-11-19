import { describe, expect, it } from 'vitest';
import focusJson from '../../reference/focus.json';
import { addMonths } from '../dates';
import { focusProjection, type FocusSurvey } from './focus';
import { monthlyIndex } from './series';

const survey: FocusSurvey = {
  date: '2026-11-13',
  selicYearEnd: [
    [2026, 13.75],
    [2027, 12.75],
    [2028, 11],
  ],
  ipcaAnnual: [
    [2026, 5],
    [2027, 4.5],
  ],
  ipcaMonthly: [
    ['2026-11', 0.35],
    ['2026-12', 0.6],
    ['2027-01', 0.5],
  ],
};
// Published index: 2026-01 … 2026-10, each month +0,4%.
const values: [string, number][] = [['2025-12', 1000]];
for (let i = 1; i <= 10; i++) values.push([`2026-${String(i).padStart(2, '0')}`, 1000 * 1.004 ** i]);
const ipca = monthlyIndex({ lastDate: '2026-10', values });
const projection = focusProjection(survey, { date: '2026-11-17', selicTarget: 0.1375 }, ipca);

describe('focusProjection', () => {
  it('moves the Selic target linearly to each year-end expectation, constant within a month', () => {
    expect(projection.selicTarget('2026-12-10')).toBeCloseTo(0.1375, 10);
    expect(projection.selicTarget('2027-12-10')).toBeCloseTo(0.1275, 10); // December = year-end expectation
    expect(projection.selicTarget('2027-12-15')).toBeCloseTo(projection.selicTarget('2027-12-01'), 12);
    const mid = projection.selicTarget('2027-07-01'); // about halfway through 2027
    expect(mid).toBeLessThan(0.1375);
    expect(mid).toBeGreaterThan(0.1275);
    expect(projection.selicTarget('2030-06-01')).toBeCloseTo(0.11, 10); // flat after the last year
  });

  it('uses monthly IPCA expectations first', () => {
    expect(projection.ipcaMonthly('2026-11')).toBeCloseTo(0.0035, 12);
    expect(projection.ipcaMonthly('2027-01')).toBeCloseTo(0.005, 12);
  });

  it('fills the rest of a year so that it adds up to the annual expectation', () => {
    let year = 1.005; // January 2027 (monthly Focus)
    for (let m = '2027-02'; m <= '2027-12'; m = addMonths(m, 1)) year *= 1 + projection.ipcaMonthly(m);
    expect(year - 1).toBeCloseTo(0.045, 10);
    expect(projection.ipcaMonthly('2028-05')).toBeCloseTo(1.045 ** (1 / 12) - 1, 12); // after the last year
  });

  it('applies scenario shifts in p.p. a.a.', () => {
    const up = focusProjection(survey, { date: '2026-11-17', selicTarget: 0.1375 }, ipca, {
      selic: 0.01,
      ipca: 0.01,
    });
    expect(up.selicTarget('2030-06-01')).toBeCloseTo(0.12, 10);
    expect((1 + up.ipcaMonthly('2028-05')) ** 12 - 1).toBeCloseTo(0.055, 10);
  });

  it('reads the bundled Focus snapshot', () => {
    const bundled = focusJson as unknown as FocusSurvey;
    expect(bundled.selicYearEnd.length).toBeGreaterThan(2);
    expect(bundled.ipcaMonthly.length).toBeGreaterThan(6);
  });
});
