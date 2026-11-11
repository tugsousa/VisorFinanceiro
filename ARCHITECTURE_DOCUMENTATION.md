# VisorFinanceiro Architecture Documentation

## Overview

VisorFinanceiro is a portfolio management and tax reporting application built with a Go backend and React frontend. The application allows users to upload transaction data from various brokers (DEGIRO, Interactive Brokers) and provides comprehensive portfolio analytics, tax calculations, and performance tracking.

## System Architecture

### Backend Architecture

The backend is built using Go with the following key components:

#### Core Services
- **Price Service** (`backend/src/services/price_service.go`) - Handles stock price fetching and caching, ISIN resolution and asset metadata
- **Upload Service** (`backend/src/services/upload_service.go`) - Manages file uploads, transaction processing, holdings valuation and portfolio history
- **Parallel Upload Service** (`backend/src/services/parallel_upload_service.go`) - Resolves ISINs, fetches prices and metadata in parallel during an upload
- **Job Queue** (`backend/src/services/job_queue.go`) - Background jobs: history rebuild, metrics update, dividend calculation
- **Email Service** (`backend/src/services/email_service.go`) - Handles email notifications
- **MFA Service** (`backend/src/services/mfa_service.go`) - Manages two-factor authentication

#### Run Modes
`backend/main.go` is the entry point of three modes:
- **Server** (`runtime_server.go`) - The normal API server, used in development and in the Docker deployment
- **Desktop** (`runtime_desktop.go`, build tag `desktop`) - A single executable built by `build-desktop.bat` (see [Desktop Build](#desktop-build))
- **MCP** (`mcp_mode.go`, `src/mcpserver`) - `VisorFinanceiro.exe mcp` runs a read-only MCP server so Claude Desktop can answer questions about the portfolio (see `backend/README.md`)

#### Data Processing Pipeline
1. **File Upload** - Users upload CSV files containing transaction data
2. **Parser Factory** - Routes files to appropriate parsers based on broker type
3. **Transaction Processing** - The Transaction Processor turns each broker's transactions into processed transactions, which then go through specialized processors:
   - Stock Sales Processor
   - Option Sales Processor  
   - Dividend Processor
   - Fee Processor
   - Exchange Rate Processor
   - Commission Processor
   - Cash Movement Processor

#### Database Schema

The application uses SQLite with the following key tables:

```sql
-- Core Tables
users                    - User accounts and authentication
portfolios              - User portfolio management (multi-portfolio support)
processed_transactions  - Transaction history with portfolio association
portfolio_snapshots     - Daily portfolio valuations
isin_ticker_map         - ISIN to ticker symbol mappings, with sector/industry/type and ETF sector weights
daily_prices           - Cached stock prices
failed_isins           - ISINs that couldn't be resolved to a ticker, so they aren't retried every time
other_assets           - Savings outside the brokers (term deposits, accounts, PPR...), owned by the user, not a portfolio
other_asset_entries    - Contributions, withdrawals, valuations and interest of those assets

-- Supporting Tables  
sessions               - Authentication sessions
login_history          - User login tracking
uploads_history        - File upload tracking
upload_failures        - Failed upload tracking
system_metrics         - Application metrics
```

### Frontend Architecture

The frontend is built with React 18 using Vite as the build tool, Material-UI (MUI) for UI components, and React Router v6 for navigation. The application follows a feature-based architecture with comprehensive state management and data fetching patterns.

#### Tech Stack
- **Framework**: React 18.3.1 with functional components and hooks
- **Build Tool**: Vite 5.4.21 for fast development and optimized builds
- **UI Library**: Material-UI v5 with custom theming
- **State Management**: React Context API with custom hooks
- **Data Fetching**: TanStack Query (React Query) v5 for server state management
- **Routing**: React Router DOM v6 with protected routes
- **Charts**: Chart.js v4 with specialized adapters for financial data
- **Form Handling**: Native HTML forms with validation
- **Styling**: CSS-in-JS with MUI styling system

#### Key Features
- **Multi-Portfolio Support** - Users can manage multiple portfolios with seamless switching
- **Analytics Dashboard** - Portfolio value, returns (including XIRR), evolution against an S&P 500 benchmark converted to EUR, asset allocation and a heatmap
- **Analytics Pages** - Performance, stock sales, option sales, dividends, fees, and deposits and withdrawals (`/analytics/cash-flows`)
- **Tax Reporting** - Automated tax calculation and reporting; each line opens a drawer with the transactions behind it
- **Tax Simulator** - What selling today would give and cost in IRS (`/tax/simulator`, and "Simular venda" on the portfolio page); see [Tax Simulator](#tax-simulator)
- **Net Worth** - Every portfolio plus the savings kept outside the brokers (`/net-worth`, "Património", and a card on the dashboard); see [Net Worth](#net-worth)
- **Transactions** - The processed transactions, plus transactions added by hand
- **File Upload Interface** - Streamlined CSV upload process with drag-and-drop support
- **Admin Dashboard** - System administration and user management with detailed metrics
- **Dashboard Refresh** - Prices are refreshed when the dashboard opens and every 5 minutes while it stays open (`DASHBOARD_REFRESH_INTERVAL_MS`); while a history rebuild job runs, the dashboard polls every 3 seconds and reloads when it finishes
- **Responsive Design** - Mobile-first responsive design for all devices

#### Architecture Patterns

##### 1. Feature-Based Organization
The application follows a feature-based architecture where each major functionality is self-contained:

```
frontend/src/
├── features/           - Feature-based component organization
│   ├── admin/         - Administrative functionality
│   │   ├── api/       - Admin-specific API calls
│   │   ├── components/ - Admin UI components
│   │   ├── config/    - Admin configuration and constants
│   │   ├── hooks/     - Admin-specific hooks
│   │   └── pages/     - Admin pages
│   ├── analytics/     - Portfolio analytics
│   │   ├── api/       - Analytics API integration
│   │   ├── components/ - Chart and data visualization components
│   │   ├── config/    - Chart configurations
│   │   ├── hooks/     - Data fetching and processing hooks
│   │   ├── logic/     - Business logic for analytics
│   │   └── pages/     - Analytics pages
│   ├── auth/          - Authentication components (AuthContext.jsx)
│   │   ├── api/       - Authentication API calls
│   │   ├── components/ - Auth modals and route guards
│   │   └── pages/     - Auth pages (login, register, etc.)
│   ├── common/        - Shared pages (not found) and components
│   ├── dashboard/     - Main dashboard
│   │   ├── components/ - Dashboard widgets and charts
│   │   ├── hooks/     - Dashboard data fetching
│   │   └── pages/     - Dashboard page
│   ├── landing/       - Public landing page
│   ├── legal/         - Privacy policy, terms of service, contact
│   ├── portfolio/     - Portfolio management (PortfolioContext.jsx)
│   │   ├── api/       - Portfolio API integration
│   │   ├── components/ - Portfolio UI components
│   │   ├── hooks/     - Portfolio data management
│   │   └── pages/     - Portfolio pages
│   ├── settings/      - Account settings page
│   ├── upload/        - File upload functionality
│   │   ├── components/ - Upload interface components
│   │   └── pages/     - Upload and guide pages
│   └── tax/           - Tax reporting (TaxPage.jsx)
│       ├── components/ - Tax line detail drawer
│       └── logic/     - Tax calculation logic
├── components/        - Shared UI components
│   └── ui/           - Reusable UI components
├── layouts/          - Page layouts and wrappers
├── lib/              - Utility functions and API clients
│   ├── api.js        - Centralized API client
│   ├── theme.js      - MUI theme configuration
│   └── utils/        - Utility functions
└── constants.js      - Shared constants (e.g. refresh intervals)
```

##### 2. State Management Architecture
The application uses a hybrid state management approach:

- **Global State**: React Context API for authentication and portfolio selection
- **Server State**: TanStack Query for API data fetching, caching, and synchronization
- **Local State**: useState and useReducer for component-specific state

**Context Providers**:
- `AuthProvider`: Manages authentication state, tokens, and user information
- `PortfolioProvider`: Manages selected portfolio and portfolio switching

##### 3. Data Flow Pattern
```
1. User Action → Component Event Handler
2. API Call → TanStack Query mutation/query
3. Server Response → Query Cache Update
4. Component Re-render → UI Update
5. Optimistic Updates → Immediate UI feedback
```

##### 4. API Integration
Centralized API client (`frontend/src/lib/api.js`) provides:
- Automatic JWT token attachment
- CSRF token handling
- Error handling and retry logic
- Request/response interceptors
- Consistent API endpoint management

#### Component Architecture

##### 1. Layout System
- **Layout Component**: Main layout wrapper with navigation, headers, and footers
- **Route Guards**: Protected routes with authentication and authorization checks
- **Admin Layout**: Specialized layout for administrative functions

##### 2. Page Components
Each feature has dedicated page components that:
- Handle URL parameters and navigation
- Coordinate data fetching from multiple sources
- Manage page-level state and interactions
- Render feature-specific components

##### 3. Feature Components
- **Data Components**: Handle data fetching and processing
- **Display Components**: Present data in charts, tables, and visualizations
- **Interactive Components**: Handle user input and actions

##### 4. Shared Components
- **UI Components**: Reusable buttons, modals, forms, and inputs
- **Chart Components**: Specialized financial chart components using Chart.js
- **Data Grids**: Material-UI DataGrid for tabular data display

#### Key Technical Features

##### 1. Authentication Flow
- JWT-based authentication with automatic token refresh
- **Token Storage**: The access token is kept in `localStorage` and sent as an `Authorization: Bearer` header; the refresh token is an HttpOnly, SameSite=Lax cookie (Secure over HTTPS). CSRF tokens are required for all POST/PUT/DELETE operations
- CSRF protection for all state-changing operations
- Protected routes with role-based access control
- OAuth integration with Google for social login

##### 2. Data Visualization
- **Chart.js Integration**: Custom financial charts with date adapters
- **Heatmap Charts**: Portfolio allocation visualization
- **TreeMap Charts**: Asset distribution visualization
- **Asset Allocation** (dashboard "Alocação de Ativos"): by company, sector and asset type. "Por Setor" splits each ETF's value and cost across its sector weights; an ETF without weights, and the cash part of a fund, go to "Outros"
- **Interactive Charts**: Zoom, pan, and drill-down capabilities

##### 3. File Upload System
- Drag-and-drop interface for CSV file uploads
- Real-time upload progress tracking
- File validation and error handling
- Support for multiple broker formats (DEGIRO, Interactive Brokers)

##### 4. Performance Optimization
- **Code Splitting**: Route-based code splitting for faster initial loads
- **Lazy Loading**: Component-level lazy loading for heavy features
- **Query Caching**: Intelligent caching with cache invalidation
- **Virtualization**: DataGrid virtualization for large datasets

##### 5. Error Handling
- Global error boundaries for React errors
- API error handling with user-friendly messages
- Network error retry mechanisms
- Graceful degradation for failed operations

#### Development Workflow

##### 1. Environment Setup
```bash
# Install dependencies
npm install

# Start development server (Vite, http://localhost:3000, proxies /api to the backend)
npm start

# Build for production
npm run build

# Preview production build
npm run serve
```

##### 2. Code Organization
- Feature-based development with isolated components
- Consistent naming conventions (PascalCase for components, camelCase for functions)
- TypeScript-ready structure (though currently using JavaScript)
- Comprehensive error boundaries and loading states

##### 3. Testing Strategy
- The frontend has no test runner configured yet (`package.json` has no `test` script); React Testing Library is installed for when one is added
- Changes are checked with ESLint (`npx eslint src`) and by running the app

#### Integration with Backend

##### 1. API Communication
- RESTful API integration with the Go backend
- Automatic JWT token management
- CSRF token synchronization
- Data updates through periodic price refreshes and job polling

##### 2. Data Synchronization
- Optimistic updates for better UX
- Background data synchronization
- Cache invalidation on data changes
- Conflict resolution for concurrent updates

##### 3. Security Integration
- Automatic token refresh on expiration
- CSRF protection for all state-changing operations
- Secure cookie handling for authentication
- Input validation and sanitization

## Key Technical Features

### Multi-Portfolio Architecture

The system supports multiple portfolios per user with proper data isolation:

- Each transaction is associated with a specific portfolio
- Portfolio snapshots track daily valuations per portfolio
- Analytics and reporting are portfolio-specific
- Foreign key relationships ensure data integrity

### Transaction Processing

The system handles various transaction types:

1. **Stock Transactions** - Buy/sell operations with FIFO cost basis calculation
2. **Option Transactions** - Complex option strategies with position tracking
3. **Dividends** - Automatic dividend processing and tax reporting
4. **Fees and Commissions** - Transaction cost tracking
5. **Cash Movements** - Deposits and withdrawals
6. **Manual Transactions** - Transactions added by hand (`POST /api/transactions/manual`)

Sales with no earlier purchase to match (for example when the uploaded history is incomplete) have no cost basis; they are left out of the realized gains and listed separately (`GET /api/stock-sales/unmatched`).

Dividend source countries can be corrected per ISIN in `backend/data/dividend_source_overrides.json`.

### Tax Simulator

The tax rules are all in `backend/src/tax` (with tests): the gain of a sale is its result minus the commissions of the sale and of the part of the purchase sold; the year's stock and option results add up into one balance; a positive balance pays the autonomous rate of 28%. Results from lots held under 365 days are reported apart, since they must be added to the other income (englobamento) when the taxable income reaches the top bracket, which the app can't know. Losses of earlier years and englobamento aren't applied.

- `GET /api/tax/simulate-sale?portfolio_id=&isin=&quantity=&price=&commission=` adds a sale dated today to a copy of the transactions and runs the same FIFO as the real sales, so nothing is stored. It returns the lots used, the gain, the year's balance before and after, and the extra tax. An empty `price` uses the current price.
- `GET /api/tax/year-status?portfolio_id=` returns the year's balance and, for each position, its unrealised result, the tax effect of selling it all and its lots with the date each reaches 365 days.

The simulator only reads the FIFO; it doesn't change the IRS page. To check that a change leaves the IRS page as it was, run `VisorFinanceiro.exe tax-snapshot before.json` before it and `tax-snapshot after.json` after it, and compare the two files. It writes everything the IRS page gets from the backend, for every portfolio; the order of the option sales can change between runs, so compare the lists as sets.

### Net Worth

Savings kept outside the brokers are "other assets" (`other_assets`, with their movements in `other_asset_entries`). They belong to the **user, not to a portfolio**, so they never enter a portfolio's transactions, snapshots, returns (XIRR) or IRS. Their rules are in `backend/src/networth` (with tests); dates are `YYYY-MM-DD` and amounts EUR (other currencies aren't accepted yet).

- **Term deposits** (`term_deposit`) are computed from `details` (principal, TANB in %, maturity, capitalisation) and the start date (`opened_at`). Day count Actual/365: the actual days elapsed over a 365-day year, also in leap years. Interest paid at maturity is simple; monthly, quarterly or annual capitalisation adds each period's interest to the balance (periods counted in calendar months from the start, clamped to shorter months, the last one ending at maturity). Before maturity the value includes the interest accrued so far. 28% is withheld from each interest payment, so with capitalisation only the net interest compounds on the net balance. The value stops growing at maturity. The net worth counts the value net of the withholding; the gross value is also returned.
- **Manual types** (`cash_account`, `savings_certificate` until it's computed, `ppr`, `real_estate`, `other`): the last valuation on or before the date (a valuation includes the movements of its own day), plus later contributions and interest, minus later withdrawals.
- An asset with `closed_at` is worth nothing from that date on. `crypto` is allowed by the table but not by the API yet.

Endpoints (every query filters by the signed-in user): `GET/POST /api/other-assets`, `PUT/DELETE /api/other-assets/{id}` (the type can't change), `POST /api/other-assets/{id}/entries`, `DELETE /api/other-assets/{id}/entries/{entryId}` (term deposits take no entries), and `GET /api/net-worth`. The latter adds up every portfolio of the user, valued as on the dashboard (holdings at market price, at cost where there's no price, plus cash), and the other assets, and gives the totals per type and a history with one point per month end (the portfolios from the last snapshot of each month, the other assets from their entries or formula) and today. "Variação do mês" is the change since the end of last month, deposits included. The MCP tool `get_net_worth` returns the same.

### Portfolio History and Benchmark

The portfolio's daily value is stored in `portfolio_snapshots` and rebuilt by a background job after an upload. It is compared against an S&P 500 benchmark that buys SPY with the same EUR deposits; each day's SPY price is converted to EUR with that day's `USDEUR=X` rate, so the benchmark includes EUR/USD moves as the portfolio does.

### Price Caching System

- **Exchange Rates** - Automatic EUR conversion using Yahoo Finance daily rates (`EUR{CUR}=X`), with the European Central Bank API as a fallback
- **Stock Price Caching** - Local caching of stock prices to reduce API calls
- **ISIN Resolution** - Automatic mapping of ISIN codes to stock tickers via Yahoo Finance API with local database caching
- **Asset Metadata** - Sector, industry and asset type of each listing, from Yahoo Finance's `quoteSummary`, stored in `isin_ticker_map` and refreshed when older than 30 days (`metadata_updated_at`)
- **ETF Sector Weights** - A fund has no sector of its own, so its sector breakdown (the `topHoldings` module) is stored as JSON in `sector_weights`. Yahoo gives the sectors as shares of the fund's stocks; they are scaled by the fund's stock share, the bond share becomes an "Obrigações" entry, and the rest (cash) is left out. Sector keys are renamed to the names Yahoo uses for single stocks (e.g. `financial_services` → "Financial Services") so funds and stocks add up under the same sector. The weights come from Morningstar and can lag the fund's actual holdings by a few weeks

### Database Optimization

To handle concurrent web requests efficiently with SQLite, the database is opened (`src/database/database.go`, pure-Go `modernc.org/sqlite` driver, so no CGO or SQLite install is needed) with:

```sql
PRAGMA journal_mode=WAL;      -- Write-Ahead Logging for concurrent reads/writes
PRAGMA busy_timeout=5000;     -- Wait up to 5 seconds for a lock instead of failing
PRAGMA foreign_keys=ON;       -- Enforce foreign key relationships
```

**Concurrency Management**: The busy timeout (5 seconds, fixed in the connection string) manages SQLite's file-locking during concurrent writes. The backend is designed as a singleton service to maintain a single writer connection to the SQLite database, preventing database corruption and "Database is Locked" errors that would occur with horizontal scaling.

**Backup Strategy**: Since the database is a single file, automated backups can be performed using SQLite's `VACUUM INTO` command to create consistent backups without downtime:

```bash
# Example backup script
sqlite3 /app/db/visorfinanceiro.db "VACUUM INTO '/backup/visorfinanceiro_$(date +%Y%m%d_%H%M%S).db'"
```

### Security Features

- **JWT Authentication** - Secure token-based authentication
- **CSRF Protection** - Cross-site request forgery protection
- **MFA Support** - Two-factor authentication using TOTP for admin accounts
- **Rate Limiting** - Per-IP rate limiting, with a stricter limit on login, registration, password and MFA endpoints
- **Password Reset** - Secure password reset with email verification
- **Email Verification** - Account verification via email

## Configuration

### Environment Variables

The application uses environment-based configuration:

The variables are read from the environment by `backend/src/config/config.go`, which first loads a `.env` file from the current folder or its parent (in development, the project root's `.env`, which the frontend also reads). Only `JWT_SECRET` and `CSRF_AUTH_KEY` are required; the others have the defaults shown.

```bash
# Server
PORT=8080
LOG_LEVEL=info
DATABASE_PATH=./visorfinanceiro.db

# Security (required)
JWT_SECRET=your-secret-key
CSRF_AUTH_KEY=your-csrf-key
ACCESS_TOKEN_EXPIRY=60m
REFRESH_TOKEN_EXPIRY=168h
VERIFICATION_TOKEN_EXPIRY=24h
PASSWORD_RESET_TOKEN_EXPIRY=1h
ADMIN_EMAILS=admin@example.com   # comma-separated

# URLs
APP_BASE_URL=http://localhost:3000             # the frontend
REACT_APP_API_BASE_URL=http://localhost:8080   # the backend; also used by the frontend build
VERIFICATION_EMAIL_BASE_URL=                   # default: APP_BASE_URL/verify-email
PASSWORD_RESET_BASE_URL=                       # default: APP_BASE_URL/reset-password

# Email
EMAIL_SERVICE_PROVIDER=smtp
SENDER_EMAIL=noreply@example.com
SENDER_NAME=VisorFinanceiro
SMTP_SERVER=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URL=                           # default: REACT_APP_API_BASE_URL/api/auth/google/callback

# File Upload
MAX_UPLOAD_SIZE_BYTES=10485760  # 10MB

# Data files
COUNTRY_DATA_PATH=data/country.json
DIVIDEND_SOURCE_OVERRIDES_PATH=data/dividend_source_overrides.json
```

### Database Migrations

The system uses golang-migrate for database schema management. Pending migrations in `backend/db/migrations` are applied automatically when the backend starts (the desktop build embeds them). golang-migrate only moves forward from the database's current version: a gap in the numbers is fine, but a migration numbered below one a database has already run is never applied to it, and an executable that lacks the database's current migration refuses to start. So merge migrations in number order before a build runs on real data. To run them by hand:

```bash
go run github.com/golang-migrate/migrate/v4/cmd/migrate -path db/migrations -database sqlite://visorfinanceiro.db up
```

## Development Setup

### Backend Requirements
- Go 1.24+
- No SQLite install is needed (pure-Go driver)

### Frontend Requirements
- Node.js 18+
- npm

### Running the Application

1. **Backend Setup** (needs `JWT_SECRET` and `CSRF_AUTH_KEY`, e.g. in the root `.env`):
   ```bash
   cd backend
   go mod download
   go run .
   ```
   Use `go run .`, not `go run main.go`: the `main` package is split across several files.

2. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   npm start
   ```

3. **Database Initialization**:
   - The application automatically creates and migrates the database on startup
   - Initial schema includes all necessary tables and relationships

4. **Tests**:
   ```bash
   cd backend
   go test ./src/...
   ```

### Setting Up on a New PC

`setup.bat` (Windows) prepares a PC with nothing installed. Get the project (`git clone`, or **Code → Download ZIP** on GitHub, which needs no git) and double-click `setup.bat`. It runs `setup.ps1`, which:

1. Installs Go and Node.js with winget if they're missing or older than needed (Go 1.24, Node.js 18)
2. Builds `dist\VisorFinanceiro.exe` with `build-desktop.bat`, closing a running copy first so it can be replaced, and the launcher, `VisorFinanceiro (desenvolvimento).exe` (see [Launcher](#launcher))
3. Installs Claude Desktop with winget if it's missing, and adds VisorFinanceiro to its `claude_desktop_config.json` as an MCP server. It writes to the Microsoft Store version's folder (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`) and/or `%APPDATA%\Claude`, keeps the rest of the file, saves the previous version as `.bak`, and leaves a file that isn't valid JSON untouched

`setup.bat -SkipClaude` skips step 3. The script can be run again at any time, for example after pulling changes, to rebuild the app.

### Launcher

`VisorFinanceiro (desenvolvimento).exe`, in the project folder, is what to double-click to use the app. Its source is in `launcher/` (its own Go module, standard library only), and `setup.ps1` builds it. Each time it runs, it:

1. Checks whether `dist\VisorFinanceiro.exe` is missing or older than any file it's built from (in `frontend/` and `backend/`, plus `build-desktop.bat`). Build outputs, `node_modules`, databases, logs, tests, Markdown and `.env` files don't count
2. If so, rebuilds it: runs `setup.ps1 -SkipClaude -SkipLauncher` when Go or Node.js is missing; otherwise runs `npm install` when `package.json` or `package-lock.json` changed since the last install, closes every running `VisorFinanceiro.exe` (including the MCP server, which Claude starts again when needed), and runs `build-desktop.bat`
3. Starts `dist\VisorFinanceiro.exe` in its own window, which opens the browser (or only opens the browser when the app is already running)

A change to the launcher itself needs `setup.bat`, or `go build -o "..\VisorFinanceiro (desenvolvimento).exe" .` in `launcher/`.

The launcher needs the project's code next to it, so it's only for this PC. To give the app to someone else, send `dist\VisorFinanceiro.exe`: it runs on its own, with no code, Go or Node.js, and keeps its data in that person's `%LOCALAPPDATA%\VisorFinanceiro`. Windows warns about it the first time because it isn't signed ("More info" → "Run anyway").

SQLite doesn't need to be installed: the driver is pure Go and built into the executable, which creates the database on first run. The data isn't part of the project, so a new PC starts empty; upload the broker exports in the app.

### Desktop Build

`build-desktop.bat` (Windows) builds `dist\VisorFinanceiro.exe`, a single file that runs the whole app on one PC. It needs Go and Node.js only to build; the executable runs without them:

- It runs `npm run build:desktop`, which builds the frontend into `backend/desktop_web`, then `go build -tags desktop`
- The executable embeds the frontend, the migrations and the `data/*.json` files, and serves the frontend next to the API on `http://127.0.0.1:38471`, accepting connections from this PC only
- It creates its own secrets, signs the browser in to a local account and opens it, so there's nothing to configure or log in to
- Data is kept in `%LOCALAPPDATA%\VisorFinanceiro`
- `VisorFinanceiro.exe mcp` runs the MCP server instead (see `backend/README.md`)

## API Endpoints

The routes are defined in `backend/main.go`. Except for the public and auth routes, all need authentication and a CSRF token. Most data routes work on the selected portfolio.

### Authentication
- `GET /api/auth/csrf` - CSRF token
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Token refresh
- `GET /api/auth/verify-email` - Email verification
- `POST /api/auth/request-password-reset` - Request a password reset email
- `POST /api/auth/reset-password` - Password reset
- `GET /api/auth/google/login`, `GET /api/auth/google/callback` - Google sign-in

### User
- `GET /api/user/has-data` - Whether the user has uploaded data
- `POST /api/user/change-password` - Change password
- `POST /api/user/delete-account` - Delete the account

### Portfolio Management
- `GET /api/portfolios` - List user portfolios
- `POST /api/portfolios` - Create new portfolio
- `DELETE /api/portfolios/{id}` - Delete portfolio
- `POST /api/portfolios/{id}/refresh-snapshot` - Recalculate today's snapshot

### Transactions
- `POST /api/upload` - Upload transaction files
- `GET /api/transactions/processed` - Processed transactions
- `POST /api/transactions/manual` - Add a transaction by hand
- `DELETE /api/transactions/all` - Delete all processed transactions

### Holdings and Reporting
- `GET /api/holdings/current-value` - Current holdings with market value, sector and ETF sector weights
- `GET /api/holdings/stocks` - Stock holdings (purchase lots) per year
- `GET /api/holdings/options` - Open option positions
- `GET /api/cash-balance` - Cash balance
- `GET /api/realizedgains-data` - Combined realized gains data
- `GET /api/stock-sales` - Stock sales matched to purchases (FIFO)
- `GET /api/stock-sales/unmatched` - Sales without a matching purchase
- `GET /api/option-sales` - Closed option positions
- `GET /api/dividend-tax-summary` - Dividends and tax withheld per year and country
- `GET /api/dividend-transactions` - Individual dividend transactions
- `GET /api/dividend-metrics` - Dividend metrics
- `GET /api/fees` - Fees
- `GET /api/history/chart` - Portfolio history and benchmark

### Background Jobs
- `GET /api/jobs`, `GET /api/job` - Job status
- `POST /api/jobs/rebuild-history` - Rebuild the portfolio history
- `POST /api/jobs/update-metrics` - Update metrics
- `POST /api/jobs/calculate-dividends` - Recalculate dividends

### Admin (admin accounts only)
- `GET /api/admin/stats`, `POST /api/admin/stats/clear-cache` - System statistics
- `GET /api/admin/users`, `GET /api/admin/users/{userID}` - Users
- `POST /api/admin/users/{userID}/refresh-metrics`, `POST /api/admin/users/refresh-metrics-batch` - Refresh user metrics
- `POST /api/admin/users/{userID}/impersonate` - Sign in as a user
- `POST /api/admin/mfa/setup`, `/activate`, `/disable` - Admin two-factor authentication

## Error Handling

The application implements comprehensive error handling:

- **Validation Errors** - Input validation with detailed error messages
- **Business Logic Errors** - Domain-specific error handling
- **Database Errors** - Proper transaction handling and rollback
- **API Errors** - Standardized error responses with appropriate HTTP status codes

## Logging

The application uses structured logging with the following levels:

- **Debug** - Detailed debugging information
- **Info** - General application flow information
- **Warn** - Warning messages that don't stop execution
- **Error** - Error conditions that prevent normal operation

## Testing

### Backend Testing
- Go unit tests next to the code (`*_test.go` in `handlers`, `mcpserver`, `parsers`, `processors`, `security`, `services`, `utils`), run with `go test ./src/...`
- Service tests use an in-memory SQLite database

### Frontend Testing
- No test runner is configured yet; see [Testing Strategy](#3-testing-strategy)

## Deployment Architecture

### Container Architecture

The application uses a multi-container Docker architecture with the following services:

#### 1. Backend Service
- **Base Image**: Custom Go build with SQLite support
- **Environment Variables**: Configured via `.env` file
- **Volume Mounts**: Persistent database storage via named volumes
- **Health Checks**: Built-in health check endpoints
- **Restart Policy**: `unless-stopped` for production reliability
- **Concurrency**: Singleton service to maintain single writer connection to SQLite database

#### 2. Caddy Reverse Proxy
- **Purpose**: Serves frontend static files and acts as reverse proxy
- **SSL/TLS**: Automatic HTTPS certificate management via Let's Encrypt
- **Build Process**: Multi-stage build with React production build
- **Environment Variables**: API base URL passed during build time
- **Port Mapping**: 80 (HTTP) and 443 (HTTPS) to host

#### 3. Volume Management
```yaml
volumes:
  visorfinanceiro_data:    # Backend database persistence
  caddy_data:             # SSL certificates and state
```

### Docker Compose Configuration

The `docker-compose.yml` defines a production-ready setup:

```yaml
services:
  backend:
    build: ./backend
    container_name: visorfinanceiro-backend-container
    restart: unless-stopped
    env_file: .env
    volumes:
      - visorfinanceiro_data:/app/db

  caddy:
    build:
      context: .
      dockerfile: caddy/Dockerfile
      args:
        - REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}
    container_name: visorfinanceiro-caddy-container
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - caddy_data:/data
    depends_on:
      - backend

volumes:
  visorfinanceiro_data:
  caddy_data:
```

### Production Deployment

#### Environment Configuration
Create a `.env` file in the project root with production values:

```bash
# Database Configuration
DATABASE_PATH=/app/db/visorfinanceiro.db

# Security Configuration
JWT_SECRET=your-production-jwt-secret-key-here
CSRF_AUTH_KEY=your-production-csrf-auth-key-here

# Email Configuration (Production SMTP)
EMAIL_SERVICE_PROVIDER=smtp
SENDER_EMAIL=noreply@yourdomain.com
SMTP_SERVER=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password

# OAuth Configuration (Production)
GOOGLE_CLIENT_ID=your-production-google-client-id
GOOGLE_CLIENT_SECRET=your-production-google-client-secret

# Frontend Configuration
REACT_APP_API_BASE_URL=https://yourdomain.com/api

# File Upload Configuration
MAX_UPLOAD_SIZE_BYTES=10485760  # 10MB
```

#### Deployment Steps

1. **Build and Start Services**:
   ```bash
   # Build all services
   docker-compose build
   
   # Start services in detached mode
   docker-compose up -d
   ```

2. **Verify Deployment**:
   ```bash
   # Check service status
   docker-compose ps
   
   # View logs
   docker-compose logs -f
   ```

3. **Health Checks**:
   - Backend: `GET /` should return JSON response
   - Frontend: Access via configured domain
   - Database: Verify volume mounting and persistence

#### Production Considerations

##### 1. Security Hardening
- **HTTPS Only**: Caddy automatically redirects HTTP to HTTPS
- **Security Headers**: Caddy adds security headers automatically
- **Secrets Management**: Use Docker secrets or external secret management
- **Network Isolation**: Services communicate via internal Docker network

##### 2. Performance Optimization
- **Resource Limits**: Set memory and CPU limits in docker-compose
- **Caching**: Leverage Caddy's built-in caching for static assets
- **Database Optimization**: SQLite performance tuning for production load
- **CDN Integration**: Consider CDN for static assets in high-traffic scenarios

##### 3. Monitoring and Observability
- **Container Monitoring**: Use Docker stats or external monitoring tools
- **Application Logs**: Centralized logging with structured format
- **Health Checks**: Implement application-level health checks
- **Performance Metrics**: Monitor response times and error rates

##### 4. Backup and Recovery
- **Database Backups**: Regular backups of the SQLite database volume
- **Configuration Backups**: Version control for docker-compose and configuration
- **Disaster Recovery**: Documented procedures for service restoration

##### 5. Scaling Considerations
- **Vertical Scaling**: Scale the single backend instance by increasing CPU, memory, and storage resources
- **Database Scaling**: Evaluate PostgreSQL migration for high-scale scenarios
- **Caching Layer**: Redis for session storage and application caching
- **CDN Integration**: Global content delivery for static assets

### Development vs Production Differences

| Aspect | Development | Production |
|--------|-------------|------------|
| Database | Local SQLite file | Persistent volume |
| SSL/TLS | Self-signed certificates | Let's Encrypt certificates |
| Logging | Console output | Structured logging to files |
| Error Handling | Detailed error messages | User-friendly messages |
| Performance | Hot reload enabled | Optimized builds |
| Security | Relaxed CORS | Strict security headers |
| Monitoring | Basic logging | Comprehensive monitoring |

### CI/CD Integration

For automated deployments, consider the following pipeline stages:

1. **Build Stage**:
   - Frontend build optimization
   - Backend compilation and testing
   - Docker image building

2. **Test Stage**:
   - Unit tests for both frontend and backend
   - Integration tests with database
   - Security scanning of Docker images

3. **Deploy Stage**:
   - Image pushing to registry
   - Service deployment with zero downtime
   - Health check verification

4. **Post-Deploy Stage**:
   - Smoke tests
   - Performance validation
   - Monitoring setup verification

### Troubleshooting Production Issues

#### Common Production Issues

1. **Container Startup Failures**:
   ```bash
   # Check container logs
   docker-compose logs backend
   docker-compose logs caddy
   
   # Verify environment variables
   docker-compose.exec backend env | grep -E "(JWT|CSRF|DATABASE)"
   ```

2. **Database Connection Issues**:
   ```bash
   # Check volume mounting
   docker-compose exec backend ls -la /app/db/
   
   # Verify database file permissions
   docker-compose exec backend stat /app/db/visorfinanceiro.db
   ```

3. **SSL Certificate Issues**:
   ```bash
   # Check Caddy logs for certificate errors
   docker-compose logs caddy | grep -i certificate
   
   # Verify domain configuration
   docker-compose exec caddy cat /etc/caddy/Caddyfile
   ```

4. **Performance Issues**:
   ```bash
   # Monitor resource usage
   docker stats
   
   # Check application logs for slow queries
   docker-compose logs backend | grep -i "slow\|timeout"
   ```

#### Docker Volume Permissions

**UID/GID Mapping**: When the backend container restarts, ensure the SQLite database file has proper permissions. Docker volumes often mount as root, but the Go app might run as a non-root user. To prevent "Permission Denied" errors when the Go app tries to write to the .db file, configure user mapping in docker-compose.yml:

```yaml
services:
  backend:
    user: "${UID:-1000}:${GID:-1000}"  # Map to host user/group IDs
    # ... other configuration
```

Set UID and GID environment variables in your `.env` file to match your host user's IDs.

This comprehensive deployment architecture ensures reliable, secure, and scalable production deployments while maintaining development flexibility.

## Future Enhancements

### Planned Features
- **Websocket Integration** - Live price updates and portfolio valuation via websockets (`src/websocket` already broadcasts upload progress, but no route serves it and the frontend doesn't connect yet)
- **Advanced Analytics** - More sophisticated performance metrics and benchmarks
- **Mobile Application** - Native mobile apps for iOS and Android
- **Multi-currency Support** - Enhanced support for international portfolios
- **API Rate Limiting** - Protection against API abuse
- **Audit Logging** - Comprehensive audit trails for compliance

### Technical Improvements
- **Caching Layer** - Redis-based caching for improved performance
- **Microservices Architecture** - Service decomposition for scalability
- **Database Optimization** - Query optimization and indexing strategies

## Troubleshooting

### Common Issues

1. **Database Lock Errors**
   - Ensure only one process accesses the SQLite database
   - Check for proper connection handling

2. **File Upload Failures**
   - Verify file size limits and format requirements
   - Check file permissions and storage space

3. **Authentication Issues**
   - Verify JWT secret configuration
   - Check CSRF token handling
   - Ensure proper session management

4. **Price Fetching Failures**
   - Check internet connectivity
   - Verify API rate limits
   - Review caching configuration

### Debug Mode
Enable debug logging by setting `LOG_LEVEL=debug` in the environment configuration.

## Contributing

### Code Style
- Follow Go and React best practices
- Use consistent naming conventions
- Write comprehensive tests for new features
- Document significant changes

### Pull Request Process
1. Create feature branch from main
2. Implement changes with tests
3. Update documentation as needed
4. Submit pull request with detailed description
5. Address review feedback
6. Merge after approval

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For questions or support, please contact the development team or create an issue in the project repository.