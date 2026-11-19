// Test helper: market data from the bundled reference files.
import cdiJson from '../../reference/cdi.json';
import ipcaJson from '../../reference/ipca.json';
import metaJson from '../../reference/selic-meta.json';
import selicJson from '../../reference/selic.json';
import { flatProjection, type MarketData, type Projection } from './market';
import { expandDaily, monthlyIndex, type RleSeries } from './series';

export function bundledMarket(projection: Projection = flatProjection(0.1375, 0.045)): MarketData {
  return {
    selic: expandDaily(selicJson as unknown as RleSeries),
    cdi: expandDaily(cdiJson as unknown as RleSeries),
    selicTarget: metaJson as unknown as MarketData['selicTarget'],
    ipca: monthlyIndex(ipcaJson as unknown as { lastDate: string; values: [string, number][] }),
    projection,
  };
}
