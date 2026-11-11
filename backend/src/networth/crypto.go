package networth

import (
	"math"
	"sort"
	"time"
)

// CryptoPrices are the prices of one coin in EUR, as the service read them from the price source. The package
// itself never fetches a price.
type CryptoPrices struct {
	// Live is the current price and LiveDate the day it's for; Live is 0 when the price couldn't be read.
	Live     float64
	LiveDate time.Time
	// Daily is the closing price of each day, by YYYY-MM-DD.
	Daily map[string]float64
}

// priceLookbackDays is how far back a day without a price looks for the last one.
const priceLookbackDays = 7

// priceOn is the price on a day and the day it's from: the live price for its own day, otherwise the day's
// close or the last close of the week before. The third result is false when there's none.
func (p *CryptoPrices) priceOn(date time.Time) (float64, time.Time, bool) {
	if p == nil {
		return 0, time.Time{}, false
	}
	if p.Live > 0 && dayOf(p.LiveDate).Equal(date) {
		return p.Live, date, true
	}
	for back := 0; back <= priceLookbackDays; back++ {
		day := date.AddDate(0, 0, -back)
		if price, ok := p.Daily[day.Format(DateLayout)]; ok && price > 0 {
			return price, day, true
		}
	}
	return 0, time.Time{}, false
}

// quantityTolerance absorbs the rounding of sums of quantities with many decimals.
const quantityTolerance = 1e-9

// CryptoPosition is how much of a coin is held at the end of a day and what it cost. Purchases (contributions)
// add their quantity and the amount paid; sales (withdrawals) take their quantity out and the same share of
// the cost, so Cost is the average cost of what's left. The second result is false when there's no entry on
// or before the day.
func CryptoPosition(entries []Entry, date time.Time) (quantity, cost float64, exists bool) {
	date = dayOf(date)
	sorted := make([]Entry, 0, len(entries))
	for _, e := range entries {
		if !dayOf(e.Date).After(date) {
			sorted = append(sorted, e)
		}
	}
	if len(sorted) == 0 {
		return 0, 0, false
	}
	sortEntriesForQuantity(sorted)
	for _, e := range sorted {
		switch e.Kind {
		case KindContribution:
			quantity += e.Quantity
			cost += e.Amount
		case KindWithdrawal:
			if quantity > quantityTolerance {
				share := math.Min(1, e.Quantity/quantity)
				cost -= cost * share
			}
			quantity -= e.Quantity
		}
	}
	if quantity < quantityTolerance {
		return 0, 0, true
	}
	return quantity, math.Max(0, cost), true
}

// QuantityStaysPositive says whether the quantity held never goes below zero at the end of any day, that is,
// whether no sale is larger than what was held.
func QuantityStaysPositive(entries []Entry) bool {
	sorted := append([]Entry(nil), entries...)
	sortEntriesForQuantity(sorted)
	quantity := 0.0
	for i, e := range sorted {
		switch e.Kind {
		case KindContribution:
			quantity += e.Quantity
		case KindWithdrawal:
			quantity -= e.Quantity
		}
		lastOfDay := i == len(sorted)-1 || !dayOf(sorted[i+1].Date).Equal(dayOf(e.Date))
		if lastOfDay && quantity < -quantityTolerance {
			return false
		}
	}
	return true
}

// sortEntriesForQuantity orders entries by day, with the purchases of a day before its sales.
func sortEntriesForQuantity(entries []Entry) {
	sort.SliceStable(entries, func(i, j int) bool {
		di, dj := dayOf(entries[i].Date), dayOf(entries[j].Date)
		if !di.Equal(dj) {
			return di.Before(dj)
		}
		if (entries[i].Kind == KindContribution) != (entries[j].Kind == KindContribution) {
			return entries[i].Kind == KindContribution
		}
		return entries[i].ID < entries[j].ID
	})
}

// cryptoValueOn values a coin at the end of a day: the quantity held times the price of that day. Without a
// price (the price source failed, or the day is before the coin's first price) it's valued at what it cost,
// as a broker holding without a price is, and Unpriced says so.
func (a Asset) cryptoValueOn(date time.Time) Value {
	quantity, cost, exists := CryptoPosition(a.Entries, date)
	if !exists {
		return Value{}
	}
	v := Value{Exists: true, Quantity: quantity, Cost: cost}
	if quantity == 0 {
		return v
	}
	price, priceDate, ok := a.Crypto.priceOn(date)
	if !ok {
		v.Unpriced = true
		v.Gross, v.Net = cost, cost
		return v
	}
	v.Price = price
	v.PriceDate = priceDate
	v.Gross = quantity * price
	v.Net = v.Gross
	return v
}
