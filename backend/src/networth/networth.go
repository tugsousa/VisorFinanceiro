// Package networth holds the rules for valuing the savings and assets a user keeps outside the brokers
// (term deposits, Certificados de Aforro, current accounts, PPR, property...) and for adding them to the broker
// portfolios to give the total net worth. It has no database or network access, so every rule can be tested.
package networth

import (
	"fmt"
	"math"
	"sort"
	"time"
)

// WithholdingRate is the Portuguese tax withheld at source on deposit interest (taxa liberatória).
const WithholdingRate = 0.28

// DateLayout is how the dates of other assets are stored and exchanged: sortable, unlike transaction dates.
const DateLayout = "2006-01-02"

// Asset types.
const (
	TypeTermDeposit        = "term_deposit"
	TypeSavingsCertificate = "savings_certificate"
	TypeCrypto             = "crypto"
	TypeCashAccount        = "cash_account"
	TypePPR                = "ppr"
	TypeRealEstate         = "real_estate"
	TypeOther              = "other"
)

// TypeBrokers is the group of the broker portfolios in the totals per type.
const TypeBrokers = "brokers"

// Entry kinds.
const (
	KindContribution = "contribution"
	KindWithdrawal   = "withdrawal"
	KindValuation    = "valuation"
	KindInterest     = "interest"
)

// Capitalisation of a term deposit's interest.
const (
	CapitalisationMaturity  = "maturity"  // paid at maturity: simple interest
	CapitalisationMonthly   = "monthly"   // added to the principal every month
	CapitalisationQuarterly = "quarterly" // every three months
	CapitalisationAnnual    = "annual"    // every year
)

// IsSupportedType says whether an asset of this type can be created.
func IsSupportedType(assetType string) bool {
	switch assetType {
	case TypeTermDeposit, TypeSavingsCertificate, TypeCrypto, TypeCashAccount, TypePPR, TypeRealEstate, TypeOther:
		return true
	}
	return false
}

// IsManualType says whether the value of this type is the last value the user entered (plus the money moved
// since). A term deposit is valued by its formula and crypto by its quantity and price. A Certificado de Aforro
// is manual too, but with a series and a subscription date its rates move the value on (see aforroValueOn).
func IsManualType(assetType string) bool {
	return IsSupportedType(assetType) && assetType != TypeTermDeposit && assetType != TypeCrypto
}

// IsValidKind says whether kind is an entry kind.
func IsValidKind(kind string) bool {
	switch kind {
	case KindContribution, KindWithdrawal, KindValuation, KindInterest:
		return true
	}
	return false
}

// Value is what an asset is worth on a date. For a term deposit, Gross ignores the tax withheld on the interest
// and Net deducts it; for the other types both are the same. The net worth adds up Net.
//
// For property, Gross is the market value and Net is the equity: the market value minus what's still owed on
// the mortgage (Debt), which is what counts for the net worth.
type Value struct {
	Gross         float64
	Net           float64
	InterestNet   float64 // Term deposits: the interest earned so far, net of the withholding
	InterestGross float64
	Debt          float64 // Property: the mortgage balance on that day
	Exists        bool    // false before the asset existed or from its closing date on

	// Crypto: the quantity held, what it cost (average cost), the price used and the day it's from. Unpriced
	// is true when there was no price, and the value is then the cost.
	Quantity  float64
	Cost      float64
	Price     float64
	PriceDate time.Time
	Unpriced  bool
}

// --- Term deposits ---

// TermDeposit is a depósito a prazo.
type TermDeposit struct {
	Principal      float64
	RatePct        float64 // TANB, the gross annual nominal rate, in % (3 means 3%)
	Start          time.Time
	Maturity       time.Time
	Capitalisation string
}

// Validate checks that the deposit can be valued.
func (d TermDeposit) Validate() error {
	switch {
	case !(d.Principal > 0):
		return fmt.Errorf("o capital tem de ser maior que zero")
	case d.RatePct < 0 || d.RatePct > 100 || math.IsNaN(d.RatePct):
		return fmt.Errorf("a TANB tem de estar entre 0 e 100%%")
	case d.Start.IsZero():
		return fmt.Errorf("falta a data de início")
	case d.Maturity.IsZero() || !d.Maturity.After(d.Start):
		return fmt.Errorf("a data de vencimento tem de ser depois da data de início")
	case capitalisationMonths(d.Capitalisation) < 0:
		return fmt.Errorf("capitalização desconhecida: %q", d.Capitalisation)
	}
	return nil
}

// capitalisationMonths is the length of a capitalisation period in months: 0 for interest paid at maturity,
// -1 for an unknown capitalisation.
func capitalisationMonths(capitalisation string) int {
	switch capitalisation {
	case CapitalisationMaturity:
		return 0
	case CapitalisationMonthly:
		return 1
	case CapitalisationQuarterly:
		return 3
	case CapitalisationAnnual:
		return 12
	}
	return -1
}

// ValueOn values the deposit at the end of the given day.
//
// Day count: Actual/365. Interest accrues for the actual number of calendar days elapsed, over a 365-day
// year, also in leap years, which is the usual convention of Portuguese banks for the TANB of a deposit.
//
//   - Before the start date the deposit doesn't exist yet: zero.
//   - Interest paid at maturity is simple: Principal × TANB × days / 365. Before maturity the value includes
//     the interest accrued so far (what the deposit has earned, although a bank may not pay it if it's broken
//     early).
//   - Periodic capitalisation compounds: at the end of each period (counted in calendar months from the start
//     date, clamped to the end of shorter months, the last one ending at maturity) the period's interest,
//     balance × TANB × days of the period / 365, is added to the balance. Inside a period the interest accrues
//     simply on the balance.
//   - Net of tax: 28% is withheld from each interest payment, so with periodic capitalisation only the net
//     interest is added to the net balance and earns interest afterwards.
//   - The deposit stops growing at maturity: later dates are valued as at maturity.
func (d TermDeposit) ValueOn(date time.Time) Value {
	date = dayOf(date)
	start := dayOf(d.Start)
	maturity := dayOf(d.Maturity)
	if date.Before(start) {
		return Value{}
	}
	end := date
	if end.After(maturity) {
		end = maturity
	}
	rate := d.RatePct / 100
	months := capitalisationMonths(d.Capitalisation)

	gross, net := d.Principal, d.Principal
	if months <= 0 {
		interest := d.Principal * rate * daysBetween(start, end) / 365
		gross += interest
		net += interest * (1 - WithholdingRate)
	} else {
		periodStart := start
		for k := 1; periodStart.Before(end); k++ {
			periodEnd := addMonthsClamped(start, k*months)
			if periodEnd.After(maturity) {
				periodEnd = maturity
			}
			stop := periodEnd
			if stop.After(end) {
				stop = end // the current period, accrued but not capitalised yet
			}
			fraction := rate * daysBetween(periodStart, stop) / 365
			gross += gross * fraction
			net += net * fraction * (1 - WithholdingRate)
			periodStart = stop
		}
	}
	return Value{
		Gross:         gross,
		Net:           net,
		InterestGross: gross - d.Principal,
		InterestNet:   net - d.Principal,
		Exists:        true,
	}
}

// --- Manual assets ---

// Entry is money moved in or out of an asset, or a valuation the user entered. Amounts are positive. For
// crypto, a contribution is a purchase and a withdrawal a sale, of Quantity units for Amount euros.
type Entry struct {
	ID       int64
	Date     time.Time
	Kind     string
	Amount   float64
	Quantity float64
}

// ManualValueOn values an asset whose value the user enters, at the end of the given day: the last valuation
// on or before that day, plus the contributions and interest after it, minus the withdrawals after it. A
// valuation includes the movements of its own day. Without a valuation it's the sum of the movements. The
// second result is false when there's no entry on or before the date, so the asset didn't exist yet.
func ManualValueOn(entries []Entry, date time.Time) (float64, bool) {
	date = dayOf(date)
	sorted := make([]Entry, 0, len(entries))
	for _, e := range entries {
		if !dayOf(e.Date).After(date) {
			sorted = append(sorted, e)
		}
	}
	if len(sorted) == 0 {
		return 0, false
	}
	sort.SliceStable(sorted, func(i, j int) bool {
		if !sorted[i].Date.Equal(sorted[j].Date) {
			return sorted[i].Date.Before(sorted[j].Date)
		}
		return sorted[i].ID < sorted[j].ID
	})

	value := 0.0
	var valuationDay time.Time
	hasValuation := false
	for _, e := range sorted {
		if e.Kind == KindValuation {
			value = e.Amount
			valuationDay = dayOf(e.Date)
			hasValuation = true
		}
	}
	for _, e := range sorted {
		if hasValuation && !dayOf(e.Date).After(valuationDay) {
			continue
		}
		switch e.Kind {
		case KindContribution, KindInterest:
			value += e.Amount
		case KindWithdrawal:
			value -= e.Amount
		}
	}
	return value, true
}

// --- Any asset ---

// Asset is an asset with what's needed to value it.
type Asset struct {
	ID       int64
	Type     string
	Name     string
	ClosedAt *time.Time         // worth nothing from this day on
	Deposit  *TermDeposit       // term deposits only
	Mortgage *Mortgage          // property with a mortgage only
	Crypto   *CryptoPrices      // crypto only: the coin's prices
	Aforro   *AforroCertificate // Certificados de Aforro with a series only: valued by the rates
	Entries  []Entry
}

// ValueOn values the asset at the end of the given day.
func (a Asset) ValueOn(date time.Time) Value {
	date = dayOf(date)
	if a.ClosedAt != nil && !date.Before(dayOf(*a.ClosedAt)) {
		return Value{}
	}
	if a.Type == TypeTermDeposit {
		if a.Deposit == nil {
			return Value{}
		}
		return a.Deposit.ValueOn(date)
	}
	if a.Type == TypeCrypto {
		return a.cryptoValueOn(date)
	}
	if a.Type == TypeSavingsCertificate {
		if v, ok := a.aforroValueOn(date); ok {
			return v
		}
	}
	value, exists := ManualValueOn(a.Entries, date)
	if exists && a.Type == TypeRealEstate && a.Mortgage != nil {
		debt := a.Mortgage.BalanceOn(date)
		return Value{Gross: value, Net: value - debt, Debt: debt, Exists: true}
	}
	return Value{Gross: value, Net: value, Exists: exists}
}

// firstDate is the first day the asset has a value, or false if it has none.
func (a Asset) firstDate() (time.Time, bool) {
	if a.Type == TypeTermDeposit {
		if a.Deposit == nil {
			return time.Time{}, false
		}
		return dayOf(a.Deposit.Start), true
	}
	var first time.Time
	for _, e := range a.Entries {
		if first.IsZero() || e.Date.Before(first) {
			first = dayOf(e.Date)
		}
	}
	return first, !first.IsZero()
}

// --- Dates ---

// dayOf drops the time of day, keeping the calendar date.
func dayOf(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// daysBetween is the number of calendar days from a to b.
func daysBetween(a, b time.Time) float64 {
	return math.Round(dayOf(b).Sub(dayOf(a)).Hours() / 24)
}

// addMonthsClamped adds months to a date, keeping the day of the month or, when the month is shorter, its last
// day: 31 January + 1 month is 28 (or 29) February, unlike time.AddDate, which would give 3 March.
func addMonthsClamped(t time.Time, months int) time.Time {
	firstOfMonth := time.Date(t.Year(), t.Month()+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
	lastDay := firstOfMonth.AddDate(0, 1, -1).Day()
	day := t.Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(firstOfMonth.Year(), firstOfMonth.Month(), day, 0, 0, 0, 0, time.UTC)
}

// DateOf is the given calendar day.
func DateOf(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// ParseDate parses a YYYY-MM-DD date.
func ParseDate(text string) (time.Time, error) {
	t, err := time.Parse(DateLayout, text)
	if err != nil {
		return time.Time{}, fmt.Errorf("data inválida %q, use AAAA-MM-DD", text)
	}
	return t, nil
}
