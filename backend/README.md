# VisorFinanceiro - Backend

This is the Go backend of VisorFinanceiro, a portfolio tracker and tax helper. It parses broker exports (DEGIRO, Interactive Brokers), stores the transactions, values the holdings with Yahoo Finance prices, calculates realized gains, dividends and fees, and serves the API used by the frontend.

See [ARCHITECTURE_DOCUMENTATION.md](../ARCHITECTURE_DOCUMENTATION.md) for the architecture, the full list of environment variables and API endpoints, and deployment.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the Backend](#running-the-backend)
- [Tests](#tests)
- [Desktop Build](#desktop-build) (and setting up a new PC)
- [Asking Claude about the portfolio (MCP)](#asking-claude-about-the-portfolio-mcp)

## Prerequisites

- [Go](https://golang.org/dl/) 1.24 or higher. No SQLite install or C compiler is needed: the SQLite driver is pure Go.

## Setup

1.  **Environment variables:** `JWT_SECRET` and `CSRF_AUTH_KEY` are required. In development they are read from a `.env` file in the current folder or, failing that, the one above it (the project root, which the frontend also reads), for example:
    ```bash
    JWT_SECRET=some-long-random-string
    CSRF_AUTH_KEY=another-32-byte-random-string
    ```
    Everything else has a default; see [Environment Variables](../ARCHITECTURE_DOCUMENTATION.md#environment-variables).

2.  **Database:** SQLite. The database file (`visorfinanceiro.db`, or `DATABASE_PATH`) is created in the `backend` directory the first time the server starts, and the migrations in `db/migrations` are applied automatically on every start.

3.  **Dependencies:**
    ```bash
    go mod download
    ```

## Running the Backend

From the `backend` directory:

```bash
go run .
```

(`go run main.go` doesn't work: the `main` package is split across several files.) The server starts on `http://localhost:8080`, or the port in `PORT`. All API endpoints are under `/api`; the routes are in `main.go`.

## Tests

```bash
go test ./src/...
```

## Desktop Build

On a new Windows PC, double-click `setup.bat` in the project root: it installs Go and Node.js if needed, builds the app, and adds it to Claude Desktop (installing Claude Desktop if needed). See [Setting Up on a New PC](../ARCHITECTURE_DOCUMENTATION.md#setting-up-on-a-new-pc). After that, open the app with `Abrir VisorFinanceiro.exe` in the project root: it rebuilds the app first when the code changed (see [Launcher](../ARCHITECTURE_DOCUMENTATION.md#launcher)).

`build-desktop.bat` in the project root only builds `dist\VisorFinanceiro.exe`: one file that runs the whole app on this PC, with the frontend embedded and served next to the API on `http://127.0.0.1:38471`. It needs no configuration or login, and keeps its data in `%LOCALAPPDATA%\VisorFinanceiro`. The desktop code is in `runtime_desktop.go`, behind the `desktop` build tag.

---
## Asking Claude about the portfolio (MCP)

The desktop build (`build-desktop.bat`) can also run as an [MCP](https://modelcontextprotocol.io) server, which lets Claude Desktop read the portfolio and answer questions about it, such as "what's my biggest position?" or "how much did I get in dividends in 2025?". It works with a normal Claude subscription and needs no API key.

`setup.bat` does steps 1 and 2 by itself. By hand:

1. Build `dist\VisorFinanceiro.exe` with `build-desktop.bat`.
2. Add the app to Claude Desktop's `claude_desktop_config.json` (use the path of your executable, with doubled backslashes). The file is in `%APPDATA%\Claude`, or, when Claude Desktop is installed as a packaged app, in `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude`. Create it if it doesn't exist yet. Claude Desktop also opens it from **Settings → Developer → Edit Config**, once the developer settings are shown:

   ```json
   {
     "mcpServers": {
       "visorfinanceiro": {
         "command": "C:\\_DEV\\VisorFinanceiro\\dist\\VisorFinanceiro.exe",
         "args": ["mcp"]
       }
     }
   }
   ```

3. Restart Claude Desktop. VisorFinanceiro appears under the tools ("+" → Connectors) of a new chat.

Claude Desktop starts `VisorFinanceiro.exe mcp` in the background whenever it needs it, so the app doesn't have to be open. It reads the same data as the app, and only reads: the tools can't upload, change or delete anything. The answers do send that data to Claude, like anything else typed into a chat.

The tools are in `src/mcpserver`:

| Tool | What it returns |
|---|---|
| `list_portfolios` | The portfolios. The others use the default one unless given a `portfolio_id`. |
| `get_portfolio_overview` | Holdings with cost, market value, unrealised gain, weight, sector and country (and each ETF's sector breakdown); cash; totals; the portfolio's sector exposure with ETFs split across their sectors. |
| `get_open_lots` | The purchase lots still held (FIFO), with their date and cost. |
| `get_option_positions` | Open option positions. |
| `get_realized_gains` | Stock sales and closed options with their gain, totals per year, and sales without a purchase. |
| `get_dividends` | Dividends per year and country, tax withheld, yield, the projection, and optionally each payment. |
| `get_fees` | Fees per year and category, and the fees themselves. |
| `get_performance_history` | Daily, weekly or monthly value, net deposits, cash and the S&P 500 benchmark. |
| `get_transactions` | The transactions, filtered by year, type, ISIN or text. |

To try the MCP mode against a development database instead, run `go run . mcp` with `MCP_USER_EMAIL` set to the email of the account to use. The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) (`npx @modelcontextprotocol/inspector go run . mcp`) shows the tools and lets you call them.
