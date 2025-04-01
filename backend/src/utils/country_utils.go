package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
)

// CountryInfo defines the structure for country data loaded from JSON.
type CountryInfo struct {
	Country string `json:"country"`
	Alpha2  string `json:"alpha2"`
	Alpha3  string `json:"alpha3"`
	Numeric string `json:"numeric"` // Kept as string as it appears in JSON
}

var (
	countryMap map[string]CountryInfo
	loadOnce   sync.Once
	loadError  error
)

// loadCountryData reads the country JSON file and populates the countryMap.
// It ensures this operation happens only once using sync.Once.
func loadCountryData() {
	loadOnce.Do(func() {
		// Reverting path based on runtime behavior suspicion (relative to backend/ dir)
		filePath := "data/country.json"

		data, err := os.ReadFile(filePath)
		if err != nil {
			loadError = fmt.Errorf("failed to read country data file '%s': %w", filePath, err)
			return
		}

		var countries []CountryInfo
		err = json.Unmarshal(data, &countries)
		if err != nil {
			loadError = fmt.Errorf("failed to unmarshal country data from '%s': %w", filePath, err)
			return
		}

		countryMap = make(map[string]CountryInfo)
		for _, country := range countries {
			// Use uppercase alpha2 code as the key for case-insensitive matching.
			countryMap[strings.ToUpper(country.Alpha2)] = country
		}
	})
}

// GetCountryCodeString extracts the country code from an ISIN and returns a formatted string.
// The format is "numeric - country". Handles errors and unknown codes.
func GetCountryCodeString(isin string) string {
	loadCountryData() // Ensure the country data is loaded.

	if loadError != nil {
		fmt.Printf("Error loading country data: %v\n", loadError) // Consider proper logging
		return "Error Loading Country Data"
	}
	if countryMap == nil {
		// This case should ideally not be reached if loadError is nil, but added for safety.
		return "Country Data Not Initialized"
	}

	if len(isin) < 2 {
		return "Invalid ISIN (Too Short)"
	}

	// Extract the first two characters and convert to uppercase for lookup.
	alpha2Code := strings.ToUpper(isin[:2])

	countryInfo, found := countryMap[alpha2Code]
	if !found {
		// Handle potentially unknown or special codes (e.g., XS, EU).
		// For now, return a specific string indicating the code wasn't found.
		return "Unknown Code: " + alpha2Code
	}

	// Format the output string: "numeric - country".
	numericCode := strings.TrimSpace(countryInfo.Numeric)
	if numericCode == "" {
		numericCode = "N/A" // Use "N/A" if numeric code is missing.
	}
	return fmt.Sprintf("%s - %s", numericCode, countryInfo.Country)
}
