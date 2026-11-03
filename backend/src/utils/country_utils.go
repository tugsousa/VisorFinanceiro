package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/username/taxfolio/backend/src/logger" // Use new logger
)

type CountryInfo struct {
	Country string `json:"country"`
	Alpha2  string `json:"alpha2"`
	Alpha3  string `json:"alpha3"`
	Numeric string `json:"numeric"`
}

var (
	countryMap map[string]CountryInfo
	loadOnce   sync.Once
	loadError  error
	dataLoaded bool = false

	dividendSourceOverrides map[string]string // ISIN -> alpha2 country code
)

// InitCountryData loads country data from the given file path.
// This should be called once from main.go after config is loaded.
func InitCountryData(filePath string) error {
	logger.L.Info("Initializing country data", "path", filePath)
	loadOnce.Do(func() {
		fileData, err := os.ReadFile(filePath)
		if err != nil {
			loadError = fmt.Errorf("failed to read country data file '%s': %w", filePath, err)
			logger.L.Error("Failed to read country data file", "path", filePath, "error", err)
			return
		}

		var countries []CountryInfo
		err = json.Unmarshal(fileData, &countries)
		if err != nil {
			loadError = fmt.Errorf("failed to unmarshal country data from '%s': %w", filePath, err)
			logger.L.Error("Failed to unmarshal country data", "path", filePath, "error", err)
			return
		}

		countryMap = make(map[string]CountryInfo)
		for _, country := range countries {
			countryMap[strings.ToUpper(country.Alpha2)] = country
		}
		dataLoaded = true
		logger.L.Info("Country data loaded successfully.", "path", filePath, "countryCount", len(countryMap))
	})
	return loadError
}

func GetCountryCodeString(isin string) string {
	if !dataLoaded {
		logger.L.Error("Attempted to GetCountryCodeString before country data was loaded.")
		return "Country Data Not Initialized"
	}
	if loadError != nil {
		logger.L.Warn("Cannot get country code string due to earlier data load error", "error", loadError)
		return "Error Loading Country Data"
	}

	if len(isin) < 2 {
		return "Invalid ISIN (Too Short)"
	}

	return formatCountryString(strings.ToUpper(isin[:2]))
}

func formatCountryString(alpha2Code string) string {
	countryInfo, found := countryMap[alpha2Code]
	if !found {
		return "Unknown Code: " + alpha2Code
	}

	numericCode := strings.TrimSpace(countryInfo.Numeric)
	if numericCode == "" {
		numericCode = "N/A"
	}
	return fmt.Sprintf("%s - %s", numericCode, countryInfo.Country)
}

// DividendSourceOverride sets the source country of a product's dividends when it
// differs from its ISIN prefix. Note and Source record why the entry exists.
type DividendSourceOverride struct {
	ISIN   string `json:"isin"`
	Alpha2 string `json:"alpha2"`
	Note   string `json:"note"`
	Source string `json:"source"`
}

// InitDividendSourceOverrides loads the overrides from the given file path.
// Country data must be loaded first, as entries are validated against it.
// If the file is invalid, no overrides are applied and an error is returned.
func InitDividendSourceOverrides(filePath string) error {
	fileData, err := os.ReadFile(filePath)
	if err != nil {
		dividendSourceOverrides = nil
		return fmt.Errorf("failed to read dividend source overrides file '%s': %w", filePath, err)
	}

	var entries []DividendSourceOverride
	if err := json.Unmarshal(fileData, &entries); err != nil {
		dividendSourceOverrides = nil
		return fmt.Errorf("failed to unmarshal dividend source overrides from '%s': %w", filePath, err)
	}

	overrides := make(map[string]string, len(entries))
	for _, entry := range entries {
		isin := strings.ToUpper(strings.TrimSpace(entry.ISIN))
		alpha2Code := strings.ToUpper(strings.TrimSpace(entry.Alpha2))

		if len(isin) != 12 {
			dividendSourceOverrides = nil
			return fmt.Errorf("invalid ISIN '%s' in dividend source overrides", entry.ISIN)
		}
		if _, found := countryMap[alpha2Code]; !found {
			dividendSourceOverrides = nil
			return fmt.Errorf("unknown country '%s' for ISIN %s in dividend source overrides", entry.Alpha2, isin)
		}
		if _, duplicate := overrides[isin]; duplicate {
			dividendSourceOverrides = nil
			return fmt.Errorf("duplicate ISIN %s in dividend source overrides", isin)
		}
		overrides[isin] = alpha2Code
	}

	dividendSourceOverrides = overrides
	logger.L.Info("Dividend source overrides loaded successfully.", "path", filePath, "overrideCount", len(overrides))
	return nil
}

// GetDividendSourceCountry returns the source country of a product's dividends:
// its override if it has one, otherwise the country from its ISIN prefix.
func GetDividendSourceCountry(isin string) string {
	normalizedISIN := strings.ToUpper(strings.TrimSpace(isin))
	if alpha2Code, found := dividendSourceOverrides[normalizedISIN]; found {
		return formatCountryString(alpha2Code)
	}
	return GetCountryCodeString(isin)
}
