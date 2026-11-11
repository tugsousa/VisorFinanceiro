package networth

import (
	"math"
	"testing"
	"time"
)

func cryptoEntry(id int64, date time.Time, kind string, quantity, amount float64) Entry {
	return Entry{ID: id, Date: date, Kind: kind, Quantity: quantity, Amount: amount}
}

func TestCryptoPosition_QuantityAndAverageCost(t *testing.T) {
	entries := []Entry{
		cryptoEntry(1, DateOf(2025, 1, 10), KindContribution, 1, 40000),
		cryptoEntry(2, DateOf(2025, 2, 10), KindContribution, 1, 60000),
		cryptoEntry(3, DateOf(2025, 3, 10), KindWithdrawal, 0.5, 45000),
	}
	cases := []struct {
		date     time.Time
		quantity float64
		cost     float64
		exists   bool
	}{
		{DateOf(2025, 1, 9), 0, 0, false},
		{DateOf(2025, 1, 10), 1, 40000, true},
		{DateOf(2025, 2, 28), 2, 100000, true},
		{DateOf(2025, 3, 10), 1.5, 75000, true}, // a quarter of the quantity sold takes a quarter of the cost
	}
	for _, c := range cases {
		quantity, cost, exists := CryptoPosition(entries, c.date)
		if quantity != c.quantity || math.Abs(cost-c.cost) > 1e-6 || exists != c.exists {
			t.Errorf("%s: got %v units costing %v (exists %v), want %v, %v, %v",
				c.date.Format(DateLayout), quantity, cost, exists, c.quantity, c.cost, c.exists)
		}
	}

	// Selling everything leaves nothing, whatever the rounding of the quantities.
	all := append(entries, cryptoEntry(4, DateOf(2025, 4, 1), KindWithdrawal, 0.1+0.2+1.2, 1))
	if quantity, cost, exists := CryptoPosition(all, DateOf(2025, 4, 1)); quantity != 0 || cost != 0 || !exists {
		t.Errorf("after selling everything: %v units costing %v (exists %v)", quantity, cost, exists)
	}
}

func TestQuantityStaysPositive(t *testing.T) {
	buy := cryptoEntry(1, DateOf(2025, 1, 10), KindContribution, 1, 0)
	if !QuantityStaysPositive([]Entry{buy, cryptoEntry(2, DateOf(2025, 1, 10), KindWithdrawal, 1, 0)}) {
		t.Error("selling on the day of the purchase what was bought that day is fine")
	}
	// The order within a day doesn't matter: the sale was stored before the purchase.
	if !QuantityStaysPositive([]Entry{cryptoEntry(1, DateOf(2025, 1, 10), KindWithdrawal, 1, 0), cryptoEntry(2, DateOf(2025, 1, 10), KindContribution, 1, 0)}) {
		t.Error("a purchase and a sale of the same day shouldn't depend on their order")
	}
	if QuantityStaysPositive([]Entry{buy, cryptoEntry(2, DateOf(2025, 1, 11), KindWithdrawal, 1.5, 0)}) {
		t.Error("selling more than held must be refused")
	}
	// Held in total, but not yet on the day of the sale.
	if QuantityStaysPositive([]Entry{cryptoEntry(1, DateOf(2025, 1, 5), KindWithdrawal, 1, 0), buy}) {
		t.Error("a sale before the purchase must be refused")
	}
}

func TestAssetValueOn_Crypto(t *testing.T) {
	today := DateOf(2025, 3, 15)
	asset := Asset{
		ID: 1, Type: TypeCrypto,
		Entries: []Entry{
			cryptoEntry(1, DateOf(2025, 1, 10), KindContribution, 2, 80000),
			cryptoEntry(2, DateOf(2025, 2, 20), KindWithdrawal, 0.5, 30000),
		},
		Crypto: &CryptoPrices{
			Live: 70000, LiveDate: today,
			Daily: map[string]float64{"2025-01-31": 50000, "2025-02-26": 60000, "2025-03-15": 69000},
		},
	}

	if v := asset.ValueOn(DateOf(2025, 1, 9)); v.Exists || v.Net != 0 {
		t.Errorf("before the first purchase: %+v", v)
	}
	if v := asset.ValueOn(DateOf(2025, 1, 31)); v.Net != 100000 || v.Quantity != 2 || v.Unpriced {
		t.Errorf("end of January: %+v, want 2 × 50000", v)
	}
	// No close on the last day of February: the last one of the week before, with the quantity after the sale.
	if v := asset.ValueOn(DateOf(2025, 2, 28)); v.Net != 90000 || !v.PriceDate.Equal(DateOf(2025, 2, 26)) {
		t.Errorf("end of February: %+v, want 1.5 × 60000 with the price of the 26th", v)
	}
	// Today uses the live price rather than the day's close.
	if v := asset.ValueOn(today); v.Net != 105000 || v.Price != 70000 || !v.PriceDate.Equal(today) {
		t.Errorf("today: %+v, want 1.5 × 70000", v)
	}

	// Without the live price, today falls back to the last close.
	asset.Crypto.Live = 0
	if v := asset.ValueOn(today); v.Net != 1.5*69000 || v.Unpriced {
		t.Errorf("today without a live price: %+v", v)
	}

	// Without any price the asset counts at its average cost and says so, rather than at zero.
	asset.Crypto = &CryptoPrices{}
	if v := asset.ValueOn(today); v.Net != 60000 || !v.Unpriced || v.Quantity != 1.5 {
		t.Errorf("without prices: %+v, want the cost of 60000", v)
	}
	asset.Crypto = nil
	if v := asset.ValueOn(today); v.Net != 60000 || !v.Unpriced {
		t.Errorf("with no prices at all: %+v", v)
	}

	closed := DateOf(2025, 3, 1)
	asset.ClosedAt = &closed
	if v := asset.ValueOn(today); v.Exists || v.Net != 0 {
		t.Errorf("a closed asset is worth nothing: %+v", v)
	}
}

func TestCryptoIsNotAManualType(t *testing.T) {
	if !IsSupportedType(TypeCrypto) {
		t.Error("crypto assets can be created")
	}
	if IsManualType(TypeCrypto) {
		t.Error("crypto is valued by quantity and price, not by a value the user enters")
	}
}

func TestSummarize_CryptoHistoryUsesEachMonthsPrice(t *testing.T) {
	today := DateOf(2025, 3, 15)
	asset := Asset{
		ID: 7, Type: TypeCrypto,
		Entries: []Entry{cryptoEntry(1, DateOf(2025, 1, 10), KindContribution, 2, 80000)},
		Crypto: &CryptoPrices{
			Live: 70000, LiveDate: today,
			Daily: map[string]float64{"2025-01-31": 50000, "2025-02-28": 60000},
		},
	}
	summary := Summarize(nil, []Asset{asset}, nil, today)
	if summary.TotalEUR != 140000 || len(summary.ByType) != 2 || summary.ByType[1].Type != TypeCrypto {
		t.Fatalf("unexpected summary %+v", summary)
	}
	if len(summary.History) != 3 || summary.History[0].OtherAssetsEUR != 100000 || summary.History[1].OtherAssetsEUR != 120000 {
		t.Errorf("unexpected history %+v", summary.History)
	}
}
