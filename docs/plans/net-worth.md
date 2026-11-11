# Plan: other assets and total net worth

Read [README.md](README.md) first.

## Goal

Track savings that aren't at a broker, such as Certificados de Aforro, term deposits, crypto, current accounts,
PPR and property, next to the investment portfolios, and show the total net worth.

## Decision (confirmed by the user)

These assets belong to the **user**, not to a portfolio. That way they don't change the returns (XIRR) or the
IRS of the broker portfolios, and a new "Património" page adds up every portfolio plus these assets.

## The key idea

These assets have no broker transactions; each type has its own way of getting a value:

| Type | Value | Automatic? |
|---|---|---|
| `term_deposit` (depósito a prazo) | Principal + interest from the gross rate (TANB), start, maturity and capitalisation; 28% withheld on interest | Yes, a formula |
| `savings_certificate` (Certificados de Aforro) | Principal + interest capitalised quarterly at the series' rate plus permanence bonuses; 28% withheld | Phase 1: the user enters the value from AforroNet. Phase 3: computed |
| `crypto` | Quantity × current price (Yahoo has `BTC-EUR`, `ETH-EUR`, …) | Yes, phase 2 |
| `cash_account`, `ppr`, `real_estate`, `other` | Last value entered | Manual |

## Backend

1. **Migration `000013_add_other_assets`:**
   - `other_assets(id INTEGER PK, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT
     NULL CHECK(type IN (...)), name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'EUR', details TEXT (JSON: rate,
     maturity, capitalisation, series, ticker…), opened_at TEXT, closed_at TEXT, created_at, updated_at)`.
   - `other_asset_entries(id INTEGER PK, asset_id INTEGER NOT NULL REFERENCES other_assets(id) ON DELETE CASCADE,
     date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('contribution','withdrawal','valuation','interest')),
     amount REAL NOT NULL, quantity REAL, note TEXT)`, index on `(asset_id, date)`.
   - Keeping money moved in or out apart from valuations is what allows returns and a history.
2. **Pure package `backend/src/networth`** with tests: the value of an asset on a date for each type.
   - Term deposit: simple interest for capitalisation at maturity, compound for monthly/quarterly; gross and
     net of 28%; stops growing at maturity.
   - Manual types: the last valuation on or before the date, plus later contributions and minus later
     withdrawals.
3. **Service + endpoints:**
   - CRUD: `GET/POST /api/other-assets`, `PUT/DELETE /api/other-assets/{id}`, `POST /api/other-assets/{id}/entries`,
     `DELETE /api/other-assets/{id}/entries/{entryId}`. Every query filters by `user_id`.
   - `GET /api/net-worth` → total; per type; per asset; the broker portfolios (holdings value + cash of each
     portfolio of the user, from `GetCurrentHoldingsWithValue` and `GetCurrentCashBalance`); a monthly history
     (portfolios from `portfolio_snapshots`, other assets from their entries or formula).
4. MCP tool `get_net_worth`.

## Frontend

- Page `/net-worth` "Património", in the menu:
  - Cards: Património total, Investimentos (brokers), Outros ativos, Variação do mês.
  - Doughnut by type, line of the total over time.
  - Assets table with "Atualizar valor" (adds a valuation entry) and "Movimentos".
  - "Adicionar ativo" dialog whose fields change with the type (a term deposit asks for principal, TANB, start,
    maturity and capitalisation; a manual asset asks for the current value).
- Dashboard: a "Património total" card linking to the page.

## Phases

1. Manual types and term deposits, the page, the dashboard card. **Start here and stop for feedback.**
2. Crypto: entries with quantity; value from Yahoo. `getPriceForTicker` in `price_service.go` is private; add a
   public method to `PriceService`. History from `GetHistoricalPrices(ticker)`. Portuguese tax on crypto differs
   from shares (gains on crypto held 365 days or more are exempt), so if it ever enters the tax simulator, check
   the current rules first and ask the user.
3. Certificados de Aforro computed automatically. The rules (series E/F, monthly base rate from Euribor, caps,
   permanence bonuses) change over time: research them from the official source (IGCP), put the rates in
   `backend/data/aforro_rates.json` (the `data/*.json` files are embedded, see `runtime_desktop.go`), and confirm
   the result against the user's AforroNet values before trusting it. Don't guess the rules.
4. Other assets in the target allocation groups (for example Certificados de Aforro in "Obrigações / Seguro").
   Coordinate with [target-allocation.md](target-allocation.md): `allocation_assignments` would need to point at
   an `other_assets.id` as well as an ISIN.

## Tests

The valuation of each type on several dates (before start, during, after maturity), the ownership checks of
every endpoint, and the net-worth totals with a stubbed portfolio. Then the README checks: these assets must not
change the IRS page, the dashboard XIRR or the portfolio history.
