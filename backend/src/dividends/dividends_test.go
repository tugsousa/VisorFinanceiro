package dividends

import (
	"math"
	"testing"
	"time"
)

func date(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

var today = date("2026-11-11")

func TestFrequencyOf(t *testing.T) {
	quarterly := []Event{
		{date("2025-11-20"), 0.5}, {date("2026-02-20"), 0.5}, {date("2026-05-20"), 0.5}, {date("2026-08-20"), 0.5},
		{date("2025-08-20"), 0.5}, // More than a year ago: not counted
	}
	cases := []struct {
		name   string
		events []Event
		want   Frequency
	}{
		{"none", nil, FrequencyNone},
		{"annual", []Event{{date("2026-05-01"), 1}}, FrequencyAnnual},
		{"semiannual", []Event{{date("2026-05-01"), 1}, {date("2025-11-12"), 1}}, FrequencySemiannual},
		{"quarterly", quarterly, FrequencyQuarterly},
		{"three is irregular", quarterly[1:4], FrequencyIrregular},
		{"today is not in the last year", []Event{{today, 1}}, FrequencyNone},
		{"zero amounts are ignored", []Event{{date("2026-05-01"), 0}}, FrequencyNone},
	}
	for _, c := range cases {
		if got := FrequencyOf(c.events, today); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}

	var monthly []Event
	for m := 0; m < 12; m++ {
		monthly = append(monthly, Event{date("2025-11-15").AddDate(0, m, 0), 0.1})
	}
	if got := FrequencyOf(monthly, today); got != FrequencyMonthly || got.PaymentsPerYear() != 12 {
		t.Errorf("monthly: got %s (%d a year)", got, got.PaymentsPerYear())
	}
}

func TestProjectNextYear(t *testing.T) {
	events := []Event{
		{date("2026-08-20"), 0.6},
		{date("2025-11-20"), 0.5},
		{date("2025-11-10"), 0.4}, // A year and a day ago: out
		{date("2026-11-11"), 0.7}, // Today: not yet in the last 12 months
	}
	got := ProjectNextYear(events, today)
	if len(got) != 2 {
		t.Fatalf("got %+v, want 2 events", got)
	}
	if !got[0].ExDate.Equal(date("2026-11-20")) || got[0].Amount != 0.5 {
		t.Errorf("first = %+v, want 20-11-2026 at 0.5", got[0])
	}
	if !got[1].ExDate.Equal(date("2027-08-20")) || got[1].Amount != 0.6 {
		t.Errorf("second = %+v, want 20-08-2027 at 0.6", got[1])
	}
}

func TestMergeAnnouncement(t *testing.T) {
	estimated := func() []Entry {
		return []Entry{
			{ExDate: date("2026-11-20"), PayDate: date("2026-12-10"), PayDateEstimated: true, PerShare: 0.5},
			{ExDate: date("2027-02-20"), PerShare: 0.5},
		}
	}

	// Within 20 days: replaces the closest estimate, keeps its amount, takes the announced dates.
	got := MergeAnnouncement(estimated(), Announcement{ExDate: date("2026-11-14"), PayDate: date("2026-12-01")}, 9)
	if len(got) != 2 {
		t.Fatalf("got %d entries, want 2", len(got))
	}
	first := got[0]
	if !first.Announced || !first.ExDate.Equal(date("2026-11-14")) || !first.PayDate.Equal(date("2026-12-01")) ||
		first.PayDateEstimated || first.PerShare != 0.5 {
		t.Errorf("merged = %+v", first)
	}
	if got[1].Announced {
		t.Errorf("the other estimate must stay estimated: %+v", got[1])
	}

	// A payment date before the ex-date is an older payment: the estimated one stays.
	got = MergeAnnouncement(estimated(), Announcement{ExDate: date("2026-11-14"), PayDate: date("2026-09-01")}, 0)
	if !got[0].PayDate.Equal(date("2026-12-10")) || !got[0].PayDateEstimated {
		t.Errorf("stale payment date was used: %+v", got[0])
	}

	// More than 20 days from every estimate: added as a new entry, in date order.
	got = MergeAnnouncement(estimated(), Announcement{ExDate: date("2027-01-15")}, 0.55)
	if len(got) != 3 || !got[1].Announced || got[1].PerShare != 0.55 || !got[1].PayDate.IsZero() {
		t.Errorf("new announcement = %+v", got)
	}

	// Without an amount for a new entry, nothing is added.
	got = MergeAnnouncement(estimated(), Announcement{ExDate: date("2027-01-15")}, 0)
	if len(got) != 2 {
		t.Errorf("expected nothing added, got %+v", got)
	}

	// Exactly 21 days away doesn't match.
	got = MergeAnnouncement([]Entry{{ExDate: date("2026-12-01"), PerShare: 1}}, Announcement{ExDate: date("2026-12-22")}, 1)
	if len(got) != 2 {
		t.Errorf("21 days away should not match: %+v", got)
	}
}

func TestPaymentLagDays(t *testing.T) {
	exDates := []time.Time{date("2025-02-10"), date("2025-05-10"), date("2025-08-10"), date("2025-11-10")}
	payDates := []time.Time{
		date("2025-03-01"), // 19 days
		date("2025-05-30"), // 20 days
		date("2025-09-05"), // 26 days
		date("2024-12-01"), // No ex-date before it: ignored
		date("2025-01-25"), // No ex-date before it either: ignored
	}
	days, ok := PaymentLagDays(exDates, payDates)
	if !ok || days != 20 {
		t.Errorf("median lag = %d (%v), want 20", days, ok)
	}

	// Even count: the mean of the two middle values, rounded.
	days, ok = PaymentLagDays(exDates, payDates[:2])
	if !ok || days != 20 { // (19+20)/2 = 19.5 → 20
		t.Errorf("even median = %d, want 20", days)
	}

	// The closest earlier ex-date is used, not an older one.
	days, _ = PaymentLagDays([]time.Time{date("2025-01-01"), date("2025-01-20")}, []time.Time{date("2025-01-25")})
	if days != 5 {
		t.Errorf("lag = %d, want 5", days)
	}

	if _, ok := PaymentLagDays(exDates, nil); ok {
		t.Error("no payments must give no lag")
	}
}

func TestWithholdingRate(t *testing.T) {
	payments := []Payment{
		{date("2026-03-01"), 100, -15},
		{date("2025-06-01"), 100, 15},
		{date("2024-11-10"), 1000, 0}, // More than 24 months ago: out
	}
	rate, ok := WithholdingRate(payments, today)
	if !ok || math.Abs(rate-0.15) > 1e-9 {
		t.Errorf("rate = %v (%v), want 0.15", rate, ok)
	}
	if _, ok := WithholdingRate(nil, today); ok {
		t.Error("no payments must give no rate")
	}
}

func TestMatchPayment(t *testing.T) {
	payments := []Payment{
		{Date: date("2026-09-15"), GrossEUR: 10},
		{Date: date("2026-09-05"), GrossEUR: 10},
		{Date: date("2026-12-30"), GrossEUR: 10},
	}
	used := make([]bool, len(payments))
	if i := MatchPayment(date("2026-08-20"), payments, used); i != 1 {
		t.Errorf("match = %d, want the earliest payment after the ex-date (1)", i)
	}
	used[1] = true
	if i := MatchPayment(date("2026-08-20"), payments, used); i != 0 {
		t.Errorf("match = %d, want 0 once 1 is used", i)
	}
	if i := MatchPayment(date("2026-10-20"), payments, used); i != -1 {
		t.Errorf("match = %d, want none (71 days later)", i)
	}
}
