// Package tax holds the Portuguese tax rules the app uses to estimate the tax on capital gains
// (category G, Anexo J). Every rule is here, in one place, so it can be checked and changed easily.
//
// These are estimates, not tax advice. The rules applied are:
//
//   - The gain of a sale is the sale amount minus the purchase amount, both in EUR at the rate of
//     their own date, minus the commissions of the sale and of the part of the purchase sold.
//   - Gains and losses of the same year (shares and options) are added up into one balance. A
//     positive balance pays the autonomous rate, 28%. A negative balance pays nothing.
//   - Since 2023, the balance of securities held for less than 365 days must be added to the other
//     income (englobamento) when the taxable income reaches the top bracket. The app doesn't know the
//     income, so it only reports that part of the balance; it doesn't tax it differently.
package tax

import (
	"math"
	"time"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/utils"
)

// AutonomousRate is the rate of the positive yearly balance of capital gains.
const AutonomousRate = 0.28

// ShortTermDays is the holding period below which a gain counts as short term.
const ShortTermDays = 365

// StockSaleGain is the taxable gain of one matched stock sale: its result minus its commissions.
func StockSaleGain(sale models.SaleDetail) float64 {
	return utils.RoundFloat(sale.Delta-sale.Commission, 2)
}

// OptionSaleGain is the taxable gain of one closed option position: its result minus its commissions.
func OptionSaleGain(sale models.OptionSaleDetail) float64 {
	return utils.RoundFloat(sale.Delta-sale.Commission, 2)
}

// DaysHeld is the number of days between the purchase and the sale.
func DaysHeld(buyDate, saleDate time.Time) int {
	return int(math.Round(saleDate.Sub(buyDate).Hours() / 24))
}

// IsShortTerm says whether a lot bought on buyDate and sold on saleDate was held less than 365 days.
func IsShortTerm(buyDate, saleDate time.Time) bool {
	return DaysHeld(buyDate, saleDate) < ShortTermDays
}

// LongTermDate is the first day on which a lot bought on buyDate is no longer short term.
func LongTermDate(buyDate time.Time) time.Time {
	return buyDate.AddDate(0, 0, ShortTermDays)
}

// YearBalance is the result of the capital gains of one year.
type YearBalance struct {
	Year            int     `json:"year"`
	StockGains      float64 `json:"stock_gains"`       // Sum of the positive stock results
	StockLosses     float64 `json:"stock_losses"`      // Sum of the negative stock results (negative)
	OptionsResult   float64 `json:"options_result"`    // Net result of the options
	Balance         float64 `json:"balance"`           // Everything added up
	ShortTermResult float64 `json:"short_term_result"` // Part of the stock result from lots held < 365 days
	EstimatedTax    float64 `json:"estimated_tax"`     // At the autonomous rate
}

// BalanceForYear adds up the stock and option sales of the given year.
func BalanceForYear(stockSales []models.SaleDetail, optionSales []models.OptionSaleDetail, year int) YearBalance {
	b := YearBalance{Year: year}
	for _, sale := range stockSales {
		saleDate := utils.ParseDate(sale.SaleDate)
		if saleDate.Year() != year {
			continue
		}
		gain := StockSaleGain(sale)
		if gain >= 0 {
			b.StockGains += gain
		} else {
			b.StockLosses += gain
		}
		if IsShortTerm(utils.ParseDate(sale.BuyDate), saleDate) {
			b.ShortTermResult += gain
		}
	}
	for _, sale := range optionSales {
		if utils.ParseDate(sale.CloseDate).Year() != year {
			continue
		}
		b.OptionsResult += OptionSaleGain(sale)
	}
	b.StockGains = utils.RoundFloat(b.StockGains, 2)
	b.StockLosses = utils.RoundFloat(b.StockLosses, 2)
	b.OptionsResult = utils.RoundFloat(b.OptionsResult, 2)
	b.ShortTermResult = utils.RoundFloat(b.ShortTermResult, 2)
	b.Balance = utils.RoundFloat(b.StockGains+b.StockLosses+b.OptionsResult, 2)
	b.EstimatedTax = TaxOnBalance(b.Balance)
	return b
}

// TaxOnBalance is the tax on a yearly balance at the autonomous rate. A negative balance pays nothing.
func TaxOnBalance(balance float64) float64 {
	if balance <= 0 {
		return 0
	}
	return utils.RoundFloat(balance*AutonomousRate, 2)
}

// MarginalTax is the extra tax a gain adds to a year that already has the given balance. A gain in a
// year with losses can pay less than 28%, or nothing.
func MarginalTax(balanceBefore, gain float64) float64 {
	return utils.RoundFloat(TaxOnBalance(balanceBefore+gain)-TaxOnBalance(balanceBefore), 2)
}
