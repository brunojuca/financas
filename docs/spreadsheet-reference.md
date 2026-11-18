# Spreadsheet reference

What the two original spreadsheets do, so the app can reproduce them exactly.
Values in "Reference values" were computed by LibreOffice with data-base date **17/11/2026** and are the targets for unit tests.

---

## 1. Cash flow (`financas.ods`)

### Sheets

| Sheet                | Purpose                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Transações`         | Ledger. Columns: Data, Descrição, Valor, Conta, Categoria, Subcategoria. Negative = expense.                                                                         |
| `Contas`             | Balance per account = `SUMIFS(Valor, Conta = account)` over all time.                                                                                                |
| `Orçamento`          | For a reference month: budget per category, actual (`SUMIFS` by category within the month), difference = actual − budget, and totals.                                |
| `Fixas_e_Parceladas` | Templates for recurring entries (rent, utilities, internet, phone, salary…). Same columns as `Transações`; date is a placeholder. Copied into the ledger each month. |
| `Categorias`         | Two-level list: category → subcategories (used for validation dropdowns).                                                                                            |

### Accounts

The spreadsheet has one row per real account. In the app, accounts are user-created and have a **type**.
Default seed (generic, editable):

- Conta corrente (checking)
- Reserva (savings / money set aside)
- Cartão de crédito (credit card; balance is negative = debt)
- Corretora (brokerage / investments)

### Categories → subcategories

These are the **default seed**. Users can add, rename, archive and reorder categories and subcategories.

- Salário: Salário mensal, 13º salário, Férias, Bônus
- Rendimentos: Aluguéis, Juros, Cashback
- Outras receitas: Freelance, Reembolsos, Bolsas e auxílios
- Alimentação: Mercado, Refeições, Padaria, Delivery, Lanche
- Moradia: Aluguel, Condomínio, Seguro Residencial, IPTU, Taxas
- Carro: Gasolina, Pedágio, Lavagem, Seguro Automotivo, Manutenção, Garagem, Estacionamento, IPVA, Licenciamento
- Pagamentos: Luz, Água, Gás, Internet, Celular, Streaming
- Lazer: Cinema, Ingressos, Esportes, Bebidas, Encontro
- Saúde: Médico, Psicólogo, Fisioterapia, Farmácia, Academia, Barbeiro
- Educação: Cursos, Livros, Certificações
- Transporte: Público, Privado
- Roupas, Presentes, Doações, Outras (no subcategories)
- Transferências (moves between own accounts; excluded from the budget)

### Budget rules

- Budget amounts use the same sign as transactions (income positive, expense negative).
- Actual for category C in month M = sum of `Valor` where `Categoria = C` and `Data` in [first day of M, last day of M].
- Difference = actual − budget (positive = better than planned).
- Total row sums every category (Transferências is not listed, so it never counts).

### Things the app should improve on

- Recurring templates should generate transactions for a month instead of manual copy, with support for installments (`n/N`).
- Transfers should be a single operation that creates both legs (−X in source, +X in destination).
- Credit card: purchases go to the credit-card account; paying the bill is a transfer from a checking account.

---

## 2. Fixed-income portfolio (`carteira-renda-fixa-du.ods`)

Values are "na curva" (contract rate + indexes), held to maturity — **not** market value.

### Inputs

**Investment** (one row each):

| Field        | Values                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| name         | free text                                                                                                                            |
| type         | `CDB` (taxed; also LC, LF, plain debentures), `TESOURO` (taxed + B3 custody), `ISENTO` (LCI, LCA, CRI, CRA, incentivized debentures) |
| indexer      | `PRE`, `CDI`, `SELIC`, `IPCA`                                                                                                        |
| cdiPercent   | only CDI; empty = 100%                                                                                                               |
| rate         | PRE: fixed rate a.a.; CDI: spread over CDI (optional); SELIC: Tesouro Selic rate at purchase (may be negative); IPCA: real rate      |
| purchaseDate | settlement date (money left)                                                                                                         |
| maturityDate |                                                                                                                                      |
| amount       | exact amount paid                                                                                                                    |

**Settings (Premissas)**: base date (default today), B3 custody rate 0.20% a.a., Tesouro Selic custody exemption R$ 10.000 (per row), projected IPCA 4.50% a.a. for months without data, business-day origin 01/01/2020.

**Reference tables**: national holidays (ANBIMA) 2020→; Selic over and CDI a.a. as periods `[start, next start)` with the last row valid forever (it is the projection); IPCA monthly from 01/2020 (empty month → `(1+projected)^(1/12) − 1`).

### Business days

`DU(date)` = business days from 01/01/2020 up to `date − 1` (NETWORKDAYS with holidays) — i.e. the purchase day counts, the maturity day does not.
DU between purchase and maturity = `DU(maturity) − DU(purchase)`.

### Accumulated growth (natural log, then `exp`)

For a window `[DUa, DUb)`:

- **CDI**: for each rate period `[Ds, De)`, `overlap = max(0, min(DUb,De) − max(DUa,Ds))`;
  `ln = Σ overlap · ln(1 + cdiPercent · TDI)`, with `TDI = round((1+CDI)^(1/252) − 1, 8)`.
- **SELIC**: same overlap sum with `ln(1 + round((1+Selic)^(1/252) − 1, 8))`.
- **PRE**: 0 from index.
- **IPCA**: `L(date) − L(purchase)` where
  `ref = month of date if day ≥ 15 else previous month`;
  `L(date) = Σ ln(1+ipca_m) for months m < ref + frac · ln(1+ipca_ref)`;
  `frac = NETWORKDAYS(15/ref, date−1) / NETWORKDAYS(15/ref, 15/(ref+1) − 1)`, 0 if date is exactly the 15th.
- **Spread / fixed rate** (all indexers): `+ DU/252 · ln(1 + rate)` (rate empty = 0).

`gross(date) = round(amount · exp(lnTotal), 2)`.

### Custody (TESOURO only)

`custody = round(0.002 · max(0, avgBalance − (SELIC ? 10000 : 0)) · calendarDays / 365, 2)`,
`avgBalance = logarithmic mean of amount and gross = (gross − amount) / ln(gross/amount)` (or `amount` if equal).
Estimate only: B3 actually charges every January/July on market value.

### Income tax (not ISENTO)

Regressive by **calendar days** since purchase: ≤180 → 22.5%; ≤360 → 20%; ≤720 → 17.5%; else 15%.
`ir = round(max(0, gross − custody − amount) · rate, 2)`. IOF and brokerage fees are ignored.

### Per-investment outputs

- calendar days, DU, IR rate
- gross at maturity, custody, IR, **net at maturity** = gross − custody − IR, net gain
- gross rate a.a. = `(gross/amount)^(252/DU) − 1`; net rate a.a. same with net; monthly = `(1+a.a.)^(1/12) − 1`
- real net rate a.a. = `(net/amount / exp(L(maturity) − L(purchase)))^(252/DU) − 1`
- **current value** at `clamp(baseDate, purchase, maturity)`: same formulas over the shorter window (gross, custody to date, IR by days held) → gross now, net now.

### Portfolio

- Totals: invested, net at maturity, net gain, IR, custody, gross now, net now, first purchase, last maturity.
- **Portfolio IRR (base 252)**: cash flows = −amount at each purchase, +net at each maturity; time of each flow = `NETWORKDAYS(firstPurchase, date − 1)/252`; solve `Σ CF · (1+r)^(−t) = 0` with Newton's method seeded by XIRR.
- Monthly = `(1+r)^(1/12) − 1`; average IPCA a.a. over the period, real portfolio rate = `(1+r)/(1+ipca) − 1`.
- XIRR in calendar days is shown for reference only.
- Checks: all purchases after start of rate data; IPCA investments bought on/after 15/01/2020; count of past months with no IPCA informed.

### Limitations (inherited)

Semi-annual coupons are treated as reinvested at the same rate and taxed at maturity. Tesouro unit-price truncation is not reproduced. Future values depend on the projected CDI/Selic/IPCA.

### Reference values (base date 17/11/2026)

|                     | CDB Banco X 110% CDI    | Tesouro Selic 2029      | Tesouro IPCA+ 2035      |
| ------------------- | ----------------------- | ----------------------- | ----------------------- |
| type / indexer      | CDB / CDI 110%          | TESOURO / SELIC +0.05%  | TESOURO / IPCA +6.80%   |
| purchase → maturity | 10/03/2025 → 10/03/2028 | 02/06/2025 → 01/03/2029 | 15/08/2025 → 15/05/2035 |
| amount              | 10.000,00               | 15.000,00               | 8.000,00                |
| calendar days / DU  | 1096 / 754              | 1368 / 938              | 3560 / 2440             |
| gross at maturity   | 15.445,23               | 24.472,12               | 23.113,33               |
| custody             | 0,00                    | 70,10                   | 277,87                  |
| IR                  | 816,78                  | 1.410,30                | 2.225,32                |
| net at maturity     | 14.628,45               | 22.991,72               | 20.610,14               |
| gross / net a.a.    | 15,64% / 13,56%         | 14,05% / 12,16%         | 11,58% / 10,27%         |
| real net a.a.       | 8,76%                   | 7,53%                   | 5,54%                   |
| gross / net now     | 12.852,65 / 12.353,44   | 18.301,55 / 17.707,89   | 9.131,15 / 8.915,45     |

These depend on the bundled rate/IPCA tables at that time; keep a frozen copy of those tables as test fixtures.
Portfolio (with the sheet's full example set, 44.000,00 invested): net at maturity 74.398,44, IRR base 252 11,64% a.a.
