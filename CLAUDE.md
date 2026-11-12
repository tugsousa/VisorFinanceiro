# VisorFinanceiro

VisorFinanceiro tracks an investment portfolio imported from DEGIRO and Interactive Brokers, plus the savings
kept outside the brokers (accounts, term deposits, Certificados de Aforro, PPR, crypto, property). Backend in Go
(`backend/`, SQLite, chi router), frontend in React + MUI + react-query + Chart.js (`frontend/`). It runs as a
web server, as a single desktop executable (`dist\VisorFinanceiro.exe`, build tag `desktop`, served on
`http://127.0.0.1:38471`) and as an MCP server for Claude Desktop (`VisorFinanceiro.exe mcp`).

Start with `ARCHITECTURE_DOCUMENTATION.md` (features and the rules behind them) and `backend/README.md`
(running, building, the MCP tools).

## Conventions

- **Language:** the UI is in European Portuguese (pt-PT: "ecrã", "ficheiro", "levantamento"). Code, comments,
  commit messages and documentation are in English.
- **Amounts** are in EUR. Transaction dates are `DD-MM-YYYY` strings (`utils.DefaultDateFormat`); parse them with
  `utils.ParseDate` (Go) or `parseDateRobust` (frontend, `lib/utils/dateUtils.js`).
- **Backend layout:** pure rules in their own package with tests (`backend/src/tax`, `allocation`, `dividends`,
  `networth`); service methods on `uploadServiceImpl` in a file per feature (e.g. `src/services/tax_simulation.go`),
  added to the `UploadService` interface in `src/services/interfaces.go`; handlers in
  `src/handlers/<feature>_handler.go`; routes in the protected group of `backend/main.go`. Read-only endpoints are
  `GET`; writes are `POST`/`PUT`/`DELETE`. The frontend's `apiClient` (`frontend/src/lib/api.js`) sends the CSRF
  token by itself.
- **Ownership:** every query filters by `user_id` (and `portfolio_id` where it applies). Check that a
  `portfolio_id` from the request belongs to the user, as the existing handlers do.
- **Migrations:** `backend/db/migrations/0000NN_name.up.sql` (+ `.down.sql`), embedded in the executable and run
  at start-up. The last one is `000014_add_allocation_other_assets`; a new one takes the next number.
- **Frontend layout:** feature folders under `frontend/src/features/<feature>/{api,components,pages,logic}`.
  Reuse `features/analytics/components/MetricCard.jsx` for metric cards; MUI `DataGrid` with
  `ptPT.components.MuiDataGrid.defaultProps.localeText` for tables; `components/ui/DateField.jsx` for dates (not
  `<TextField type="date">`, which follows the browser's language); month labels from `MONTH_NAMES_CHART`
  (`constants.js`). Routes in `frontend/src/App.jsx`, menu in `frontend/src/layouts/Layout.jsx`.
- **MCP:** every feature that answers a question gets a read-only tool in `backend/src/mcpserver` (see
  `tax_tools.go`), listed in the tools table of `backend/README.md`.
- **Docs:** update `ARCHITECTURE_DOCUMENTATION.md` (Key Features, and a section if the feature has rules worth
  explaining) in the same change.

## Checks before finishing

1. `cd backend && go build ./... && go test ./src/...`
2. `cd frontend && npx vitest run` and `npx vite build --outDir <a temporary folder> --emptyOutDir` (builds
   without touching `backend/desktop_web`).
3. **The IRS page must not change** unless that's the point of the change. Prove it:
   - Before changing anything: build the desktop executable to a temporary folder
     (`cd backend && CGO_ENABLED=0 go build -tags desktop -o <tmp>\snap.exe .`) and run
     `<tmp>\snap.exe tax-snapshot <tmp>\before.json`.
   - After the change: build again and run `tax-snapshot <tmp>\after.json`.
   - `node scripts/compare-tax-snapshot.js <tmp>\before.json <tmp>\after.json` must print
     "Nenhum valor da página do IRS mudou."
4. **Try it on the real data without the server.** The user usually has the app open, which holds port 38471,
   and closing it isn't allowed. The MCP mode doesn't open the port: start `<tmp>\snap.exe mcp` and send it
   JSON-RPC over stdin (`initialize`, `notifications/initialized`, then `tools/call`) to call a tool.
5. Tell the user to close the app and open `VisorFinanceiro (desenvolvimento).exe`, which rebuilds it, to see
   the pages. Say plainly that the UI wasn't seen in a browser if it wasn't.

## Decisions already made by the user

- Capital gains tax: 28% autonomous rate on the year's balance of shares and options, no englobamento, no
  losses carried from earlier years. The 365-day rule is shown as information only.
- Other assets (accounts, deposits, Aforro, PPR, crypto, property) belong to the user, not to a portfolio, so
  they don't change the returns (XIRR) or the IRS of the broker portfolios.
- Target allocation works on groups the user creates; each holding (or other asset) is assigned to one group.
- Certificados de Aforro: the value that counts is the one typed from AforroNet. The app's estimate only counts
  if the user accepts it, and it can only start from a value dated December 2024 or later (the first month
  with an official IGCP rate in `backend/data/aforro_rates.json`). Still open: compare an estimate with
  AforroNet, and add each new month's rate to that file.
- Commit only when the user asks, on the user's branch (currently `devAngelo`), ending the message with the
  attribution line the session gives.
