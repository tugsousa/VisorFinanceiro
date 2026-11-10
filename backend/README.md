# Taxfolio - Backend

This is the backend server for Taxfolio, a portfolio tracker and tax helper application. It handles data processing, storage, user authentication, and provides an API for the frontend.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [Environment Variables](#environment-variables)
  - [Database](#database)
  - [Dependencies](#dependencies)
- [Running the Backend](#running-the-backend)
- [API Endpoint Overview](#api-endpoint-overview)

## Prerequisites

- [Go](https://golang.org/dl/) version 1.23.0 or higher.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-url>/backend
    ```

3.  **Database:**
    The application uses SQLite. The database file (`taxfolio.db`) will be automatically created in the `backend` directory when the server starts for the first time, if it doesn't already exist. The schema is also initialized automatically.

4.  **Dependencies:**
    Fetch the Go module dependencies:
    ```bash
    go mod tidy
    # or
    go mod download
    ```

## Running the Backend

 **Start the server:**
    From the `backend` directory, run:
    ```bash
    go run main.go
    ```
    The server will start, typically on `http://localhost:8080` (or the port specified by `PORT`).

## API Endpoint Overview

All API endpoints are prefixed with `/api`.

### Authentication (`/api/auth/`)

*   `GET /csrf`: Provides a CSRF token.
*   `POST /login`: Authenticates a user and returns JWT access and refresh tokens.
*   `POST /register`: Registers a new user.
*   `POST /logout`: Invalidates the user's current session.
*   `POST /refresh`: Refreshes an expired access token using a valid refresh token.

### Data Management (Authenticated & CSRF Protected)

*   `POST /upload`: Uploads a CSV file for transaction processing.
*   `GET /dashboard-data`: Retrieves consolidated data for the user's dashboard.
*   `GET /transactions/processed`: Retrieves all processed transactions for the authenticated user.
*   `GET /holdings/stocks`: Retrieves current stock holdings.
*   `GET /holdings/options`: Retrieves current option holdings.
*   `GET /stock-sales`: Retrieves details of all stock sales.
*   `GET /option-sales`: Retrieves details of all option sales.
*   `GET /dividend-tax-summary`: Retrieves a summary of dividends and taxes paid.
*   `GET /dividend-transactions`: Retrieves individual dividend and dividend tax transactions.

---
## Asking Claude about the portfolio (MCP)

The desktop build (`build-desktop.bat`) can also run as an [MCP](https://modelcontextprotocol.io) server, which lets Claude Desktop read the portfolio and answer questions about it, such as "what's my biggest position?" or "how much did I get in dividends in 2025?". It works with a normal Claude subscription and needs no API key.

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
