# Feature plans

Each file here is a self-contained plan for one feature, written so an agent can pick it up without the
conversation it came from. Read this file first, then the plan you were given.

| Plan | Size | Depends on |
|---|---|---|
| [dividend-calendar.md](dividend-calendar.md) | Small to medium | Nothing |
| [target-allocation.md](target-allocation.md) | Medium | The tax simulator (already built) for its optional phase 2 |
| [net-worth.md](net-worth.md) | Large, in phases | Its phase 4 links into target allocation |

Suggested order: dividend calendar, target allocation, net worth. The first two can run in parallel.

## The app in one paragraph

VisorFinanceiro tracks an investment portfolio imported from DEGIRO and Interactive Brokers. Backend in Go
(`backend/`, SQLite, chi router), frontend in React + MUI + react-query + Chart.js (`frontend/`). It runs as a
web server, as a single desktop executable (`dist\VisorFinanceiro.exe`, build tag `desktop`) and as an MCP
server for Claude Desktop (`VisorFinanceiro.exe mcp`). Start with `ARCHITECTURE_DOCUMENTATION.md` and
`backend/README.md`.

## Conventions

- **Language:** the UI is in European Portuguese (pt-PT: "ecrã", "ficheiro", "levantamento"). Code, comments,
  commit messages and documentation are in English.
- **Amounts** are in EUR. Transaction dates are `DD-MM-YYYY` strings (`utils.DefaultDateFormat`); parse them with
  `utils.ParseDate` (Go) or `parseDateRobust` (frontend, `lib/utils/dateUtils.js`).
- **Backend layout:** pure rules in their own package with tests (see `backend/src/tax` for the pattern);
  service methods on `uploadServiceImpl` in a new file per feature (see `src/services/tax_simulation.go`), added to
  the `UploadService` interface in `src/services/interfaces.go`; handlers in `src/handlers/<feature>_handler.go`;
  routes in the protected group of `backend/main.go` (next to `/tax/simulate-sale`). Read-only endpoints are
  `GET`. Writes are `POST`/`PUT`/`DELETE`; the frontend's `apiClient` (`frontend/src/lib/api.js`) sends the CSRF
  token by itself.
- **Ownership:** every query filters by `user_id` (and `portfolio_id` where it applies). Check that a
  `portfolio_id` from the request belongs to the user, as the existing handlers do.
- **Migrations:** `backend/db/migrations/0000NN_name.up.sql` (+ `.down.sql`), embedded in the executable and run
  at start-up. Numbers are reserved per plan so parallel work doesn't collide: **000012 target allocation,
  000013 net worth, 000014 other assets in the allocation groups**. The dividend calendar needs no migration.
- **Frontend layout:** feature folders under `frontend/src/features/<feature>/{api,components,pages,logic}`. Reuse
  `features/analytics/components/MetricCard.jsx` for metric cards, MUI `DataGrid` with
  `ptPT.components.MuiDataGrid.defaultProps.localeText` for tables, month labels from `MONTH_NAMES_CHART`
  (`constants.js`). Routes in `frontend/src/App.jsx`, menu in `frontend/src/layouts/Layout.jsx`.
- **MCP:** every feature that answers a question gets a read-only tool in `backend/src/mcpserver` (see
  `tax_tools.go`), listed in the tools table of `backend/README.md`.
- **Docs:** update `ARCHITECTURE_DOCUMENTATION.md` (Key Features, and a section if the feature has rules worth
  explaining) in the same change.

## Checks before finishing

1. `cd backend && go build ./... && go test ./src/...`
2. `cd frontend && npx vite build --outDir <a temporary folder> --emptyOutDir` (builds without touching
   `backend/desktop_web`).
3. **Never run a build of your branch on the user's real database.** The executable runs the migrations at
   start-up, so a build with a new migration would upgrade `%LOCALAPPDATA%\VisorFinanceiro\visorfinanceiro.db`,
   and the user's current app might no longer open it. The desktop build finds its data folder through the
   `LOCALAPPDATA` variable, so work on a copy:
   - Before changing anything, copy `visorfinanceiro.db` (and the `-wal` and `-shm` files next to it, if they
     exist) from `%LOCALAPPDATA%\VisorFinanceiro\` into `<tmp>\appdata\VisorFinanceiro\`.
   - Run every build with `LOCALAPPDATA=<tmp>\appdata` set, for every command below.
   - The copy and every file written from it hold the user's real data: keep them in a temporary folder,
     never in the repo.
4. **The IRS page must not change.** None of these plans should touch it, but prove it:
   - Before changing anything: build the desktop executable to a temporary folder
     (`cd backend && CGO_ENABLED=0 go build -tags desktop -o <tmp>\snap.exe .`) and run
     `<tmp>\snap.exe tax-snapshot <tmp>\before.json` (on the copy, see 3).
   - After the change: build again and run `tax-snapshot <tmp>\after.json`, still on the copy.
   - `node scripts/compare-tax-snapshot.js <tmp>\before.json <tmp>\after.json` must print
     "Nenhum valor da página do IRS mudou."
5. **Try it on the real data without the server.** The user usually has the app open, which holds port 38471,
   and closing it isn't allowed. The MCP mode doesn't open the port: start `<tmp>\snap.exe mcp` (on the copy)
   and send it JSON-RPC over stdin (`initialize`, `notifications/initialized`, then `tools/call`) to call the
   new tool.
6. Tell the user to close the app and open `VisorFinanceiro (desenvolvimento).exe`, which rebuilds it, to see
   the pages. Say plainly that the UI wasn't seen in a browser if it wasn't.

## Decisions already made by the user

- Capital gains tax: 28% autonomous rate on the year's balance of shares and options, no englobamento, no
  losses carried from earlier years. The 365-day rule is shown as information only.
- Commit only when the user asks, on the user's branch (currently `devAngelo`), ending the message with the
  attribution line the session gives.
