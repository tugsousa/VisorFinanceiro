# Plan: target allocation and rebalancing

Read [README.md](README.md) first.

## Goal

The user sets target percentages (for example 80% shares, 20% bonds), sees how far the portfolio is from
them, and gets a suggestion for splitting the next deposit to get closer, without selling.

## Decision (confirmed by the user)

Targets are set on **groups the user creates** ("Ações Mundo", "Emergentes", "Obrigações", "Ouro", "Liquidez"),
and each holding is assigned to one group. A target per individual asset is then just a group with one asset,
so this covers both.

The asset type from Yahoo isn't enough on its own: an ETF is just "ETF", whether it holds shares or bonds.

## What exists

- Current holdings with value: `GetCurrentHoldingsWithValue` (`models.HoldingWithValue`: ISIN, name, quantity,
  cost, `current_price_eur`, `market_value_eur`, `status`, `asset_type`, `sector_weights`). Cash:
  `GetCurrentCashBalance`.
- ETF composition: `fundSectorWeights` in `backend/src/services/price_service.go` adds the bond share of a fund
  under the sector `fundBondsSector`, so `sector_weights` tells how much of an ETF is bonds. Use it to suggest a
  group (mostly bonds → "Obrigações", otherwise shares) when the user first opens the page.
- The dashboard's allocation charts: `frontend/src/features/dashboard/components/AllocationSection.jsx` and
  `HoldingsAllocationChart.jsx`.
- The tax simulator (`SimulateStockSale`, `src/services/tax_simulation.go`) for phase 2.

## Backend

1. **Migration `000012_add_allocation_targets`:**
   - `allocation_groups(id INTEGER PK, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
     name TEXT NOT NULL, target_pct REAL NOT NULL, color TEXT, sort_order INTEGER, includes_cash INTEGER NOT NULL
     DEFAULT 0, UNIQUE(portfolio_id, name))`. `includes_cash` puts the broker cash balance in that group.
   - `allocation_assignments(portfolio_id INTEGER NOT NULL, isin TEXT NOT NULL, group_id INTEGER NOT NULL
     REFERENCES allocation_groups(id) ON DELETE CASCADE, preferred INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY(portfolio_id, isin))`. `preferred` is the asset to buy for that group.
   - `allocation_settings(portfolio_id INTEGER PRIMARY KEY, tolerance_pp REAL NOT NULL DEFAULT 5)`.
2. **Pure package `backend/src/allocation`** with tests:
   - Drift per group: current value, current %, target %, difference in points and in EUR.
   - Deposit plan (never sells): total after the deposit `T = V + D`; what each group lacks
     `need_i = max(0, target_i × T − value_i)`. If `Σ need ≤ D`, give each group its need and split the rest by
     target. Otherwise split `D` in proportion to the needs. Return the amount per group and the resulting %.
   - Shares to buy per group: amount ÷ price of the preferred asset (or the largest one in the group),
     rounded down, with the amount left over.
   - Validation: targets add up to 100% (±0.01); names unique; an ISIN in one group at most.
3. **Service** `src/services/allocation.go` and endpoints:
   - `GET /api/allocation?portfolio_id=` → groups, assignments, drift, holdings not assigned, suggested group per
     holding, tolerance.
   - `PUT /api/allocation/groups` (replaces all groups in one transaction), `PUT /api/allocation/assignments`,
     `PUT /api/allocation/settings`.
   - `GET /api/allocation/deposit-plan?portfolio_id=&amount=` (read-only).
4. MCP tools `get_allocation_drift` and `plan_deposit`.

## Frontend

- A tab "Alocação-alvo" next to the positions on the Portfólio page (`features/portfolio/pages/PortfolioPage.jsx`),
  or its own page `/portfolio/allocation`; pick whichever reads better and say so.
- **Set-up the first time:** create groups with name, target % and colour (live total that must reach 100%), and
  assign each holding with a select, starting from the suggested groups.
- **Status:** table per group (target, current, difference with a bar centred on zero, red outside the
  tolerance); a double doughnut (outside ring target, inside ring current).
- **Deposit calculator:** amount input → amount per group and shares of the preferred asset to buy.
- **Dashboard:** a small warning when any group is outside the tolerance, linking to the page.

## Phase 2 (done)

Built as `GET /api/allocation/rebalance-plan`, the card "Reequilibrar com vendas" and the MCP tool
`plan_rebalance`; the total tax comes from all the sales simulated together, not from adding up each one. See
"Target Allocation" in `ARCHITECTURE_DOCUMENTATION.md`.

"Rebalance by selling": the sales that would bring every group back to its target, each through
`SimulateStockSale` so the user sees the IRS cost before deciding. Show the total tax.

## Tests

The pure package (drift, deposit plan with and without enough money, rounding of shares, validation) and the
ownership checks of the endpoints. Then the README checks.
