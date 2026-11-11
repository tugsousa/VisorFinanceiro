package services

import (
	"errors"
	"math"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
)

// calendarPriceStub answers the dividend calls from fixed data.
type calendarPriceStub struct {
	PriceService
	events    map[string][]DividendEvent
	currency  map[string]string
	announced map[string]*AnnouncedDividend
}

func (s calendarPriceStub) GetDividendEvents(ticker string, from, to time.Time) ([]DividendEvent, string, error) {
	if ticker == "ERR" {
		return nil, "", errors.New("yahoo is down")
	}
	return s.events[ticker], s.currency[ticker], nil
}

func (s calendarPriceStub) GetAnnouncedDividend(ticker string) (*AnnouncedDividend, error) {
	return s.announced[ticker], nil
}

func d(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func dividendTx(date, isin, subtype string, amountEUR float64) models.ProcessedTransaction {
	return models.ProcessedTransaction{Date: date, ISIN: isin, TransactionType: "DIVIDEND", TransactionSubType: subtype, AmountEUR: amountEUR}
}

func TestBuildDividendCalendar(t *testing.T) {
	logger.InitLogger("error")
	today := d("2026-11-11")

	// X pays 0.50 USD a quarter, 20 days after the ex-date; 15% is withheld.
	var xEvents []DividendEvent
	var txs []models.ProcessedTransaction
	for _, ex := range []string{"2025-02-14", "2025-05-15", "2025-08-14", "2025-11-14", "2026-02-13", "2026-05-15", "2026-08-14"} {
		exDate := d(ex)
		xEvents = append(xEvents, DividendEvent{ExDate: exDate.Add(14 * time.Hour), Amount: 0.5})
		pay := exDate.AddDate(0, 0, 20).Format("02-01-2006")
		txs = append(txs, dividendTx(pay, "X", "", 8), dividendTx(pay, "X", "TAX", -1.2))
	}

	prices := calendarPriceStub{
		events: map[string][]DividendEvent{
			"X.US": xEvents,
			"W.AS": {{ExDate: d("2026-10-01"), Amount: 1}}, // Gone ex 41 days ago, never paid: still to come
			"V.AS": {{ExDate: d("2026-08-20"), Amount: 2}}, // Gone ex 83 days ago, never paid: missed
			"ACC":  nil,                                    // Accumulating fund: no dividends
		},
		currency: map[string]string{"X.US": "USD", "W.AS": "EUR", "V.AS": "EUR"},
		announced: map[string]*AnnouncedDividend{
			"X.US": {ExDate: d("2026-11-13"), PayDate: d("2026-12-01"), DividendRate: 2.2, Currency: "USD"},
		},
	}
	holdings := []models.HoldingWithValue{
		{ISIN: "X", ProductName: "X Corp", Quantity: 20},
		{ISIN: "W", ProductName: "W NV", Quantity: 10},
		{ISIN: "V", ProductName: "V NV", Quantity: 5},
		{ISIN: "ACC", ProductName: "Acc ETF", Quantity: 3},
		{ISIN: "NOTICKER", ProductName: "No Ticker", Quantity: 1},
		{ISIN: "BROKEN", ProductName: "Broken", Quantity: 1},
		{ISIN: "SOLD", ProductName: "Sold", Quantity: 0},
	}
	tickers := map[string]string{"X": "X.US", "W": "W.AS", "V": "V.AS", "ACC": "ACC", "BROKEN": "ERR", "SOLD": "X.US"}
	rate := func(currency string) (float64, error) {
		if currency == "USD" {
			return 1.25, nil
		}
		return 1, nil
	}

	cal := buildDividendCalendar(holdings, tickers, txs, prices, rate, today)

	type want struct {
		isin, exDate, payDate, status string
		payEstimated                  bool
		gross                         float64
		net                           *float64
	}
	f := func(v float64) *float64 { return &v }
	wants := []want{
		{"X", "14-08-2026", "03-09-2026", DividendStatusReceived, false, 8, f(6.8)},
		{"V", "20-08-2026", "", DividendStatusMissed, false, 10, nil},
		{"W", "01-10-2026", "", DividendStatusAnnounced, false, 10, nil},
		{"X", "13-11-2026", "01-12-2026", DividendStatusAnnounced, false, 8, f(6.8)},
		{"X", "13-02-2027", "05-03-2027", DividendStatusEstimated, true, 8, f(6.8)},
		{"X", "15-05-2027", "04-06-2027", DividendStatusEstimated, true, 8, f(6.8)},
		{"X", "14-08-2027", "03-09-2027", DividendStatusEstimated, true, 8, f(6.8)},
		{"V", "20-08-2027", "", DividendStatusEstimated, false, 10, nil},
		{"W", "01-10-2027", "", DividendStatusEstimated, false, 10, nil},
	}
	if len(cal.Events) != len(wants) {
		for _, e := range cal.Events {
			t.Logf("%+v", e)
		}
		t.Fatalf("got %d events, want %d", len(cal.Events), len(wants))
	}
	for i, w := range wants {
		e := cal.Events[i]
		payDate := ""
		if e.PayDate != nil {
			payDate = *e.PayDate
		}
		if e.ISIN != w.isin || e.ExDate != w.exDate || payDate != w.payDate || e.Status != w.status ||
			e.PayDateEstimated != w.payEstimated || math.Abs(e.GrossEUR-w.gross) > 1e-9 {
			t.Errorf("event %d = %+v (pay %q), want %+v", i, e, payDate, w)
		}
		switch {
		case w.net == nil && e.NetEUR != nil:
			t.Errorf("event %d: net = %v, want none", i, *e.NetEUR)
		case w.net != nil && (e.NetEUR == nil || math.Abs(*e.NetEUR-*w.net) > 1e-9):
			t.Errorf("event %d: net = %v, want %v", i, e.NetEUR, *w.net)
		}
	}
	if cal.Events[0].Frequency != "quarterly" {
		t.Errorf("X frequency = %s, want quarterly", cal.Events[0].Frequency)
	}

	// Still to come: X's 4 dividends, V's and W's next ones, and W's one gone ex but not paid yet.
	if math.Abs(cal.Next12MonthsGrossEUR-62) > 1e-9 {
		t.Errorf("next 12 months = %v, want 62", cal.Next12MonthsGrossEUR)
	}

	if len(cal.Skipped) != 2 ||
		cal.Skipped[0].ISIN != "BROKEN" || cal.Skipped[0].Reason != DividendSkipMarketData ||
		cal.Skipped[1].ISIN != "NOTICKER" || cal.Skipped[1].Reason != DividendSkipNoTicker {
		t.Errorf("skipped = %+v", cal.Skipped)
	}
}

func TestBuildDividendCalendar_NoExchangeRate(t *testing.T) {
	logger.InitLogger("error")
	prices := calendarPriceStub{
		events:   map[string][]DividendEvent{"Y": {{ExDate: d("2026-06-01"), Amount: 1}}},
		currency: map[string]string{"Y": "XYZ"},
	}
	rate := func(string) (float64, error) { return 0, errors.New("unknown currency") }
	cal := buildDividendCalendar([]models.HoldingWithValue{{ISIN: "Y", ProductName: "Y", Quantity: 1}},
		map[string]string{"Y": "Y"}, nil, prices, rate, d("2026-11-11"))
	if len(cal.Events) != 0 || len(cal.Skipped) != 1 || cal.Skipped[0].Reason != DividendSkipNoExchangeRate {
		t.Errorf("calendar = %+v", cal)
	}
}
