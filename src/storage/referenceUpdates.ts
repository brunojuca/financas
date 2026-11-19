import { addDays, addMonths, currentMonth } from '../domain/dates';
import { DEFAULT_SCENARIO, type Scenario } from '../domain/fixedIncome/focus';
import { bundled, type DownloadedData } from '../reference/market';
import { parseTesouroPrices, type TesouroPrices } from '../domain/fixedIncome/tesouroPrices';
import { fetchFocus, fetchIpcaIndex, fetchSgs, fetchTesouroLive } from '../reference/sources';
import { db, getMeta, META, setMeta, type ReferenceEntry } from './db';

type SeriesKey = 'selic' | 'cdi' | 'selicMeta';
const SGS: Record<SeriesKey, number> = { selic: 11, cdi: 4389, selicMeta: 432 };

/** Everything downloaded so far, shaped for `buildMarketData`. */
export async function loadDownloaded(): Promise<{ data: DownloadedData; fetchedAt: string | null }> {
  const entries = await db.reference.toArray();
  const data: DownloadedData = {};
  let fetchedAt: string | null = null;
  for (const e of entries) {
    (data as Record<string, unknown>)[e.key] = e.value;
    if (!fetchedAt || e.fetchedAt > fetchedAt) fetchedAt = e.fetchedAt;
  }
  return { data, fetchedAt };
}

async function put(key: ReferenceEntry['key'], value: unknown) {
  await db.reference.put({ key, value, fetchedAt: new Date().toISOString() });
}

/**
 * Downloads public data newer than what the app has: Selic, CDI and Selic target (BCB SGS), IPCA index (IBGE)
 * and the latest Focus survey. Each source is independent; returns the ones that failed (e.g. offline).
 */
export async function updateReferenceData(): Promise<{ failed: string[] }> {
  const { data } = await loadDownloaded();
  const failed: string[] = [];

  for (const key of Object.keys(SGS) as SeriesKey[]) {
    try {
      const have = (data[key] ?? []) as [string, number][];
      const base = key === 'selicMeta' ? bundled.selicMeta.lastDate : bundled[key].lastDate;
      const last = have.length ? have[have.length - 1]![0] : base;
      const rows = (await fetchSgs(SGS[key], addDays(last > base ? last : base, 1))).filter(
        ([d]) => d > base,
      );
      const merged = [...have.filter(([d]) => d > base), ...rows];
      const unique = merged.filter((row, i) => i === 0 || row[0] > merged[i - 1]![0]);
      await put(key, unique);
    } catch {
      failed.push(key);
    }
  }

  try {
    const have = data.ipca ?? [];
    const base = bundled.ipca.lastDate;
    const last = have.length ? have[have.length - 1]![0] : base;
    const rows = await fetchIpcaIndex(addMonths(last > base ? last : base, 1), currentMonth());
    await put('ipca', [...have, ...rows.filter(([m]) => m > last)]);
  } catch {
    failed.push('ipca');
  }

  try {
    await put('focus', await fetchFocus());
  } catch {
    failed.push('focus');
  }
  if (!(await updateTesouroLive())) failed.push('tesouroLive');
  return { failed };
}

export async function loadScenario(): Promise<Scenario> {
  const raw = await getMeta(META.scenario);
  try {
    return raw ? (JSON.parse(raw) as Scenario) : DEFAULT_SCENARIO;
  } catch {
    return DEFAULT_SCENARIO;
  }
}

export async function saveScenario(scenario: Scenario): Promise<void> {
  await setMeta(META.scenario, JSON.stringify(scenario));
}

/** Prices are kept from this date on (enough for any current position, small enough for IndexedDB). */
const PRICES_SINCE = '2015-01-01';

/**
 * Imports the Tesouro price file (PrecoTaxaTesouroDireto.csv) picked by the user. Throws when the file is not
 * the price file. Returns the parsed prices.
 */
export async function importTesouroPrices(file: File): Promise<TesouroPrices> {
  const prices = parseTesouroPrices(await file.text(), PRICES_SINCE);
  await put('tesouroPrices', prices);
  return prices;
}

/** Downloads the current Tesouro Direto prices. Returns false when it fails (offline, site changed). */
export async function updateTesouroLive(): Promise<boolean> {
  try {
    await put('tesouroLive', await fetchTesouroLive());
    return true;
  } catch {
    return false;
  }
}
