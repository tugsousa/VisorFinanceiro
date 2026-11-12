package networth

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"
)

// Certificados de Aforro, series D, E and F. A subscription earns interest every three months, counted from
// its subscription date, at the series' base rate of the month the quarter starts plus a permanence bonus
// that grows with the years held; the interest is added to the capital net of the tax withheld. Nothing
// accrues inside a quarter (a redemption pays only the interest already capitalised), so the value is a step
// that changes on the capitalisation dates only.
//
// The base rates the State publishes are data (AforroRates), and the official ones known to the app start in
// December 2024. So a certificate isn't valued from its subscription: the estimate starts from a value the
// user read on AforroNet and applies only the capitalisations after it. It's an estimate, shown next to the
// value the user typed, which is what the net worth counts.
//
// Not confirmed by an official source, and stated to the user: the interest of a quarter as a quarter of the
// annual rate (IGCP says so for series B), the 28% withheld, and the rounding AforroNet applies.

// Kinds of base rate, by where the figure comes from.
const (
	AforroRateOfficial   = "official"    // read on a page or table of IGCP
	AforroRateDerived    = "derived"     // worked out from an official figure of another series
	AforroRateThirdParty = "third_party" // from a news site only
)

// AforroBonus is the permanence bonus, in percentage points, from one year of permanence to another.
type AforroBonus struct {
	FromYear int     `json:"from_year"`
	ToYear   int     `json:"to_year"`
	PP       float64 `json:"pp"`
}

// AforroRate is a series' gross annual base rate of a month, in %.
type AforroRate struct {
	Rate   float64 `json:"rate"`
	Kind   string  `json:"kind"`
	Source string  `json:"source,omitempty"`
}

// AforroSeries holds the rules and the base rates of one series.
type AforroSeries struct {
	Name      string        `json:"name"`
	TermYears int           `json:"term_years"`
	From      string        `json:"from"` // first subscription date, YYYY-MM-DD
	To        string        `json:"to"`   // last subscription date; empty while the series is open
	Bonus     []AforroBonus `json:"bonus"`
	// BaseRates is the base rate of each month, by YYYY-MM. A month that isn't here has no known rate.
	BaseRates map[string]AforroRate `json:"base_rates"`
}

// AforroRates are the rules and rates of every series the app can estimate, by series letter.
type AforroRates struct {
	Series map[string]AforroSeries `json:"series"`
}

// SeriesOn returns the letter of the series a subscription made on a date belongs to, or "" when it's of a
// series the app doesn't know.
func (r AforroRates) SeriesOn(subscribed time.Time) string {
	day := dayOf(subscribed).Format(DateLayout)
	letters := make([]string, 0, len(r.Series))
	for letter := range r.Series {
		letters = append(letters, letter)
	}
	sort.Strings(letters)
	for _, letter := range letters {
		s := r.Series[letter]
		if day >= s.From && (s.To == "" || day <= s.To) {
			return letter
		}
	}
	return ""
}

// RatesThrough is the last month with a base rate of the series, as YYYY-MM, or "".
func (s AforroSeries) RatesThrough() string {
	last := ""
	for month := range s.BaseRates {
		if month > last {
			last = month
		}
	}
	return last
}

// RatesFrom is the first month with a base rate of the series, as YYYY-MM, or "". No official monthly rate
// was found before it, so a quarter that starts earlier can't be estimated.
func (s AforroSeries) RatesFrom() string {
	first := ""
	for month := range s.BaseRates {
		if first == "" || month < first {
			first = month
		}
	}
	return first
}

// bonusOn is the permanence bonus in a year of permanence (1 is the first year).
func (s AforroSeries) bonusOn(year int) float64 {
	for _, b := range s.Bonus {
		if year >= b.FromYear && year <= b.ToYear {
			return b.PP
		}
	}
	return 0
}

// AforroCapitalisationDate is the day the k-th quarter of a subscription ends and its interest is added: the
// subscription's day of the month, 3k months later, or the 1st of the following month when that month has no
// such day. (Unlike a term deposit, which goes to the last day of the shorter month.) k = 0 is the
// subscription date.
func AforroCapitalisationDate(subscribed time.Time, k int) time.Time {
	subscribed = dayOf(subscribed)
	first := time.Date(subscribed.Year(), subscribed.Month()+time.Month(3*k), 1, 0, 0, 0, 0, time.UTC)
	lastDay := first.AddDate(0, 1, -1).Day()
	if subscribed.Day() > lastDay {
		return first.AddDate(0, 1, 0)
	}
	return time.Date(first.Year(), first.Month(), subscribed.Day(), 0, 0, 0, 0, time.UTC)
}

// AforroQuarterRate is the gross annual rate of a subscription's k-th quarter (k from 1): the base rate of the
// month the quarter starts in, plus the bonus of the year of permanence the quarter starts in. The last
// result is false when the base rate of that month isn't known.
//
// A subscription made on the 29th, 30th or 31st starts some quarters on the 1st of the following month. The
// rules don't say which of the two months' rates then applies, so the rate counts as known only when both
// months have the same one.
func (s AforroSeries) AforroQuarterRate(subscribed time.Time, k int) (base AforroRate, bonusPP float64, ok bool) {
	start := AforroCapitalisationDate(subscribed, k-1)
	base, ok = s.BaseRates[start.Format("2006-01")]
	if ok && start.Day() != dayOf(subscribed).Day() {
		before, known := s.BaseRates[start.AddDate(0, 0, -1).Format("2006-01")]
		ok = known && before.Rate == base.Rate
	}
	return base, s.bonusOn(1 + (k-1)/4), ok
}

// AforroCapitalisation is one quarter's interest added to a certificate.
type AforroCapitalisation struct {
	Date        string  `json:"date"` // YYYY-MM-DD
	BaseRatePct float64 `json:"base_rate_pct"`
	BonusPP     float64 `json:"bonus_pp"`
	RatePct     float64 `json:"rate_pct"` // gross annual rate of the quarter: base + bonus
	RateKind    string  `json:"rate_kind"`
	InterestEUR float64 `json:"interest_eur"` // net of the tax withheld
	ValueEUR    float64 `json:"value_eur"`    // the value after it
}

// Reasons why an estimate stops before the date asked.
const (
	AforroStoppedNoRate  = "no_rate" // the base rate of a quarter isn't in the data
	AforroStoppedMatured = "matured" // the certificate reached its term: it earns nothing more
)

// AforroEstimate is what a certificate is estimated to be worth on a date, starting from a value read on
// AforroNet.
type AforroEstimate struct {
	Series       string  `json:"series"`
	ValueEUR     float64 `json:"value_eur"`
	FromDate     string  `json:"from_date"` // the date of the value it starts from
	FromValueEUR float64 `json:"from_value_eur"`
	// Capitalisations are the quarters applied since FromDate, oldest first.
	Capitalisations []AforroCapitalisation `json:"capitalisations"`
	// NextCapitalisation is the next day the value changes; empty once the certificate has matured.
	NextCapitalisation string `json:"next_capitalisation,omitempty"`
	MaturityDate       string `json:"maturity_date"`
	// Stopped says why the estimate doesn't reach the date asked (see the AforroStopped constants), and
	// StoppedOn the capitalisation it couldn't apply. With "no_rate" the value is the one before that day.
	Stopped   string `json:"stopped,omitempty"`
	StoppedOn string `json:"stopped_on,omitempty"`
	// RatesFrom and RatesThrough are the first and last months the data has a base rate for, as YYYY-MM.
	RatesFrom    string `json:"rates_from"`
	RatesThrough string `json:"rates_through"`
	// UsesUnofficialRate is true when a quarter applied used a rate that isn't an official figure.
	UsesUnofficialRate bool `json:"uses_unofficial_rate,omitempty"`
}

// EstimateFrom estimates the value of one subscription on a date, starting from the value it had on
// anchorDate (read on AforroNet) and adding the interest of each quarter that ended after anchorDate and on
// or before the date. A quarter whose base rate isn't in the data stops the estimate there: a missing rate
// is never replaced by a neighbouring month's.
func (r AforroRates) EstimateFrom(series string, subscribed, anchorDate time.Time, anchorValue float64, date time.Time) (AforroEstimate, error) {
	s, ok := r.Series[series]
	if !ok {
		return AforroEstimate{}, fmt.Errorf("série %q sem regras na aplicação", series)
	}
	subscribed, anchorDate, date = dayOf(subscribed), dayOf(anchorDate), dayOf(date)
	subscribedText := subscribed.Format(DateLayout)
	if subscribedText < s.From || (s.To != "" && subscribedText > s.To) {
		return AforroEstimate{}, fmt.Errorf("a série %s não teve subscrições em %s", series, subscribedText)
	}
	if anchorDate.Before(subscribed) {
		return AforroEstimate{}, fmt.Errorf("o valor indicado é anterior à data de subscrição")
	}
	if !(anchorValue > 0) || math.IsInf(anchorValue, 0) {
		return AforroEstimate{}, fmt.Errorf("o valor indicado tem de ser maior que zero")
	}

	quarters := s.TermYears * 4
	estimate := AforroEstimate{
		Series:          series,
		ValueEUR:        anchorValue,
		FromDate:        anchorDate.Format(DateLayout),
		FromValueEUR:    round2(anchorValue),
		Capitalisations: []AforroCapitalisation{},
		MaturityDate:    AforroCapitalisationDate(subscribed, quarters).Format(DateLayout),
		RatesFrom:       s.RatesFrom(),
		RatesThrough:    s.RatesThrough(),
	}
	value := anchorValue
	for k := 1; k <= quarters; k++ {
		day := AforroCapitalisationDate(subscribed, k)
		if !day.After(anchorDate) {
			continue // already in the value read on AforroNet
		}
		if day.After(date) {
			estimate.NextCapitalisation = day.Format(DateLayout)
			break
		}
		base, bonus, known := s.AforroQuarterRate(subscribed, k)
		if !known {
			estimate.Stopped = AforroStoppedNoRate
			estimate.StoppedOn = day.Format(DateLayout)
			break
		}
		rate := base.Rate + bonus
		interest := value * rate / 100 / 4 * (1 - WithholdingRate)
		value += interest
		if base.Kind != AforroRateOfficial {
			estimate.UsesUnofficialRate = true
		}
		estimate.Capitalisations = append(estimate.Capitalisations, AforroCapitalisation{
			Date:        day.Format(DateLayout),
			BaseRatePct: base.Rate,
			BonusPP:     bonus,
			RatePct:     math.Round(rate*1000) / 1000,
			RateKind:    base.Kind,
			InterestEUR: round2(interest),
			ValueEUR:    round2(value),
		})
		if k == quarters {
			estimate.Stopped = AforroStoppedMatured
		}
	}
	if estimate.Stopped == "" && estimate.NextCapitalisation == "" {
		// Every quarter is behind the starting value: the certificate had already matured.
		estimate.Stopped = AforroStoppedMatured
	}
	estimate.ValueEUR = round2(value)
	return estimate, nil
}

// ParseAforroRates reads the rates file (backend/data/aforro_rates.json) and checks it, so that a mistake in
// the data stops the estimates instead of giving a wrong one: every series needs its term, its subscription
// dates and a bonus table inside the term, and every rate a valid month, a known kind and a value between 0
// and 10%.
func ParseAforroRates(content []byte) (*AforroRates, error) {
	var rates AforroRates
	if err := json.Unmarshal(content, &rates); err != nil {
		return nil, fmt.Errorf("invalid Aforro rates file: %w", err)
	}
	if len(rates.Series) == 0 {
		return nil, fmt.Errorf("the Aforro rates file has no series")
	}
	for letter, s := range rates.Series {
		if s.TermYears <= 0 {
			return nil, fmt.Errorf("series %s: missing term", letter)
		}
		if _, err := ParseDate(s.From); err != nil {
			return nil, fmt.Errorf("series %s: invalid first subscription date", letter)
		}
		if s.To != "" {
			if _, err := ParseDate(s.To); err != nil {
				return nil, fmt.Errorf("series %s: invalid last subscription date", letter)
			}
		}
		for _, b := range s.Bonus {
			if b.FromYear < 1 || b.ToYear < b.FromYear || b.ToYear > s.TermYears || b.PP < 0 || b.PP > 5 {
				return nil, fmt.Errorf("series %s: invalid bonus %+v", letter, b)
			}
		}
		for month, rate := range s.BaseRates {
			if _, err := time.Parse("2006-01", month); err != nil {
				return nil, fmt.Errorf("series %s: invalid month %q", letter, month)
			}
			if math.IsNaN(rate.Rate) || rate.Rate < 0 || rate.Rate > 10 {
				return nil, fmt.Errorf("series %s, %s: rate %v out of range", letter, month, rate.Rate)
			}
			switch rate.Kind {
			case AforroRateOfficial, AforroRateDerived, AforroRateThirdParty:
			default:
				return nil, fmt.Errorf("series %s, %s: unknown kind %q", letter, month, rate.Kind)
			}
		}
	}
	return &rates, nil
}
