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

	alpha2Code := strings.ToUpper(isin[:2])
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
