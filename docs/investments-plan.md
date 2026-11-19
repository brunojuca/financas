# Investments module — plan

Status: planning (not started). Replaces `carteira-renda-fixa-du.ods`.

## Principles

- **Accuracy over spreadsheet parity.** The spreadsheet ([spreadsheet-reference.md](spreadsheet-reference.md)) lists the
  requirements, but its formulas are not the source of truth. Each calculation follows the official methodology
  (Tesouro Direto / B3 / Receita Federal) and is tested against official published data. Where the result differs
  from the spreadsheet, the difference is documented and explained.
- **Separate from cash flow.** Buying a título stays a transfer to a brokerage account, at the amount paid.
  The investments module keeps its own títulos and computes performance; it never creates transactions.
- **Public data only, read-only.** Rates, indexes, expectations and prices come from public government sources (GET only,
  no user data). A bundled snapshot keeps everything working offline; manual entry or file import is the fallback.

## Products

| Product           | Indexer / return                              | Tax    | B3 custody                     |
| ----------------- | --------------------------------------------- | ------ | ------------------------------ |
| Tesouro Selic     | Selic (VNA) × price quote (ágio/deságio)      | IR+IOF | 0.20% a.a.; Selic exemption \* |
| Tesouro Prefixado | fixed rate, R$ 1.000 at maturity              | IR+IOF | 0.20% a.a.                     |
| Tesouro IPCA+     | IPCA (VNA) + real rate; no coupons for now    | IR+IOF | 0.20% a.a.                     |
| Tesouro Reserva   | 100% Selic, daily liquidity                   | IR+IOF | 0.20% a.a.; exemption \*       |
| CDB               | % of CDI, CDI + spread, fixed, or IPCA + rate | IR+IOF | none                           |
| LCI / LCA         | same options as CDB                           | exempt | none                           |

\* B3 (Ofício Circular 014/2024-VPC): Tesouro Selic is exempt up to a **stock of R$ 10.000 per investor (CPF)**,
summed over all holdings; custody is charged only on the excess. The spreadsheet applies it per row — a known difference.
Tesouro Reserva (launched 11/05/2026): 100% Selic, no mark-to-market, IOF in the first 30 days, custody exempt up to
R$ 10.000 per news coverage. Whether its exemption is shared with Tesouro Selic, and its exact pricing formula, are still
unconfirmed: the official tesourodireto.com.br pages block automated download, so this needs a manual read.

Later: Tesouro IPCA+ with semi-annual coupons, Renda+/Educa+, debentures/CRI/CRA.

## Data model (sketch)

- **Título**: product, name, issuer (bank, for CDB/LCI/LCA), indexer, contract rate (or % of CDI), maturity date,
  optional link to a brokerage account, notes.
- **Purchase (lot)**: date, quantity and unit price (Tesouro) or amount (bank products). Each lot keeps its own
  purchase rate and date — IR and IOF are per lot.
- **Redemption**: date, quantity or amount, value received. Partial redemptions consume lots **first-in, first-out**
  (Tesouro Direto rule; to verify for banks). A redemption at maturity is generated automatically.
- Money in integer cents; Tesouro unit prices and quantities keep the precision the Tesouro publishes.

## Calculations (to verify against official sources before coding)

Official references (downloaded and readable): Tesouro Nacional, _Metodologia de Cálculo dos Títulos Públicos
Federais_ (29/04/2024) — price, quote and rate formulas for LTN, LFT and NTN-B with exact truncation rules and worked
examples; Tesouro Nacional, _Caderno de Fórmulas Selic_; B3 formula books for CDB/LC/LF/RDB and for LCI; B3 Ofício
Circular 014/2024-VPC (custody). The worked examples in these documents become test cases.

- **Business days**: national holidays computed in code (ANBIMA calendar); DU/252.
- **Tesouro Selic / Reserva**: VNA updated by the daily Selic factor; price = VNA × quote, quote = 1/(1+rate)^(DU/252).
- **Tesouro Prefixado**: price = 1000/(1+rate)^(DU/252), truncated at the 6th decimal (rate truncated at 6 decimals
  in percent).
- **Tesouro IPCA+ (principal)**: VNA updated by IPCA, pro rata by business days between the 15ths, using the
  projected IPCA for months not yet published; quote truncated at the 4th decimal (in %), price = quote × projected
  VNA truncated at the 6th decimal.
- **CDB / LCI / LCA**: B3 conventions for DI accumulation — daily DI rate rounded to 8 decimals, each daily factor
  (with the % of CDI) kept at 16 decimals, the running product truncated at 16 decimals, the final factor rounded to 8.
  The spreadsheet's log-sum is an approximation of this. Same structure for CDI + spread, fixed and IPCA + rate.
- **IR**: regressive by calendar days held, per lot (22.5% / 20% / 17.5% / 15%); custody paid is deducted from the base (D6).
- **IOF**: regressive table for redemptions within 30 days (matters for Tesouro Reserva).
- **Custody**: 0.20% a.a., **accrued daily (pro rata die) from settlement (D+1)** and, since 31/12/2024, **charged only
  at sale, maturity or coupon payment** — no more January/July billing. Exemption as in the products table. Still to
  confirm: whether the daily base is the position's market value or curve value.
- **Portfolio return**: IRR base 252 over all purchases, redemptions and (projected) maturities; also real return
  (deflated by IPCA).

Each item gets a test with an official expected value (Tesouro historical prices, B3 formula book examples,
Tesouro Direto simulator). The spreadsheet's reference values stay as comparison tests where the method agrees.

## Three views

Toggle on the portfolio, per título and aggregated:

1. **Mercado** (what the broker shows): Tesouro = quantity × today's sell price published by the Tesouro.
   Bank products have no public market price; they show the curve value, labelled as such.
2. **Na curva hoje**: contract rate + indexes published so far, minus custody to date and the IR/IOF due if redeemed today.
3. **No vencimento** (projection, holding everything to maturity): published indexes up to today, then **Focus**
   expectations (Selic by Copom meeting, IPCA by month/year; CDI ≈ Selic − 0,10). Net value at maturity,
   nominal and real annual rates, portfolio IRR.

Extras:

- **Scenarios**: Focus (default), Selic/IPCA ± 1 p.p., or custom values — shows how much each título depends on future rates.
- **Vender hoje × manter**: for Tesouro, net amount from selling today vs. projected net amount at maturity.
- **Charts**: projected portfolio value year by year; maturity ladder (money returned per year); value curve per título.

## Public data sources

| Data                                    | Source                                       | Browser access (CORS) |
| --------------------------------------- | -------------------------------------------- | --------------------- |
| Selic, CDI, IPCA history                | BCB SGS (`1178`/`11`, `4389`/`12`, `433`)    | confirmed             |
| Focus expectations                      | BCB Olinda "Expectativas de Mercado" (OData) | confirmed             |
| Tesouro prices and rates (daily, 2002→) | Tesouro Transparente open data (CSV)         | **blocked**           |
| Holidays                                | computed in code                             | —                     |
| CDB / LCI / LCA rates                   | none public — typed by the user              | —                     |

Third-party APIs (e.g. brapi) are avoided: they add a dependency on a company beyond the government sources.

Spike results (18/11/2026, tested from the app's page in a browser):

- **BCB SGS** and **BCB Olinda (Focus)** answer cross-origin requests. Focus resources that work:
  `ExpectativasMercadoAnuais` (IPCA by year), `ExpectativaMercadoMensais` (IPCA by month),
  `ExpectativasMercadoSelic` (Selic by Copom meeting). Latest survey available: 13/11/2026.
- **Tesouro Transparente CSV** (`PrecoTaxaTesouroDireto.csv`): reachable, but its CORS header only allows
  `https://www.tesouro.fazenda.gov.br/`, so the browser blocks it. 14.7 MB, ~178 thousand rows, columns:
  título type, maturity, base date, buy/sell rate, buy/sell/base price. Updated daily (latest row 17/11/2026).
  **Tesouro Reserva is not in it.** The CKAN query API has the same restriction.
- The old Tesouro Direto JSON (`treasurybondsinfo.json`) is gone (HTTP 410).

Options for Tesouro market prices, in order of preference:

1. **Scheduled GitHub Action** (once the repo is public with Pages): every weekday it downloads the CSV, keeps only the
   latest prices (a few KB of JSON) and publishes them with the site. The app fetches that file from its own site — still
   public data, no user data. The single-file build fetches it from the Pages URL.
2. **Import the CSV file**: the user downloads it from Tesouro Transparente and picks it in the app, which keeps the
   latest date (and history for charts). Always works, offline included.
3. **Type the price** of the títulos you hold (fallback).

Tesouro Reserva needs no price feed: it has no mark-to-market, so its value comes from the Selic series.

## Screens

New menu item **Investimentos**:

- **Carteira**: títulos and totals, view toggle (Mercado / Na curva / No vencimento), filters by product, maturity and broker.
- **Título**: lots and redemptions, value curve, IR/IOF/custody breakdown, sell-vs-hold.
- **Projeção**: yearly charts and scenario picker.
- **Premissas e dados**: each series with its last update date, "Atualizar" button, Focus values in use, custody settings.

Also: dashboard card with the portfolio net value today; títulos, lots and redemptions included in the JSON backup.

## Link to brokerage accounts (optional)

Each título may point to a cash-flow account of type "Corretora". The app then compares, per account, the money
transferred to it in the cash flow with the amount invested in its títulos, flagging purchases recorded in only one place.
It never changes balances or creates transactions.

## Phases

1. **Calculation engine**: business days, indexers, IR, IOF, custody, IRR; bundled reference data; tests against
   official values; report of differences from the spreadsheet.
2. **Títulos, lots and redemptions** with the na-curva views (today and at maturity) and portfolio totals.
3. **Online data and projection**: SGS and Focus updates, projection charts, scenarios.
4. **Tesouro market value**: daily prices (imported CSV), Mercado view, sell-vs-hold, and custody on the daily
   market value (D4). Note: the Tesouro site values "resgate antecipado" with the live intraday sell price, so the
   app (last published daily price) can differ by a few reais on volatile days.
5. **Extras**: brokerage-account link, FGC alert (above R$ 250k per issuer), coupons for IPCA+.

Phase 4 starts with options 2 and 3 for prices; option 1 is added when the repository becomes public.

## Phase 1 progress

Done (pure functions in `src/domain/`, 25 tests):

- `businessDays.ts`: holiday calendar and O(log n) business-day counts. Matches the official examples (532, 1459,
  61, 564 DU), the spreadsheet (754, 938, 2440) and **every one of the 6.625 business days in the BCB Selic series
  since 03/07/2000**.
- `fixedIncome/precision.ts`: official truncate/round rules, robust to float noise; exact BigInt products.
- `fixedIncome/tax.ts`: IR table, IOF table, taxes on redemption with custody deducted (D6).
- `fixedIncome/di.ts`: B3 DI accumulation (8/16/16/8 decimals), % of CDI, spread factor.
- `fixedIncome/tesouro.ts`: Prefixado price, single-payment quote, price from quote, implied rate, Selic VNA and
  projection, IPCA VNA on the 15th and pro-rata projection. All worked examples of the Tesouro Nacional methodology
  reproduced exactly.
- `fixedIncome/series.ts` + `ipca.ts`: bundled series expanded with our calendar; exact accumulated Selic factor
  (VNA of 20/05/2008 = 3.449,694215 from real data); IPCA VNA from the IBGE number index.
- `fixedIncome/irr.ts`: IRR base 252.
- **Published prices**: Tesouro Prefixado matches the Tesouro Transparente prices to the cent (settlement D+1;
  published prices are truncated at 2 decimals). Tesouro Selic falls within the band allowed by the published rate,
  which is rounded at 2 decimals.
- `src/reference/*.json` (≈80 KB, not yet loaded by the app): Selic daily (SGS 11), CDI (SGS 4389), Selic target
  (SGS 432) and IPCA number index (IBGE SIDRA 1737), refreshed with `npm run update-reference`.

- `fixedIncome/market.ts`: published series joined with a projection (Selic target and monthly IPCA) for any
  future date; Selic over and CDI projected as target − 0,10 p.p. (D8). Phase 3 plugs Focus in here.
- `fixedIncome/types.ts`, `valuation.ts`: títulos, lots (by quantity + unit price, or amount + rate) and the
  value of any lot on any date for every product — gross, custody accrued, IOF, IR, net.
- `fixedIncome/redemption.ts`: partial redemptions by quantity (Tesouro, always FIFO) or gross amount (bank
  products and Tesouro Reserva, FIFO or LIFO per título).
- **Tesouro IPCA+ vs published prices**: the 2050 título matches the published price exactly; 2029 and 2035 fall
  within the band of the published rate (rounded at 2 decimals).

Phase 1 is complete. Next is phase 2 (storage and screens for títulos, lots and redemptions).

## Phase 2 progress

Done:

- **Storage**: Dexie v3 with `titulos`, `lots` (indexed by título) and `redemptions`; backup schema v3 (older
  backups restore with no investments); demo data includes a fictional portfolio (Tesouro Selic, Prefixado,
  IPCA+, Reserva, a CDB with a partial redemption and an LCI).
- **Market data in the app** (`src/reference/market.ts`): bundled series + flat projection (current Selic target,
  IPCA of the last 12 months), shown on the screen. Loaded only when Investimentos is opened (separate chunk).
- **Portfolio summary** (`fixedIncome/portfolio.ts`): per título and in total — invested, net if redeemed today,
  net at maturity, annual net return (IRR base 252, including past redemptions); custody exemption shared across
  Tesouro Selic lots (and separately Tesouro Reserva) by value (D5); matured títulos leave the current totals.
- **Screens** (`features/investments/`): portfolio list with totals and assumptions; título page with "if redeemed
  today" and "at maturity" breakdowns (gross, custody, IOF, IR, net), purchases and redemptions; forms for título
  (with first purchase), purchase (quantity + unit price, or amount + rate) and redemption (validated against the
  position on that date).

Tesouro purchases may carry both the unit price and the contracted rate from the statement; the rate given wins
(the rate implied from the price can differ in the last decimal because the Tesouro priced with a projected IPCA).

Fixed along the way: typed dates in every date field were parsed month-first (dayjs needed its custom-format
plugin); "01/03/2031" now means 1 March in Lançamentos too.

Next: phase 3 (online updates of SGS/IBGE data, Focus expectations, projection charts and scenarios).

## Phase 3 progress

Done:

- **Focus projection** (`fixedIncome/focus.ts`): Selic target follows a straight line from today's target to each
  year-end Focus expectation (constant within a month at the month-end value, so December equals the year-end
  expectation), flat after the last year; IPCA uses monthly expectations (≈ 2 years), then fills each remaining
  year so it adds up to the annual expectation, then the last annual value. A Focus snapshot ships with the app.
- **Scenarios**: Focus, Focus ±1 p.p. (Selic and IPCA), or custom flat values; saved in settings and applied to
  every valuation, the portfolio return and the projection.
- **Online updates** ("Atualizar dados" on the Projeção tab): Selic, CDI and Selic target (BCB SGS), IPCA index
  (IBGE SIDRA) and the latest Focus survey; only rows newer than what the app has, cached in IndexedDB (table
  `reference`, never in backups). Requests carry only series codes, dates and Focus filters (checked in the
  browser).
- **Projection** (`fixedIncome/projection.ts`, Projeção tab): portfolio net value at each year-end until the last
  maturity, nominal and in today's money (deflated by projected IPCA), money returned per maturity year, and
  the real return. Matured money is not reinvested.

## Phase 4 progress

Done:

- **Price file import** (`fixedIncome/tesouroPrices.ts`, "Preços de mercado do Tesouro" card on Carteira): the user
  downloads `PrecoTaxaTesouroDireto.csv` with a normal link (the browser blocks `fetch` by CORS) and picks it; the
  app keeps Tesouro Selic, Prefixado and IPCA+ prices since 2015 in the `reference` table (≈ 24 thousand rows since
  2020), on this device only.
- **Mercado view**: toggle "Na curva / Mercado" on the portfolio. Tesouro títulos valued at quantity × the published
  sell price, **as of the price date** (days held, custody and IR bracket too) — like "resgate antecipado" on the
  Tesouro site, whose statement is dated the last price date. Bank products and Tesouro Reserva stay on the curve.
- **Título page**: "Se vender hoje (mercado)", "Na curva hoje" and "No vencimento", plus the net annual return of
  holding to maturity instead of selling at today's price.
- **Custody on daily market value (D4)**: each day from the first price on or after the purchase through the last
  published price uses quantity × that day's sell price; before the first price and after the last one (projections)
  the curve value. Test fixture with public rows reproduces the independent calculation to the cent.

- **Live prices** ("Atualizar preços", also part of "Atualizar dados"): the Tesouro Direto website's own redemption
  price list (`https://www.tesourodireto.com.br/o/rentabilidade/resgatar`, CORS open to any origin, including the
  single-file build). Gives exactly the statement's unit prices (e.g. 745,33 and 3.105,18 on 18/11/2026 18:00),
  while the open-data file only has the morning price. Merged as each título's newest price; the file still
  provides the daily history for custody. The market view now counts days and custody up to the day before the
  valuation date (the statement viewed on 18/11 shows 85 days for a 24/08 purchase) with the latest price.

Not done: typing a price by hand (not needed while the live endpoint works) and the scheduled GitHub Action
(option 1). Tesouro Reserva purchases can be entered by units and unit price; the live list's Reserva price then
values them officially (D2).

## Returns shown (definitions)

`fixedIncome/portfolio.ts` (`Returns`), per título and for the portfolio, gross (before IR, IOF, custody) and net:

| Return                         | Period                              | How                                                                                                                                                         |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desde a compra (curve, market) | past: each purchase → today         | total = (value today + redemptions received) ÷ invested − 1; a.a. = IRR base 252 of purchases, redemptions and today's value. Not annualized under 30 days. |
| Até o vencimento               | projected: each purchase → maturity | IRR base 252 with the value at maturity (published indexes, then the chosen scenario).                                                                      |
| Mantendo a partir de hoje      | projected: today → maturity         | IRR of selling today (net, at market when priced) vs. receiving the net at maturity.                                                                        |

Monthly earnings (`fixedIncome/monthly.ts`, "Rendimento mês a mês"): gross on the curve per month — for each lot
held at the month's end, value at the end minus value at the start (or at purchase); % = earnings ÷ that start
value. Last 12 months realized, current + next 11 projected (scenario). Taxes are left out (they depend on when
the money is redeemed).

Also on screen: gross and net today on the curve and at market side by side, the IR rate that applies today (range
when lots differ), gross income, and the distribution by product and by indexer (Selic, CDI, Prefixado, IPCA) by
today's net value (market when priced).

### Spreadsheet reference values recomputed (base 17/11/2026)

Same inputs as the spreadsheet; maturity values use a flat projection (Selic target 13,75%, IPCA 4,5% a.a.).

| Value                          | Spreadsheet | App       | Why they differ                                            |
| ------------------------------ | ----------- | --------- | ---------------------------------------------------------- |
| CDB 110% CDI — gross now       | 12.852,65   | 12.852,64 | B3 truncates the financial value                           |
| CDB — gross at maturity        | 15.445,23   | 15.445,22 | same                                                       |
| CDB — net at maturity          | 14.628,45   | 14.628,44 | same                                                       |
| Tesouro Selic — gross now      | 18.301,55   | 18.301,53 | VNA × quote with official truncation                       |
| Tesouro Selic — gross maturity | 24.472,12   | 24.472,12 | —                                                          |
| Tesouro Selic — custody        | 70,10       | ≈ 70 (±5) | daily accrual on monthly steps vs average-balance estimate |
| Tesouro IPCA+ — gross now      | 9.131,15    | 9.131,71  | calendar-day pro rata and IBGE index (official method)     |
| Tesouro IPCA+ — gross maturity | 23.113,33   | 23.113,31 | index ratio vs chained monthly %                           |

The app's numbers are the ones validated against official examples and published prices; the spreadsheet's
are within a few cents except where the official IPCA method differs.

### Differences from the spreadsheet found so far

| Topic               | Spreadsheet                                    | App (official method)                                                      |
| ------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| CDI accumulation    | sum of logs, `exp` at the end                  | B3: daily factors truncated at 16 decimals, final rounded at 8             |
| Tesouro prices      | amount × growth (no unit price)                | unit price with official truncation; quantity × price                      |
| Tesouro Selic       | Selic + purchase rate as a growth rate         | VNA (Selic since 2000) × quote at the purchase rate                        |
| IPCA pro rata       | business days between the 15ths                | **calendar days** between the 15ths (Tesouro methodology)                  |
| IPCA source         | monthly % (2 decimals) chained                 | IBGE number index ratio (what the Tesouro uses)                            |
| Months without IPCA | flat 4,5% a.a.                                 | Focus monthly/annual expectations (D8)                                     |
| Custody             | average balance estimate, Selic exempt per row | daily accrual, charged at sale/maturity; R$ 10k per CPF (D4, D5)           |
| IOF                 | ignored                                        | regressive table in the first 29 days                                      |
| IR base             | gross − custody − invested                     | gross − IOF − invested (custody not deducted, as on the Tesouro statement) |

## Decisions to revisit

Decisions taken without full certainty. Each one is isolated in code (a setting, a single function or a constant)
so it can change without touching the rest. Revisit when better information appears.

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                           | Why / what is uncertain                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Tesouro market prices come from the official CSV, downloaded by the user with a normal link and imported in the app (done in phase 4); a scheduled GitHub Action publishing the latest prices with the site can come once the repo is public.                                                                                                                                                      | The official CSV blocks browser `fetch` (CORS) and the old Tesouro Direto JSON is gone (spike of 18/11/2026). Re-test if the Tesouro opens its CORS or publishes a new API.                                                                                                                                                                                                                |
| D2  | Tesouro Reserva bought **by units** is valued at units × the official unit price published by the Tesouro Direto (live list), carried to other dates by the daily Selic (Reserva pays 100% Selic, no mark-to-market); without the official price, the price paid is the anchor. Purchases entered **by amount only** are valued like a Tesouro Selic at zero ágio/deságio (amount × Selic factor). | The Reserva pricing formula was not read in an official document; the live price (buy = sell, priced daily just after midnight) is the reference. The Selic-carry between price dates assumes no fee or spread inside the price.                                                                                                                                                           |
| D3  | Tesouro Reserva's R$ 10.000 custody exemption is **separate** from Tesouro Selic's.                                                                                                                                                                                                                                                                                                                | News coverage says "exempt up to R$ 10 mil" but does not say whether it is shared with Tesouro Selic.                                                                                                                                                                                                                                                                                      |
| D4  | Custody accrues per **calendar day** at (1 + 0,20%)^(1/365) − 1 (exponential pro rata) on the position's **market value** (quantity × the latest Tesouro sell price on or before that day), from the purchase day through the day before the valuation date. Before the first price, and for projections, the curve value is used.                                                                 | Fitted on three real Tesouro statements (IPCA+ and Prefixado, 85 and 86 days): two reproduced to the cent, the third within 1 cent. Linear 0,20%/365 was 1–2 cents high on all three; per-month, business-day, lagged-price and truncated-daily variants fitted worse. The remaining cent likely comes from the daily prices B3 uses internally (the public file has only morning prices). |
| D5  | Tesouro Selic exemption: one R$ 10.000 per investor across all Tesouro Selic lots, applied **day by day** on the lots held that day (market value when priced, else curve), going to the **newest purchases first**; custody that day = 0,20% a.a. on each lot's value above its share. Partial redemptions use the same rule.                                                                     | B3 (Ofício Circular 095/2020) defines the exemption on the total held per CPF, summed across accounts, charging only the excess; which purchases carry it is not published. Newest-first is a hypothesis being checked against a statement with several Tesouro Selic purchases (the "B3" column per purchase shows it).                                                                   |
| D6  | IR applies to income − IOF; **B3 custody is not deducted** from the IR base.                                                                                                                                                                                                                                                                                                                       | Changed on 19/11/2026: two real Tesouro Direto statements compute IR as 22,5% × (gross − invested), custody not deducted. Order of IOF before IR still follows common practice (no IOF case seen yet).                                                                                                                                                                                     |
| D7  | Partial redemptions consume lots oldest-first (FIFO) by default; bank products can be set to newest-first per título.                                                                                                                                                                                                                                                                              | Tesouro uses FIFO; some banks redeem the newest purchases first.                                                                                                                                                                                                                                                                                                                           |
| D8  | Projections: CDI and Selic over = Selic target − 0,10 p.p.; the Selic target moves linearly from today to each Focus year-end expectation (Focus gives Copom meetings without dates), then stays flat; IPCA from Focus monthly, then annual (residual months), then the last annual value.                                                                                                         | Focus covers only ~4 years ahead; long títulos rely on flat extrapolation. Scenarios (±1 p.p., custom) show the sensitivity. Meeting-by-meeting Selic would need a Copom calendar.                                                                                                                                                                                                         |
| D9  | Business days use national holidays computed in code (fixed dates, Carnaval Monday/Tuesday, Sexta-feira Santa, Corpus Christi; Consciência Negra from 2024).                                                                                                                                                                                                                                       | Assumed equal to the ANBIMA calendar used by B3/Tesouro. Verify against ANBIMA's published list for the years covered.                                                                                                                                                                                                                                                                     |
| D10 | Tesouro IPCA+ with semi-annual coupons, Renda+ and Educa+ are not supported yet.                                                                                                                                                                                                                                                                                                                   | Out of scope for now (user's choice).                                                                                                                                                                                                                                                                                                                                                      |
| D11 | Bank products (CDB, LCI, LCA) use the B3 formula-book conventions for daily DI factors; their "market value" equals the curve value.                                                                                                                                                                                                                                                               | No public secondary-market prices for bank products. Banks may round differently from B3's books.                                                                                                                                                                                                                                                                                          |
| D12 | IPCA-linked bank products (CDB/LCI/LCA IPCA + rate) use the Tesouro IPCA VNA ratio (calendar pro rata between the 15ths) times the fixed-rate factor.                                                                                                                                                                                                                                              | Banks and B3 books may pro-rate IPCA by business days or use other anniversaries; check a real CDB IPCA statement.                                                                                                                                                                                                                                                                         |
| D13 | Current Tesouro prices come from the Tesouro Direto website's redemption price list (`/o/rentabilidade/resgatar`), fetched only when the user clicks update.                                                                                                                                                                                                                                       | Undocumented endpoint used by the site itself: it may change or start blocking without notice (the documented JSON was shut down before). The imported price file stays as fallback and history source.                                                                                                                                                                                    |
| D14 | IR is **truncated** at the cent (not rounded). IOF is still rounded.                                                                                                                                                                                                                                                                                                                               | Tesouro Direto statements show IR values that only match truncation (a tax of x,xx6 shown as x,xx); all other statement values are consistent with it. No IOF case seen yet to confirm its rounding.                                                                                                                                                                                       |
