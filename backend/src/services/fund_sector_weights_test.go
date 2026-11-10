package services

import (
	"math"
	"testing"
)

func w(key string, v float64) map[string]yahooRawValue {
	return map[string]yahooRawValue{key: {Raw: v}}
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

// The sectors are shares of the fund's stocks, so they are scaled by the stock part of the fund.
func TestFundSectorWeights_ScalesByStockPosition(t *testing.T) {
	got := fundSectorWeights(0.9, 0, []map[string]yahooRawValue{
		w("technology", 0.6), w("financial_services", 0.4), w("realestate", 0),
	})
	if len(got) != 2 {
		t.Fatalf("want 2 sectors (zero weights left out), got %v", got)
	}
	if !near(got["Technology"], 0.54) || !near(got["Financial Services"], 0.36) {
		t.Fatalf("unexpected weights %v", got)
	}
}

func TestFundSectorWeights_BondsAndRounding(t *testing.T) {
	// Sectors adding up to over 1 are normalised; the bond part gets its own entry.
	got := fundSectorWeights(0.5, 0.5, []map[string]yahooRawValue{w("energy", 0.6), w("utilities", 0.6)})
	if !near(got["Energy"], 0.25) || !near(got["Utilities"], 0.25) || !near(got[fundBondsSector], 0.5) {
		t.Fatalf("unexpected weights %v", got)
	}
}

func TestFundSectorWeights_NoData(t *testing.T) {
	if got := fundSectorWeights(0, 0, nil); got != nil {
		t.Fatalf("want nil, got %v", got)
	}
	// Without a stock position the sectors are the whole fund.
	got := fundSectorWeights(0, 0, []map[string]yahooRawValue{w("healthcare", 1)})
	if !near(got["Healthcare"], 1) {
		t.Fatalf("unexpected weights %v", got)
	}
}
