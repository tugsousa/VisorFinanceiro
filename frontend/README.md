# VisorFinanceiro - Frontend

This is the React frontend of VisorFinanceiro. It lets users upload their broker exports and see their portfolio, analytics and tax information, using the API of the [backend](../backend/README.md).

It is built with [Vite](https://vitejs.dev/), React 18, Material-UI, TanStack Query and Chart.js. See [ARCHITECTURE_DOCUMENTATION.md](../ARCHITECTURE_DOCUMENTATION.md) for the architecture.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher (with npm).
- The backend running, by default on `http://localhost:8080`.

## Setup

```bash
cd frontend
npm install
```

The frontend reads its environment variables from the `.env` file in the project root (one folder above `frontend`). `REACT_APP_API_BASE_URL` is the backend's URL (default `http://localhost:8080`).

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Starts the development server on [http://localhost:3000](http://localhost:3000). Requests to `/api` are proxied to the backend. |
| `npm run build` | Builds the production version into `build/`. |
| `npm run serve` | Serves the production build locally to check it. |
| `npm run build:desktop` | Builds the version embedded in the desktop executable into `../backend/desktop_web` (used by `build-desktop.bat`). |

There is no test runner configured yet. Check changes with `npx eslint src` and by running the app.

## Project Structure

The code is in `src`, organized by feature:

- `features/`: one folder per area (`admin`, `analytics`, `auth`, `common`, `dashboard`, `landing`, `legal`, `portfolio`, `settings`, `tax`, `upload`), each with its own `pages/`, `components/`, `hooks/`, `api/` and `logic/` as needed.
  - `auth/AuthContext.jsx` holds the signed-in user; `portfolio/PortfolioContext.jsx` the selected portfolio.
- `components/ui/`: shared UI components.
- `layouts/Layout.jsx`: the sidebar and app bar around the pages.
- `lib/api.js`: the API client (tokens, CSRF, token refresh); `lib/theme.js`: the MUI theme; `lib/utils/`: helpers.
- `constants.js`: shared constants, such as the dashboard refresh interval.
- `App.jsx`: the routes. `index.jsx`: the entry point.

Path aliases (`features`, `lib`, `components`, `layouts`, `constants`) are defined in `vite.config.js`.
