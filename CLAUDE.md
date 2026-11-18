# Finanças — personal finance app

Browser-based, client-side-only app that replaces two LibreOffice spreadsheets:

1. **Cash flow** (`financas.ods`): transactions, account balances, monthly budget per category, recurring/installment templates.
2. **Fixed-income portfolio** (`carteira-renda-fixa-du.ods`): Tesouro Direto / CDB / LCI-LCA held to maturity, with business-day (DU/252) math, IR, B3 custody, IPCA/CDI/Selic indexing and portfolio IRR.

The exact spreadsheet logic and the reference values used for tests are in
[docs/spreadsheet-reference.md](docs/spreadsheet-reference.md). Read it before touching any calculation.

## Principles

- **Privacy first.** No backend, no accounts, no analytics, no third-party scripts at runtime. User data never leaves the device.
  The only allowed network calls are GETs of _public_ reference data (see "Reference data"); they never carry user data.
- **Works without a dev server.** The production build must be static files that open from disk or any static host.
- **Calculations are the product.** The domain logic must match the spreadsheets to the cent, and every formula ported gets a test.
- **Mobile friendly.** Mobile-first responsive layout; everything usable at 360px width.
- **Generic defaults, personal data stays out.** The app is for any user. Accounts, categories and subcategories start from a generic
  seed (`src/domain/seed.ts`, listed in the reference doc) and are fully user-editable (add, rename, archive, reorder).
  Never put real bank names, employers, people or the user's own values in code, seeds, fixtures, docs or commits.

## Language rules

- Chat with the user, code, identifiers, file names, commits, comments, tests and docs: **English**.
- Everything the end user sees: **Brazilian Portuguese (pt-BR)**. UI strings live in `src/i18n/pt-BR.ts`, never hard-coded in components.
- Domain terms with no good English equivalent keep their Brazilian name in code: `ipca`, `selic`, `cdi`, `tesouro`, `lci`, `lca`, `cdb`.
- Format money/dates/percentages with `Intl` in `pt-BR` (`R$ 1.234,56`, `18/11/2026`, `11,64%`).

## Stack

| Concern           | Choice                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language          | TypeScript (strict)                                                                                                                                                                                                          |
| UI                | React 19 + Vite                                                                                                                                                                                                              |
| Icons             | @tabler/icons-react (Mantine's default icon set)                                                                                                                                                                             |
| Routing           | React Router (hash router, so it works from `file://` and static hosts)                                                                                                                                                      |
| UI components     | Mantine (`@mantine/core`, `hooks`, `form`, `dates`, `notifications`), pt-BR locale (dayjs), light/dark via Mantine color scheme                                                                                              |
| Styling           | Mantine theme first (`src/theme.ts`); CSS Modules for anything custom, using Mantine CSS variables. Mobile-first.                                                                                                            |
| Charts            | Apache ECharts, imported modularly from `echarts/core` (tree-shaken), wrapped in one `components/Chart` component that maps the Mantine theme (colors, fonts, dark mode) to the ECharts theme. Do not use `@mantine/charts`. |
| Persistence       | IndexedDB via Dexie                                                                                                                                                                                                          |
| Tests             | Vitest (domain), React Testing Library (components)                                                                                                                                                                          |
| Build output      | `vite build` → `dist/`; plus a single-file build (`vite-plugin-singlefile`) → one `index.html` you can double-click                                                                                                          |
| Offline / install | PWA (vite-plugin-pwa) so it can be installed on desktop/mobile                                                                                                                                                               |
| Lint/format       | ESLint + Prettier                                                                                                                                                                                                            |

Do not add dependencies beyond these without asking the user first.

## Data and persistence

- **IndexedDB is the working store** (survives reloads, fast, handles thousands of rows). Request `navigator.storage.persist()` on first run.
- **JSON backup file is the source of truth for safety**: Settings has "Exportar backup" / "Importar backup". The backup is one versioned JSON (`{ schemaVersion, exportedAt, data }`). Remind the user to export when the last backup is old.
- CSV export of transactions; ODS/CSV import of the existing spreadsheets is a planned migration feature.
- Schema changes require a Dexie version bump **and** a migration for old backup files.
- Optional later: encrypt the backup with a passphrase (WebCrypto AES-GCM).

### Reference data (rates, IPCA, holidays)

- Bundled snapshot in `src/reference/` so the app works offline; updates fetched on demand and cached in IndexedDB.
- Source: Banco Central SGS API (CORS-enabled, `GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados?formato=json&dataInicial=dd/MM/yyyy`):
  Selic over a.a. `1178`, CDI a.a. `4389`, IPCA monthly `433`.
- Fetch requests contain only series code and date range. No cookies, no identifiers.
- National holidays are computed in code (fixed dates + Easter-based Carnaval, Paixão de Cristo, Corpus Christi; Consciência Negra from 2024), no API.

### Data conventions

- Money: **integer cents** (`amountCents: number`). Never store floats for money. Convert only for display.
- Sign: stored transactions are signed (positive = inflow, negative = outflow, as in the spreadsheet), but the **user always types
  positive amounts**: every category has a `kind` (`income` | `expense` | `transfer`) and the app applies the sign.
  Budgets and recurring templates store positive amounts; the sign comes from the category kind.
- Transfers are two transactions sharing a `transferId` (−X source, +X destination) under the seeded transfer category.
  They never count in income, expense or budget totals.
- Accounts and categories that have transactions are **archived, never deleted**.
- First run asks: start with the default seed, import a backup, or load demo data.
- Credit-card statement closing/due dates are a later feature; the `creditCard` account type leaves room for it.
- Dates: ISO strings `YYYY-MM-DD` for calendar dates. Never use `new Date('YYYY-MM-DD')` for date math (timezone bugs); use the helpers in `src/domain/dates.ts`.
- Rates: decimals (`0.1164` = 11,64%). Keep full precision; round only where the spreadsheet rounds (e.g. daily factor to 8 places, money to 2).
- IDs: `crypto.randomUUID()`.

## Project structure

```
src/
  domain/                 # pure TypeScript, no React, no I/O — all calculations
    money.ts dates.ts businessDays.ts
    cashflow/             # balances per account, budget vs actual, recurring templates
    fixedIncome/          # indexers (pre, cdi, selic, ipca), tax, custody, irr, portfolio
  reference/              # bundled public data: holidays (ANBIMA), selic/cdi history, ipca monthly (JSON)
  storage/                # Dexie db, repositories, backup export/import, migrations
  features/               # one folder per screen: components + hooks for that screen
    dashboard/ transactions/ accounts/ budget/ recurring/ investments/ settings/
  components/             # shared UI (Button, MoneyInput, DataTable, Chart wrappers…)
  i18n/pt-BR.ts
  styles/
docs/
```

Rules:

- `domain/` must not import from `features/`, `storage/` or React. Features call domain functions; domain never calls storage.
- Tests live next to the code: `foo.ts` + `foo.test.ts`.
- Prefer small pure functions over classes.

## Commands

Node 22+.

```
npm run dev          # dev server at http://localhost:5173
npm test             # vitest (domain + storage, IndexedDB faked with fake-indexeddb)
npm run lint         # eslint + prettier --check   (npm run format to fix)
npx tsc -b           # type-check
npm run build        # dist/: static site + PWA (service worker, manifest)
npm run build:single # dist-single/index.html: one self-contained file, open by double-click
```

`.claude/launch.json` has `dev` and `single-file` (serves dist-single/) preview configs.

Known: `npm audit` reports a ReDoS in `picomatch` ≤4.0.7 pulled in by build tooling only (not shipped to the browser);
no patched release exists yet. Re-check when updating dependencies.

## Working rules for Claude

- Before implementing a calculation, find it in `docs/spreadsheet-reference.md`; add a test with the spreadsheet's expected value first.
- Run `npm test` and `npm run lint` before saying a change is done.
- Never commit real personal financial data (the user's `.ods` files, backups, exports). `*.ods`, `*.json` backups and `exports/` stay git-ignored; test fixtures use the example rows only.
- Keep the user informed in plain terms: this is their first project with Claude, so explain non-obvious decisions briefly.
- Commit only when asked.
