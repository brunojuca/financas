// Market data for the app: bundled public series, plus rows downloaded later (cached in IndexedDB), plus the
// projection chosen by the user (Focus scenario or custom values) for dates after the published data.
import { addMonths } from '../domain/dates';
import {
  DEFAULT_SCENARIO,
  focusProjection,
  type FocusSurvey,
  type Scenario,
} from '../domain/fixedIncome/focus';
import { flatProjection, selicTargetOn, type MarketData } from '../domain/fixedIncome/market';
import { expandDaily, monthlyIndex, type RleSeries } from '../domain/fixedIncome/series';
import type { LivePrices, TesouroPrices } from '../domain/fixedIncome/tesouroPrices';
import type { IsoDate, YearMonth } from '../domain/types';
import cdiJson from './cdi.json';
import focusJson from './focus.json';
import ipcaJson from './ipca.json';
import metaJson from './selic-meta.json';
import selicJson from './selic.json';

type Rows<K extends string = IsoDate> = [K, number][];

export const bundled = {
  selic: selicJson as unknown as RleSeries,
  cdi: cdiJson as unknown as RleSeries,
  selicMeta: metaJson as unknown as { lastDate: IsoDate; values: Rows },
  ipca: ipcaJson as unknown as { lastDate: YearMonth; values: Rows<YearMonth> },
  focus: focusJson as unknown as FocusSurvey,
};

/** Rows downloaded after the bundled data (all optional). */
export interface DownloadedData {
  selic?: Rows;
  cdi?: Rows;
  selicMeta?: Rows;
  ipca?: Rows<YearMonth>;
  focus?: FocusSurvey;
  /** Tesouro prices imported from the Tesouro Transparente file. */
  tesouroPrices?: TesouroPrices;
  /** Latest prices from the Tesouro Direto site. */
  tesouroLive?: LivePrices;
}

export interface Assumptions {
  scenario: Scenario;
  /** Last day of published Selic/CDI data. */
  ratesUntil: IsoDate;
  /** Last month of published IPCA. */
  ipcaUntil: YearMonth;
  /** Focus survey in use. */
  focus: FocusSurvey;
  /** Selic target and IPCA used for each future year (decimals), for display. */
  years: { year: number; selic: number; ipca: number }[];
}

/** Appends newer rows to a run-length encoded series, keeping only value changes. */
function mergeRle(series: RleSeries, extra: Rows | undefined): RleSeries {
  const newer = (extra ?? []).filter(([date]) => date > series.lastDate);
  if (newer.length === 0) return series;
  const values = [...series.values];
  for (const row of newer) if (row[1] !== values[values.length - 1]![1]) values.push(row);
  return { ...series, lastDate: newer[newer.length - 1]![0], values };
}

function mergeSteps(base: { lastDate: IsoDate; values: Rows }, extra: Rows | undefined) {
  const newer = (extra ?? []).filter(([date]) => date > base.lastDate);
  if (newer.length === 0) return base;
  return { lastDate: newer[newer.length - 1]![0], values: [...base.values, ...newer] };
}

/** Safe expansion: if downloaded rows disagree with the calendar, fall back to the bundled series. */
function expand(merged: RleSeries, fallback: RleSeries) {
  try {
    return expandDaily(merged);
  } catch (error) {
    console.warn('Downloaded series ignored:', error);
    return expandDaily(fallback);
  }
}

/** Builds market data and the assumptions shown on screen. */
export function buildMarketData(
  downloaded: DownloadedData = {},
  scenario: Scenario = DEFAULT_SCENARIO,
): { market: MarketData; assumptions: Assumptions } {
  const selic = expand(mergeRle(bundled.selic, downloaded.selic), bundled.selic);
  const cdi = expand(mergeRle(bundled.cdi, downloaded.cdi), bundled.cdi);
  const selicTarget = mergeSteps(bundled.selicMeta, downloaded.selicMeta);
  const ipcaRows = [
    ...bundled.ipca.values,
    ...(downloaded.ipca ?? []).filter(([m]) => m > bundled.ipca.lastDate),
  ];
  const ipca = monthlyIndex({ lastDate: ipcaRows[ipcaRows.length - 1]![0], values: ipcaRows });
  const focus =
    downloaded.focus && downloaded.focus.date > bundled.focus.date ? downloaded.focus : bundled.focus;

  const market: MarketData = {
    selic,
    cdi,
    selicTarget,
    ipca,
    projection: flatProjection(0, 0),
    reservaPrice: downloaded.tesouroLive?.reserva ?? null,
  };
  const current = { date: selic.lastDate, selicTarget: selicTargetOn(market, selic.lastDate) };
  market.projection =
    scenario.kind === 'custom'
      ? flatProjection(scenario.selic, scenario.ipca)
      : focusProjection(focus, current, ipca, { selic: scenario.selicShift, ipca: scenario.ipcaShift });

  const firstYear = Number(selic.lastDate.slice(0, 4));
  const years = [];
  for (let year = firstYear; year <= firstYear + 5; year++) {
    let ipcaYear = 1;
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`;
      const cur = ipca.values.get(month);
      const prev = ipca.values.get(addMonths(month, -1));
      ipcaYear *=
        1 + (cur !== undefined && prev !== undefined ? cur / prev - 1 : market.projection.ipcaMonthly(month));
    }
    years.push({ year, selic: market.projection.selicTarget(`${year}-12-01`), ipca: ipcaYear - 1 });
  }
  return {
    market,
    assumptions: { scenario, ratesUntil: selic.lastDate, ipcaUntil: ipca.lastMonth, focus, years },
  };
}
