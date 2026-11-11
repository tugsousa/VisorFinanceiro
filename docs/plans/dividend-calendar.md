# Plan: dividend calendar

Read [README.md](README.md) first.

## Goal

Show, for each position held, when the next dividends come: the ex-dividend date, the payment date, the
amount, and whether it's announced, estimated or already received. Today the Dividends page only has totals
per month.

## What exists

- `GET /api/dividend-metrics` → `GetDividendMetrics` in `backend/src/services/upload_service.go` (around line
  110). For each current holding with a ticker (`models.GetMappingsByISINs`, table `isin_ticker_map`), it calls
  `priceService.GetLastYearDividends(ticker)` and adds `per share × quantity held now`, converted to EUR at
  today's rate, into 12 monthly buckets (`projection_by_month`, with a per-company breakdown).
- `GetLastYearDividends` (`backend/src/services/price_service.go`, around line 1339) reads Yahoo
  `v8/finance/chart/{ticker}?events=div` for the last 12 months and **groups by month of the ex-dividend date**.
  Yahoo's chart events only carry ex-dates, so the projection puts a dividend in its ex-date month, which can
  be a month before it's paid.
- `FutureProjectionChart.jsx` draws that projection on `/analytics/dividends` (`DividendsPage.jsx`, "Tudo" view).
- The user's real dividends are transactions with `transaction_type = 'DIVIDEND'` (the date is the payment
  date); withholding tax lines have `transaction_subtype = 'TAX'`.
- `FetchMetadata` already calls Yahoo `v10/finance/quoteSummary` (with the session crumb); its module
  `calendarEvents` (not requested today) has the next announced `exDividendDate` and `dividendDate`.

## What's missing

1. Dates per position (ex-date and payment date), not only monthly totals.
2. The payment month instead of the ex-date month.
3. Announced dividends (Yahoo `calendarEvents`) told apart from estimates.
4. An estimate after withholding tax, per position, from the user's own history.
5. Past events marked as received when a matching transaction exists.

## Backend

1. **Price service.** Add to the `PriceService` interface:
   - `GetDividendEvents(ticker string, from, to time.Time) ([]DividendEvent, string, error)`, returning every
     event (`ExDate time.Time`, `Amount float64` per share) and the currency. Build it from the same request as
     `GetLastYearDividends`, and turn `GetLastYearDividends` into a wrapper over it so the metrics don't change.
   - `GetAnnouncedDividend(ticker string) (*AnnouncedDividend, error)` reading `quoteSummary` with
     `modules=calendarEvents,summaryDetail`: next ex-date, payment date and `dividendRate` when present.
   - Test stubs embed the interface (`historyPriceStub{ PriceService }`), so they keep compiling.
2. **Pure rules** in a new package `backend/src/dividends` with tests:
   - Frequency from the number of events in the last 12 months (1, 2, 4, 12; anything else → irregular).
   - Next 12 months of events: each past ex-date moved forward by one year, per-share amount kept.
   - Merge the announced event: it replaces the estimated one within ±20 days of its ex-date.
   - Payment lag per ISIN: for each received dividend transaction, the days since the closest earlier
     ex-date (0–60 days); the median. Without history, no payment date (show only the ex-date) rather than
     inventing one.
   - Withholding rate per ISIN: `sum(|TAX|) / sum(gross DIVIDEND)` over the last 24 months; without history,
     no net estimate.
3. **Service** `GetDividendCalendar(userID, portfolioID)` in `src/services/dividend_calendar.go`: current
   holdings (`GetCurrentHoldingsWithValue`) × events, in EUR at today's rate (`processors.GetExchangeRate`, as the
   metrics do). Limit Yahoo calls to 5 at a time (semaphore, as in the metrics) and cache the result in
   `reportCache` for a few hours. Event fields: `isin, product_name, ex_date, pay_date (nullable),
   pay_date_estimated, per_share, currency, quantity, gross_eur, net_eur (nullable), status
   (announced | estimated | received)`. Include the last 3 months as received/missed for context.
4. `GET /api/dividends/calendar?portfolio_id=`.
5. MCP tool `get_dividend_calendar` (upcoming events, with the same fields).

## Frontend

- On `/analytics/dividends`, "Tudo" view, add a "Próximos dividendos" section under the projection: a list of
  the next 60 days (date, company, amount gross/net, a chip Anunciado / Estimado / Recebido), and a month-by-month
  view of the next 12 months (a compact grid or list per month).
- Note on the page: the amounts assume the quantity held today; the right to a dividend depends on holding the
  shares on the ex-date.

## Phase 2 (ask the user first)

Make the existing 12-month projection use the payment month (estimated with the payment lag). It changes a
chart the user already knows, so confirm before doing it.

## Tests

Frequency, forward projection, merge of announced events, payment lag median and withholding rate, all on the
pure package; a service test with a stub price service. Then the README checks, including the IRS snapshot
(the IRS page reads dividend transactions, which this must not change).
