# Finanças

Personal finance app that runs entirely in the browser (interface in Brazilian Portuguese).
Track transactions, account balances, a monthly budget per category and recurring/installment entries;
import transactions from CSV.

**Live app:** https://brunojuca.github.io/financas/

## Privacy

There is no backend, no account and no analytics. Your data is stored only in your browser (IndexedDB) and never
leaves your device. Use **Configurações → Exportar backup** regularly to keep a JSON copy, since clearing the
browser's site data erases it.

## Ways to run

- **Website / installable app:** open the link above; the browser can install it as an app (PWA) and it works offline.
- **Single file:** `npm run build:single` produces `dist-single/index.html`, which opens with a double click.
- **Development:** Node 22+, then `npm install` and `npm run dev`.

## Development

```
npm test          # unit tests (Vitest)
npm run lint      # ESLint + Prettier
npm run build     # static site in dist/
```

Calculations are ported from spreadsheets and documented in [docs/spreadsheet-reference.md](docs/spreadsheet-reference.md);
project conventions are in [CLAUDE.md](CLAUDE.md).
