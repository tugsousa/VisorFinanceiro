package services

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/dividends"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/utils"
)

const (
	ckDividendCalendar  = "dividend_calendar_user_%d_pf_%d"
	dividendCalendarTTL = 4 * time.Hour

	// dividendCalendarPastMonths is how far back the calendar shows dividends already gone ex, for context.
	dividendCalendarPastMonths = 3
	// dividendHistoryMonths is how much dividend history is read: 24 months of payments to learn the
	// payment lag from, plus the ex-dates just before them.
	dividendHistoryMonths = 26
)

// Statuses of a dividend in the calendar.
const (
	DividendStatusAnnounced = "announced" // Dates announced by the company, or ex-date passed and payment still to come
	DividendStatusEstimated = "estimated" // Last year's dividend moved forward by one year
	DividendStatusReceived  = "received"  // A matching dividend transaction exists
	DividendStatusMissed    = "missed"    // Ex-date and expected payment passed with no matching transaction
)

// Reasons a position held is left out of the calendar.
const (
	DividendSkipNoTicker       = "no_ticker"
	DividendSkipMarketData     = "market_data_error"
	DividendSkipNoExchangeRate = "no_exchange_rate"
)

// DividendCalendarEvent is one dividend of a position held. The amounts assume the quantity held today,
// except for a received dividend, whose amounts are those of the transactions.
type DividendCalendarEvent struct {
	ISIN             string   `json:"isin"`
	Ticker           string   `json:"ticker"`
	ProductName      string   `json:"product_name"`
	ExDate           string   `json:"ex_date"`
	PayDate          *string  `json:"pay_date"`
	PayDateEstimated bool     `json:"pay_date_estimated"`
	PerShare         float64  `json:"per_share"`
	Currency         string   `json:"currency"`
	Quantity         float64  `json:"quantity"`
	GrossEUR         float64  `json:"gross_eur"`
	NetEUR           *float64 `json:"net_eur"`
	Status           string   `json:"status"`
	Frequency        string   `json:"frequency"`
}

// DividendCalendarSkipped is a position left out of the calendar, and why.
type DividendCalendarSkipped struct {
	ISIN        string `json:"isin"`
	ProductName string `json:"product_name"`
	Reason      string `json:"reason"`
}

// DividendCalendar is the dividends of the positions held: the last 3 months and the next 12.
type DividendCalendar struct {
	Today                string                    `json:"today"`
	From                 string                    `json:"from"`
	To                   string                    `json:"to"`
	Events               []DividendCalendarEvent   `json:"events"`
	Next12MonthsGrossEUR float64                   `json:"next_12_months_gross_eur"` // Announced and estimated, still to be paid
	Skipped              []DividendCalendarSkipped `json:"skipped"`
}

// GetDividendCalendar builds the dividend calendar of the positions held today.
func (s *uploadServiceImpl) GetDividendCalendar(userID int64, portfolioID int64) (*DividendCalendar, error) {
	cacheKey := fmt.Sprintf(ckDividendCalendar, userID, portfolioID)
	if cached, found := s.reportCache.Get(cacheKey); found {
		return cached.(*DividendCalendar), nil
	}

	holdings, err := s.GetCurrentHoldingsWithValue(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	divTxs, err := s.GetDividendTransactions(userID, portfolioID)
	if err != nil {
		return nil, err
	}

	isins := make([]string, 0, len(holdings))
	for _, h := range holdings {
		isins = append(isins, h.ISIN)
	}
	mappings, err := models.GetMappingsByISINs(database.DB, isins)
	if err != nil {
		return nil, fmt.Errorf("failed to read the tickers: %w", err)
	}
	tickers := make(map[string]string, len(mappings))
	for isin, m := range mappings {
		tickers[isin] = m.TickerSymbol
	}

	now := time.Now()
	exchangeRate := func(currency string) (float64, error) {
		if currency == "" || currency == "EUR" {
			return 1, nil
		}
		return processors.GetExchangeRate(currency, now)
	}

	calendar := buildDividendCalendar(holdings, tickers, divTxs, s.priceService, exchangeRate, today())
	s.reportCache.Set(cacheKey, calendar, dividendCalendarTTL)
	return calendar, nil
}

// buildDividendCalendar does the work of GetDividendCalendar on data already read, so it can be tested
// with a stub price service. exchangeRate gives the units of a currency per EUR.
func buildDividendCalendar(
	holdings []models.HoldingWithValue,
	tickers map[string]string,
	divTxs []models.ProcessedTransaction,
	prices PriceService,
	exchangeRate func(currency string) (float64, error),
	today time.Time,
) *DividendCalendar {
	from := today.AddDate(0, -dividendCalendarPastMonths, 0)
	to := today.AddDate(1, 0, 0)
	calendar := &DividendCalendar{
		Today:   today.Format(utils.DefaultDateFormat),
		From:    from.Format(utils.DefaultDateFormat),
		To:      to.AddDate(0, 0, -1).Format(utils.DefaultDateFormat),
		Events:  []DividendCalendarEvent{},
		Skipped: []DividendCalendarSkipped{},
	}

	payments := paymentsByISIN(divTxs)

	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 5) // At most 5 Yahoo calls at a time, as in GetDividendMetrics

	skip := func(h models.HoldingWithValue, reason string) {
		mu.Lock()
		calendar.Skipped = append(calendar.Skipped, DividendCalendarSkipped{ISIN: h.ISIN, ProductName: h.ProductName, Reason: reason})
		mu.Unlock()
	}

	for _, h := range holdings {
		if h.Quantity <= 0 {
			continue
		}
		ticker := tickers[h.ISIN]
		if ticker == "" {
			skip(h, DividendSkipNoTicker)
			continue
		}

		wg.Add(1)
		go func(h models.HoldingWithValue, ticker string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			history, currency, err := prices.GetDividendEvents(ticker, today.AddDate(0, -dividendHistoryMonths, 0), time.Now())
			if err != nil {
				logger.L.Warn("Failed to get dividend events", "ticker", ticker, "error", err)
				skip(h, DividendSkipMarketData)
				return
			}
			if len(history) == 0 {
				return // Doesn't pay dividends (or none in the last two years)
			}

			rate, err := exchangeRate(currency)
			if err != nil || rate <= 0 {
				logger.L.Warn("Skipping dividend calendar without an exchange rate", "ticker", ticker, "currency", currency, "error", err)
				skip(h, DividendSkipNoExchangeRate)
				return
			}

			announced, err := prices.GetAnnouncedDividend(ticker)
			if err != nil {
				logger.L.Warn("Failed to get the announced dividend; using estimates only", "ticker", ticker, "error", err)
				announced = nil
			}

			events := positionDividendEvents(h, ticker, currency, rate, history, announced, payments[h.ISIN], today)
			mu.Lock()
			calendar.Events = append(calendar.Events, events...)
			mu.Unlock()
		}(h, ticker)
	}
	wg.Wait()

	// Still to come: every announced or estimated dividend, including one already gone ex but not paid yet.
	for _, e := range calendar.Events {
		if e.Status == DividendStatusAnnounced || e.Status == DividendStatusEstimated {
			calendar.Next12MonthsGrossEUR += e.GrossEUR
		}
	}
	sort.SliceStable(calendar.Events, func(i, j int) bool {
		a, b := utils.ParseDate(calendar.Events[i].ExDate), utils.ParseDate(calendar.Events[j].ExDate)
		if !a.Equal(b) {
			return a.Before(b)
		}
		return calendar.Events[i].ProductName < calendar.Events[j].ProductName
	})
	sort.Slice(calendar.Skipped, func(i, j int) bool { return calendar.Skipped[i].ProductName < calendar.Skipped[j].ProductName })
	return calendar
}

// paymentsByISIN groups the dividend transactions by ISIN and date: the gross amount and the tax withheld
// that day. Sorted by date.
func paymentsByISIN(divTxs []models.ProcessedTransaction) map[string][]dividends.Payment {
	type key struct{ isin, date string }
	groups := make(map[key]*dividends.Payment)
	for _, tx := range divTxs {
		if tx.TransactionType != "DIVIDEND" || tx.ISIN == "" {
			continue
		}
		date, err := time.Parse(utils.DefaultDateFormat, tx.Date)
		if err != nil {
			continue
		}
		k := key{tx.ISIN, tx.Date}
		p, ok := groups[k]
		if !ok {
			p = &dividends.Payment{Date: date}
			groups[k] = p
		}
		if tx.TransactionSubType == "TAX" {
			if tx.AmountEUR < 0 {
				p.TaxEUR -= tx.AmountEUR
			} else {
				p.TaxEUR += tx.AmountEUR
			}
		} else {
			p.GrossEUR += tx.AmountEUR
		}
	}
	result := make(map[string][]dividends.Payment)
	for k, p := range groups {
		result[k.isin] = append(result[k.isin], *p)
	}
	for isin := range result {
		list := result[isin]
		sort.Slice(list, func(i, j int) bool { return list[i].Date.Before(list[j].Date) })
	}
	return result
}

// positionDividendEvents builds the calendar of one position from its dividend history, its announced
// dividend and the dividends received. rate is the units of currency per EUR.
func positionDividendEvents(
	h models.HoldingWithValue,
	ticker, currency string,
	rate float64,
	history []DividendEvent,
	announced *AnnouncedDividend,
	payments []dividends.Payment,
	today time.Time,
) []DividendCalendarEvent {
	from := today.AddDate(0, -dividendCalendarPastMonths, 0)
	to := today.AddDate(1, 0, 0)
	frequency := dividends.FrequencyOf(history, today)

	// Payments that are really dividends (not a lone tax line), matched to the ex-dates in order, over the
	// whole history, so a payment of an older ex-date isn't taken by a newer one.
	var received []dividends.Payment
	for _, p := range payments {
		if p.GrossEUR > 0 {
			received = append(received, p)
		}
	}
	used := make([]bool, len(received))
	paymentOf := make(map[time.Time]int)
	for _, e := range history {
		exDate := dividends.Day(e.ExDate)
		if !exDate.Before(today) {
			continue
		}
		if i := dividends.MatchPayment(exDate, received, used); i >= 0 {
			used[i] = true
			paymentOf[exDate] = i
		}
	}

	// The calendar: the last months as they happened, then last year moved forward by one year.
	var entries []dividends.Entry
	for _, e := range history {
		exDate := dividends.Day(e.ExDate)
		if !exDate.Before(from) && exDate.Before(today) {
			entries = append(entries, dividends.Entry{ExDate: exDate, PerShare: e.Amount})
		}
	}
	for _, e := range dividends.ProjectNextYear(history, today) {
		entries = append(entries, dividends.Entry{ExDate: e.ExDate, PerShare: e.Amount})
	}

	if announced != nil {
		exDate := dividends.Day(announced.ExDate)
		if !exDate.Before(from) && exDate.Before(to) {
			perShareIfNew := history[len(history)-1].Amount
			if n := frequency.PaymentsPerYear(); n > 0 && announced.DividendRate > 0 &&
				(announced.Currency == "" || announced.Currency == currency) {
				perShareIfNew = announced.DividendRate / float64(n)
			}
			entries = dividends.MergeAnnouncement(entries, dividends.Announcement{
				ExDate:  announced.ExDate,
				PayDate: announced.PayDate,
			}, perShareIfNew)
		}
	}

	// Payment dates: from the user's own history when there is one; otherwise none.
	exDates := make([]time.Time, len(history))
	for i, e := range history {
		exDates[i] = e.ExDate
	}
	payDates := make([]time.Time, len(received))
	for i, p := range received {
		payDates[i] = p.Date
	}
	lag, hasLag := dividends.PaymentLagDays(exDates, payDates)
	if !hasLag {
		lag, hasLag = announcedPaymentLag(announced)
	}
	withholding, hasWithholding := dividends.WithholdingRate(payments, today)

	name := h.ProductName
	if name == "" {
		name = ticker
	}

	var events []DividendCalendarEvent
	for _, entry := range entries {
		if entry.PayDate.IsZero() && hasLag {
			entry.PayDate = entry.ExDate.AddDate(0, 0, lag)
			entry.PayDateEstimated = true
		}
		event := DividendCalendarEvent{
			ISIN:             h.ISIN,
			Ticker:           ticker,
			ProductName:      name,
			ExDate:           entry.ExDate.Format(utils.DefaultDateFormat),
			PayDateEstimated: entry.PayDateEstimated,
			PerShare:         entry.PerShare,
			Currency:         currency,
			Quantity:         h.Quantity,
			GrossEUR:         entry.PerShare * h.Quantity / rate,
			Frequency:        string(frequency),
		}
		if hasWithholding {
			net := event.GrossEUR * (1 - withholding)
			event.NetEUR = &net
		}

		past := entry.ExDate.Before(today)
		switch {
		case past && hasPayment(paymentOf, entry.ExDate):
			p := received[paymentOf[entry.ExDate]]
			entry.PayDate = p.Date
			event.PayDateEstimated = false
			event.GrossEUR = p.GrossEUR
			net := p.GrossEUR - p.TaxEUR
			event.NetEUR = &net
			event.Status = DividendStatusReceived
		case past && paymentStillToCome(entry, today):
			event.Status = DividendStatusAnnounced
		case past:
			event.Status = DividendStatusMissed
		case entry.Announced:
			event.Status = DividendStatusAnnounced
		default:
			event.Status = DividendStatusEstimated
		}
		if !entry.PayDate.IsZero() {
			payDate := entry.PayDate.Format(utils.DefaultDateFormat)
			event.PayDate = &payDate
		}
		events = append(events, event)
	}
	return events
}

// announcedPaymentLag is the days from the announced ex-date to the announced payment, used to estimate the
// payment dates of a position the user has never been paid by yet. ok is false without a usable pair: no
// payment date, or a payment before the ex-date or later than MaxPaymentLagDays after it.
func announcedPaymentLag(announced *AnnouncedDividend) (days int, ok bool) {
	if announced == nil || announced.PayDate.IsZero() {
		return 0, false
	}
	lag := dividends.DaysBetween(dividends.Day(announced.ExDate), dividends.Day(announced.PayDate))
	if lag < 0 || lag > dividends.MaxPaymentLagDays {
		return 0, false
	}
	return lag, true
}

func hasPayment(paymentOf map[time.Time]int, exDate time.Time) bool {
	_, ok := paymentOf[exDate]
	return ok
}

// paymentStillToCome tells whether a dividend already gone ex may still be paid: its payment date hasn't
// passed or, without one, the ex-date is recent enough.
func paymentStillToCome(entry dividends.Entry, today time.Time) bool {
	if !entry.PayDate.IsZero() {
		return !entry.PayDate.Before(today)
	}
	return dividends.DaysBetween(entry.ExDate, today) <= dividends.MaxPaymentLagDays
}
