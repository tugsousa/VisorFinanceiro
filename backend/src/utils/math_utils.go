package utils

import (
	"math"
	"math/rand"
	"time"
)

// MinInt returns the smaller of two integers.
func MinInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// AbsInt returns the absolute value of an integer.
func AbsInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
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
