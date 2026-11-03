package utils

import (
	"math"
	"math/rand"
	"time"
)

// QuantityEpsilon is the smallest share quantity treated as non-zero. Fractional quantities are
// floats, so a fully sold lot can leave a tiny remainder.
const QuantityEpsilon = 1e-6

// RoundQuantity removes float noise from a calculated share quantity.
func RoundQuantity(quantity float64) float64 {
	return RoundFloat(quantity, 6)
}

// RoundFloat rounds a float64 to a specified number of decimal places.
func RoundFloat(val float64, precision uint) float64 {
	ratio := math.Pow(10, float64(precision))
	return math.Round(val*ratio) / ratio
}

// RandInt returns a random integer between min and max (inclusive).
func RandInt(min, max int) int {
	if min >= max {
		return min
	}
	return rand.Intn(max-min+1) + min
}

// init initializes the random seed
func init() {
	rand.Seed(time.Now().UnixNano())
}
