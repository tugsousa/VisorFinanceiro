package networth

import (
	"fmt"
	"math"
	"time"
)

// Uses of a property.
const (
	UsageOwnHome = "own_home" // habitação própria permanente
	UsageRented  = "rented"   // arrendado
	UsageHoliday = "holiday"  // férias / secundária
	UsageLand    = "land"     // terreno
	UsageOther   = "other"
)

// IsValidUsage says whether usage is a property use; empty means not given.
func IsValidUsage(usage string) bool {
	switch usage {
	case "", UsageOwnHome, UsageRented, UsageHoliday, UsageLand, UsageOther:
		return true
	}
	return false
}

// Mortgage is what's owed on a property, known on one day, and how it's being paid off: a fixed monthly
// payment at a fixed nominal rate (the usual French amortisation of Portuguese mortgages). Rates that change
// (Euribor) make the projection drift, so the user corrects the balance from the bank now and then.
type Mortgage struct {
	Balance        float64   // capital em dívida on BalanceDate
	BalanceDate    time.Time // the day the balance was read
	RatePct        float64   // TAN, the annual nominal rate, in % (3.5 means 3.5%)
	MonthlyPayment float64   // prestação; 0 when unknown, and the balance then stays as given
}

// Validate checks that the mortgage can be projected.
func (m Mortgage) Validate() error {
	switch {
	case m.Balance < 0 || math.IsNaN(m.Balance) || math.IsInf(m.Balance, 0):
		return fmt.Errorf("o capital em dívida não pode ser negativo")
	case m.BalanceDate.IsZero():
		return fmt.Errorf("falta a data do capital em dívida")
	case m.RatePct < 0 || m.RatePct > 100 || math.IsNaN(m.RatePct):
		return fmt.Errorf("a TAN tem de estar entre 0 e 100%%")
	case m.MonthlyPayment < 0 || math.IsNaN(m.MonthlyPayment) || math.IsInf(m.MonthlyPayment, 0):
		return fmt.Errorf("a prestação não pode ser negativa")
	case m.MonthlyPayment > 0 && m.Balance > 0 && m.MonthlyPayment <= m.Balance*m.RatePct/100/12:
		return fmt.Errorf("a prestação não chega para pagar os juros do mês; confirme a prestação e a TAN")
	}
	return nil
}

// BalanceOn is what's owed at the end of the given day.
//
// BalanceDate is taken as a payment day: a payment falls on the same day of each month (clamped to the end of
// shorter months), the balance given already counts the payment of that day, and each payment lowers the balance by the payment minus the month's interest, balance × TAN / 12. Between payments the
// balance doesn't change. Before BalanceDate the same schedule is run backwards, which gives the balance the
// loan had then if the rate and the payment were the same. A balance paid off stays at zero.
func (m Mortgage) BalanceOn(date time.Time) float64 {
	if m.Balance <= 0 {
		return 0
	}
	if m.MonthlyPayment <= 0 {
		return m.Balance
	}
	r := m.RatePct / 100 / 12
	n := paymentsBetween(dayOf(m.BalanceDate), dayOf(date))
	if n == 0 {
		return m.Balance
	}
	var balance float64
	if r == 0 {
		balance = m.Balance - m.MonthlyPayment*float64(n)
	} else {
		growth := math.Pow(1+r, float64(n)) // for n < 0 this discounts, which runs the schedule backwards
		balance = m.Balance*growth - m.MonthlyPayment*(growth-1)/r
	}
	if balance < 0 {
		return 0
	}
	return balance
}

// paymentsBetween counts the payments between the balance and the given day. Payments fall on
// addMonthsClamped(from, k) for every whole k, and the balance on from already has that day's payment.
//   - to after from: the payments after from and up to to (k = 1, 2, …), as a positive number.
//   - to before from: the payments after to and up to from (k = 0, −1, …), which have to be undone, as a
//     negative number.
func paymentsBetween(from, to time.Time) int {
	n := 0
	if to.After(from) {
		for !addMonthsClamped(from, n+1).After(to) {
			n++
		}
		return n
	}
	for addMonthsClamped(from, -n).After(to) {
		n++
	}
	return -n
}

// RealEstate is the extra information of a property: what it cost, what it earns and what it costs to keep.
type RealEstate struct {
	Usage          string
	PurchasePrice  float64
	PurchaseCosts  float64 // IMT, Imposto do Selo, escritura, registo, comissões
	MonthlyRent    float64
	AnnualCosts    float64 // IMI, condomínio, seguros, manutenção
	MonthlyPayment float64 // the mortgage payment, for the cash flow
}

// RealEstateMetrics are the figures of a property on a day, before income tax.
type RealEstateMetrics struct {
	MarketValue     float64  `json:"market_value_eur"`
	Debt            float64  `json:"debt_eur"`
	Equity          float64  `json:"equity_eur"`
	LTVPct          *float64 `json:"ltv_pct,omitempty"` // debt / market value
	TotalCost       float64  `json:"total_cost_eur,omitempty"`
	Appreciation    *float64 `json:"appreciation_eur,omitempty"`      // market value − purchase price − purchase costs
	AppreciationPct *float64 `json:"appreciation_pct,omitempty"`      // of the total cost
	AnnualRent      float64  `json:"annual_rent_eur,omitempty"`       // monthly rent × 12
	AnnualCosts     float64  `json:"annual_costs_eur,omitempty"`      // as entered
	NetRentalIncome float64  `json:"net_rental_income_eur,omitempty"` // rent − costs
	GrossYieldPct   *float64 `json:"gross_yield_pct,omitempty"`       // annual rent / market value
	NetYieldPct     *float64 `json:"net_yield_pct,omitempty"`         // (rent − costs) / market value
	AnnualPayments  float64  `json:"annual_mortgage_payments_eur,omitempty"`
	AnnualCashFlow  *float64 `json:"annual_cash_flow_eur,omitempty"` // rent − costs − mortgage payments
}

// Metrics works out the figures of a property with the given market value and debt.
func (p RealEstate) Metrics(marketValue, debt float64) RealEstateMetrics {
	m := RealEstateMetrics{
		MarketValue:     round2(marketValue),
		Debt:            round2(debt),
		Equity:          round2(marketValue - debt),
		AnnualRent:      round2(p.MonthlyRent * 12),
		AnnualCosts:     round2(p.AnnualCosts),
		NetRentalIncome: round2(p.MonthlyRent*12 - p.AnnualCosts),
		AnnualPayments:  round2(p.MonthlyPayment * 12),
	}
	ptr := func(v float64) *float64 { r := round2(v); return &r }
	if marketValue > 0 && debt > 0 {
		m.LTVPct = ptr(debt / marketValue * 100)
	}
	if p.PurchasePrice > 0 {
		m.TotalCost = round2(p.PurchasePrice + p.PurchaseCosts)
		m.Appreciation = ptr(marketValue - m.TotalCost)
		m.AppreciationPct = ptr((marketValue - m.TotalCost) / m.TotalCost * 100)
	}
	if p.MonthlyRent > 0 && marketValue > 0 {
		m.GrossYieldPct = ptr(p.MonthlyRent * 12 / marketValue * 100)
		m.NetYieldPct = ptr((p.MonthlyRent*12 - p.AnnualCosts) / marketValue * 100)
	}
	if p.MonthlyRent > 0 || p.AnnualCosts > 0 || p.MonthlyPayment > 0 {
		m.AnnualCashFlow = ptr(p.MonthlyRent*12 - p.AnnualCosts - p.MonthlyPayment*12)
	}
	return m
}
