package models

// ECBResponse is the top-level structure for the ECB Data Portal API JSON response.
type ECBResponse struct {
	DataSets []struct {
		Series map[string]struct {
			Observations map[string][]float64 `json:"observations"`
		} `json:"series"`
	} `json:"dataSets"`
	Structure struct {
		Dimensions struct {
			Observation []struct {
				ID     string `json:"id"`
				Values []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"values"`
			} `json:"observation"`
		} `json:"dimensions"`
	} `json:"structure"`
}
