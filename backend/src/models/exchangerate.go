package models

// ExchangeRate represents the structure of the exchange rate JSON file.
type ExchangeRate struct {
	Root struct {
		Obs []struct {
			TimePeriod string `json:"_TIME_PERIOD"`
			ObsValue   string `json:"_OBS_VALUE"`
			Ccy        string `json:"_CCY"`
		} `json:"Obs"`
	} `json:"root"`
}
