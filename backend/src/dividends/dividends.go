// Package dividends holds the rules of the dividend calendar: how often a company pays, when the next
// payments should come, how long it takes from the ex-dividend date to the payment, and how much tax is
// withheld. It has no I/O, so every rule can be tested on its own.
package dividends

import (
	"math"
	"sort"
	"time"
)

// Event is one dividend as the market data reports it: the ex-dividend date and the amount per share,
// in the currency of the listing.
type Event struct {
	ExDate time.Time
	Amount float64
}

// Frequency is how often a company pays.
type Frequency string

const (
	FrequencyNone       Frequency = "none"
	FrequencyAnnual     Frequency = "annual"
	FrequencySemiannual Frequency = "semiannual"
	FrequencyQuarterly  Frequency = "quarterly"
	FrequencyMonthly    Frequency = "monthly"
	FrequencyIrregular  Frequency = "irregular"
)

// PaymentsPerYear is how many payments a regular frequency has in a year, or 0 when it isn't regular.
func (f Frequency) PaymentsPerYear() int {
	switch f {
	case FrequencyAnnual:
		return 1
	case FrequencySemiannual:
		return 2
	case FrequencyQuarterly:
		return 4
	case FrequencyMonthly:
		return 12
	}
	return 0
}

// MatchWindowDays is how far, in days, an announced ex-date can be from an estimated one and still be
// the same dividend.
const MatchWindowDays = 20

// MaxPaymentLagDays is the longest time between an ex-date and a payment that still counts as the
// payment of that ex-date.
const MaxPaymentLagDays = 60

// Day turns a time into its calendar date at midnight UTC, so dates compare by day.
func Day(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// DaysBetween is the number of calendar days from a to b (negative when b is before a).
func DaysBetween(a, b time.Time) int {
	return int(math.Round(Day(b).Sub(Day(a)).Hours() / 24))
}

// lastYear tells whether an ex-date is in the 12 months before today: [today-1y, today).
func lastYear(exDate, today time.Time) bool {
	d, t := Day(exDate), Day(today)
	return !d.Before(t.AddDate(-1, 0, 0)) && d.Before(t)
}

// FrequencyOf works out how often a company pays from the number of dividends with an ex-date in the
// last 12 months: 1, 2, 4 or 12 are regular; any other count is irregular.
func FrequencyOf(events []Event, today time.Time) Frequency {
	count := 0
	for _, e := range events {
		if e.Amount > 0 && lastYear(e.ExDate, today) {
			count++
		}
	}
	switch count {
	case 0:
		return FrequencyNone
	case 1:
		return FrequencyAnnual
	case 2:
		return FrequencySemiannual
	case 4:
		return FrequencyQuarterly
	case 12:
		return FrequencyMonthly
	}
	return FrequencyIrregular
}

// ProjectNextYear estimates the dividends of the next 12 months by moving each dividend of the last 12
// months forward by one year, keeping its amount per share. The result is sorted by ex-date.
func ProjectNextYear(events []Event, today time.Time) []Event {
	var projected []Event
	for _, e := range events {
		if e.Amount > 0 && lastYear(e.ExDate, today) {
			projected = append(projected, Event{ExDate: Day(e.ExDate).AddDate(1, 0, 0), Amount: e.Amount})
		}
	}
	sort.Slice(projected, func(i, j int) bool { return projected[i].ExDate.Before(projected[j].ExDate) })
	return projected
}

// Entry is one dividend of the calendar of a position, before it's valued in EUR.
type Entry struct {
	ExDate           time.Time
	PayDate          time.Time // Zero when unknown
	PayDateEstimated bool
	PerShare         float64
	Announced        bool // The dates were announced by the company, not estimated
	Past             bool // The ex-date has already happened (taken from the market data, not projected)
}

// Announcement is the next dividend a company has announced: its ex-date, and its payment date when known.
type Announcement struct {
	ExDate  time.Time
	PayDate time.Time // Zero when unknown
}

// MergeAnnouncement puts an announced dividend into a calendar. It replaces the entry whose ex-date is
// closest to the announced one, within MatchWindowDays; that entry keeps its amount per share. When none
// is close enough, the announcement is added as a new entry with perShareIfNew (skipped when that is 0).
// A payment date before the ex-date is ignored, since it belongs to an earlier dividend.
func MergeAnnouncement(entries []Entry, a Announcement, perShareIfNew float64) []Entry {
	exDate := Day(a.ExDate)
	payDate := time.Time{}
	if !a.PayDate.IsZero() && !Day(a.PayDate).Before(exDate) {
		payDate = Day(a.PayDate)
	}

	best, bestDistance := -1, MatchWindowDays+1
	for i, e := range entries {
		distance := DaysBetween(e.ExDate, exDate)
		if distance < 0 {
			distance = -distance
		}
		if distance < bestDistance {
			best, bestDistance = i, distance
		}
	}

	if best < 0 {
		if perShareIfNew <= 0 {
			return entries
		}
		entries = append(entries, Entry{ExDate: exDate, PerShare: perShareIfNew})
		best = len(entries) - 1
	}

	e := &entries[best]
	e.ExDate = exDate
	e.Announced = true
	if !payDate.IsZero() {
		e.PayDate = payDate
		e.PayDateEstimated = false
	}
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].ExDate.Before(entries[j].ExDate) })
	return entries
}

// PaymentLagDays is the median number of days from an ex-date to the payment, over the payments given:
// for each payment, the days since the closest ex-date on or before it, counted only when it's between
// 0 and MaxPaymentLagDays. ok is false when no payment can be matched.
func PaymentLagDays(exDates, payDates []time.Time) (days int, ok bool) {
	var lags []int
	for _, pay := range payDates {
		closest := -1
		for _, ex := range exDates {
			lag := DaysBetween(ex, pay)
			if lag >= 0 && lag <= MaxPaymentLagDays && (closest < 0 || lag < closest) {
				closest = lag
			}
		}
		if closest >= 0 {
			lags = append(lags, closest)
		}
	}
	if len(lags) == 0 {
		return 0, false
	}
	sort.Ints(lags)
	middle := len(lags) / 2
	if len(lags)%2 == 1 {
		return lags[middle], true
	}
	return int(math.Round(float64(lags[middle-1]+lags[middle]) / 2)), true
}

// Payment is a dividend received, in EUR: the gross amount and the tax withheld (as a positive number).
type Payment struct {
	Date     time.Time
	GrossEUR float64
	TaxEUR   float64
}

// WithholdingRate is the share of the gross dividends withheld as tax over the 24 months before today:
// sum of the tax / sum of the gross. ok is false when nothing was received in that period.
func WithholdingRate(payments []Payment, today time.Time) (rate float64, ok bool) {
	from := Day(today).AddDate(-2, 0, 0)
	var gross, tax float64
	for _, p := range payments {
		d := Day(p.Date)
		if d.Before(from) || d.After(Day(today)) {
			continue
		}
		gross += p.GrossEUR
		tax += math.Abs(p.TaxEUR)
	}
	if gross <= 0 {
		return 0, false
	}
	return math.Min(math.Max(tax/gross, 0), 1), true
}

// MatchPayment finds the payment of a dividend: the first payment not used yet that came on or after the
// ex-date, within MaxPaymentLagDays. It returns its index, or -1.
func MatchPayment(exDate time.Time, payments []Payment, used []bool) int {
	best := -1
	for i, p := range payments {
		if used[i] {
			continue
		}
		lag := DaysBetween(exDate, p.Date)
		if lag < 0 || lag > MaxPaymentLagDays {
			continue
		}
		if best < 0 || p.Date.Before(payments[best].Date) {
			best = i
		}
	}
	return best
}
