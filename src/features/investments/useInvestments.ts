import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { todayIso } from '../../domain/dates';
import type { MarketData } from '../../domain/fixedIncome/market';
import { summarizePortfolio, type PortfolioSummary } from '../../domain/fixedIncome/portfolio';
import { mergeLivePrices, type LivePrices, type TesouroPrices } from '../../domain/fixedIncome/tesouroPrices';
import type { Lot, Redemption, Titulo } from '../../domain/fixedIncome/types';
import { buildMarketData, type Assumptions } from '../../reference/market';
import { db } from '../../storage/db';
import { loadDownloaded, loadScenario } from '../../storage/referenceUpdates';

export interface InvestmentsData {
  titulos: Titulo[];
  lots: Lot[];
  redemptions: Redemption[];
  summary: PortfolioSummary;
  market: MarketData;
  assumptions: Assumptions;
  /** Tesouro prices: imported file history plus the latest live prices (null when neither exists). */
  prices: TesouroPrices | null;
  /** Imported file only (for its status line). */
  priceFile: TesouroPrices | null;
  /** Latest live prices from the Tesouro Direto site. */
  livePrices: LivePrices | null;
  /** When public data was last downloaded (null = only the bundled snapshot). */
  fetchedAt: string | null;
  today: string;
}

/** Títulos, lots, redemptions and market data (all live) with the portfolio valued today. */
export function useInvestments(): InvestmentsData | undefined {
  const raw = useLiveQuery(async () => {
    const [titulos, lots, redemptions, downloaded, scenario] = await Promise.all([
      db.titulos.toArray(),
      db.lots.toArray(),
      db.redemptions.toArray(),
      loadDownloaded(),
      loadScenario(),
    ]);
    return {
      titulos: titulos.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      lots,
      redemptions,
      downloaded,
      scenario,
    };
  }, []);
  // Rebuild market data only when downloaded data or the scenario change, not on every portfolio edit.
  const fetchedAt = raw?.downloaded.fetchedAt;
  const scenarioKey = raw ? JSON.stringify(raw.scenario) : null;
  const downloadedData = raw?.downloaded.data;
  const marketData = useMemo(
    () =>
      downloadedData && scenarioKey ? buildMarketData(downloadedData, JSON.parse(scenarioKey)) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchedAt, scenarioKey],
  );
  return useMemo(() => {
    if (!raw || !marketData) return undefined;
    const today = todayIso();
    const priceFile = raw.downloaded.data.tesouroPrices ?? null;
    const livePrices = raw.downloaded.data.tesouroLive ?? null;
    const prices = mergeLivePrices(priceFile, livePrices);
    return {
      prices,
      priceFile,
      livePrices,
      titulos: raw.titulos,
      lots: raw.lots,
      redemptions: raw.redemptions,
      market: marketData.market,
      assumptions: marketData.assumptions,
      fetchedAt: raw.downloaded.fetchedAt,
      today,
      summary: summarizePortfolio(raw.titulos, raw.lots, raw.redemptions, today, marketData.market, prices),
    };
  }, [raw, marketData]);
}
