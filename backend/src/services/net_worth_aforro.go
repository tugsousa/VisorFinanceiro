package services

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/networth"
)

// Certificados de Aforro keep counting at the value the user typed from AforroNet. Next to it the app shows
// an estimate of what the certificate is worth now: that typed value plus the interest of the quarters that
// ended since, at the rates IGCP published (backend/data/aforro_rates.json). The estimate never enters the
// net worth by itself; the user can accept it, which stores it as an ordinary valuation they can delete.

// AforroEstimateNote marks the valuation entries that are an accepted estimate rather than a value read on
// AforroNet. An estimate always starts from the last value that isn't one, so estimates don't pile up on
// estimates.
const AforroEstimateNote = "Estimativa (taxas do IGCP)"

// Statuses of the estimate of a certificate.
const (
	AforroStatusOK          = "ok"          // estimated up to today
	AforroStatusRatesEnded  = "rates_ended" // stopped at a quarter whose rate isn't in the app's data
	AforroStatusMatured     = "matured"     // the certificate reached its term
	AforroStatusUnavailable = "unavailable" // no estimate; Reason says why
)

// AforroEstimateView is the estimate of a certificate as the API returns it.
type AforroEstimateView struct {
	Status string `json:"status"`
	// Reason says, in Portuguese, why there's no estimate or why it stops before today.
	Reason string `json:"reason,omitempty"`
	*networth.AforroEstimate
	// DifferenceEUR is the estimate minus the value that counts today.
	DifferenceEUR float64 `json:"difference_eur"`
	// CountedInTotal is always false: the net worth counts the value the user entered, not this estimate.
	CountedInTotal bool `json:"counted_in_total"`
}

var (
	aforroRatesMu sync.RWMutex
	aforroRates   *networth.AforroRates
)

// SetAforroRates sets the rates the estimates use; nil turns the estimates off.
func SetAforroRates(rates *networth.AforroRates) {
	aforroRatesMu.Lock()
	defer aforroRatesMu.Unlock()
	aforroRates = rates
}

func currentAforroRates() *networth.AforroRates {
	aforroRatesMu.RLock()
	defer aforroRatesMu.RUnlock()
	return aforroRates
}

// LoadAforroRates reads and checks the rates file and sets it for the estimates. On an error the estimates
// stay off and everything else works as before.
func LoadAforroRates(path string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		SetAforroRates(nil)
		return fmt.Errorf("failed to read the Aforro rates: %w", err)
	}
	rates, err := networth.ParseAforroRates(content)
	if err != nil {
		SetAforroRates(nil)
		return err
	}
	SetAforroRates(rates)
	return nil
}

// validateCertificateDetails checks the series and the subscription date of a certificate. Both are optional:
// without a series the asset is the plain manual one, with no estimate.
func validateCertificateDetails(details *OtherAssetDetails, openedAt string) (string, error) {
	if details == nil {
		return "", nil
	}
	series := strings.ToUpper(strings.TrimSpace(details.Series))
	if series == "" {
		return "", nil
	}
	if openedAt == "" {
		return "", inputErrorf("indique a data de subscrição do certificado")
	}
	subscribed, err := networth.ParseDate(openedAt)
	if err != nil {
		return "", otherAssetInputError(err.Error())
	}
	if subscribed.After(today()) {
		return "", inputErrorf("a data de subscrição não pode ser futura")
	}
	rates := currentAforroRates()
	if rates == nil {
		if len(series) != 1 || series[0] < 'A' || series[0] > 'Z' {
			return "", inputErrorf("série desconhecida: %q", details.Series)
		}
		return series, nil
	}
	if _, ok := rates.Series[series]; !ok {
		return "", inputErrorf("a aplicação só estima as séries D, E e F; deixe a série em branco para as outras")
	}
	if actual := rates.SeriesOn(subscribed); actual != series {
		if actual == "" {
			return "", inputErrorf("a série %s não teve subscrições em %s", series, formatDatePT(subscribed))
		}
		return "", inputErrorf("uma subscrição de %s é da série %s, não da série %s", formatDatePT(subscribed), actual, series)
	}
	return series, nil
}

func formatDatePT(t time.Time) string { return t.Format("02-01-2006") }

// aforroEstimateOf estimates a certificate from the last value the user read on AforroNet. It returns nil
// for an asset that isn't a certificate with a series, so such an asset is returned exactly as before.
func aforroEstimateOf(a OtherAsset, now time.Time) *AforroEstimateView {
	if a.Type != networth.TypeSavingsCertificate || a.Details == nil || a.Details.Series == "" {
		return nil
	}
	unavailable := func(format string, args ...any) *AforroEstimateView {
		return &AforroEstimateView{Status: AforroStatusUnavailable, Reason: fmt.Sprintf(format, args...)}
	}
	rates := currentAforroRates()
	if rates == nil {
		return unavailable("As taxas dos Certificados de Aforro não estão disponíveis nesta instalação.")
	}
	todayText := now.Format(networth.DateLayout)
	if a.ClosedAt != "" && a.ClosedAt <= todayText {
		return unavailable("O ativo está fechado.")
	}
	subscribed, err := networth.ParseDate(a.OpenedAt)
	if err != nil {
		return unavailable("Falta a data de subscrição.")
	}

	// The anchor: the last value that was read on AforroNet, not an accepted estimate.
	var anchor *OtherAssetEntry
	for i := range a.Entries {
		e := &a.Entries[i]
		if e.Kind == networth.KindValuation && e.Note != AforroEstimateNote && (anchor == nil || e.Date >= anchor.Date) {
			anchor = e
		}
	}
	if anchor == nil {
		return unavailable("Indique o valor que consta no AforroNet para ter uma estimativa a partir dele.")
	}
	for _, e := range a.Entries {
		if e.Kind != networth.KindValuation && e.Date > anchor.Date {
			return unavailable("Há movimentos depois do último valor do AforroNet (%s). Atualize o valor para voltar a ter estimativa.", formatISODatePT(anchor.Date))
		}
	}
	anchorDate, err := networth.ParseDate(anchor.Date)
	if err != nil {
		return unavailable("O último valor tem uma data inválida.")
	}

	estimate, err := rates.EstimateFrom(a.Details.Series, subscribed, anchorDate, anchor.Amount, now)
	if err != nil {
		message := err.Error()
		return unavailable("%s.", strings.ToUpper(message[:1])+message[1:])
	}
	view := &AforroEstimateView{Status: AforroStatusOK, AforroEstimate: &estimate}
	switch estimate.Stopped {
	case networth.AforroStoppedNoRate:
		view.Status = AforroStatusRatesEnded
		view.Reason = fmt.Sprintf("A aplicação não tem a taxa do trimestre que terminou a %s (tem taxas até %s), por isso a estimativa pára antes dessa data. Indique o valor do AforroNet.",
			formatISODatePT(estimate.StoppedOn), formatMonthPT(estimate.RatesThrough))
	case networth.AforroStoppedMatured:
		view.Status = AforroStatusMatured
		view.Reason = fmt.Sprintf("O certificado venceu a %s e deixou de render.", formatISODatePT(estimate.MaturityDate))
	}
	view.DifferenceEUR = round2(estimate.ValueEUR - a.ValueEUR)
	return view
}

// formatISODatePT turns YYYY-MM-DD into DD-MM-YYYY.
func formatISODatePT(iso string) string {
	parts := strings.Split(iso, "-")
	if len(parts) != 3 {
		return iso
	}
	return parts[2] + "-" + parts[1] + "-" + parts[0]
}

// formatMonthPT turns YYYY-MM into MM/YYYY.
func formatMonthPT(month string) string {
	parts := strings.Split(month, "-")
	if len(parts) != 2 {
		return month
	}
	return parts[1] + "/" + parts[0]
}

// aforroEstimateEntry is the valuation that accepts the estimate of a certificate: the estimated value, on
// the day of the last quarter it includes. It's refused when there's nothing to accept.
func (s *uploadServiceImpl) aforroEstimateEntry(userID, assetID int64) (*OtherAssetEntryInput, error) {
	asset, err := s.getOtherAsset(userID, assetID)
	if err != nil {
		return nil, err
	}
	view := asset.AforroEstimate
	if view == nil {
		return nil, inputErrorf("este ativo não tem estimativa: indique a série e a data de subscrição do certificado")
	}
	if view.AforroEstimate == nil {
		return nil, otherAssetInputError(view.Reason)
	}
	if len(view.Capitalisations) == 0 {
		return nil, inputErrorf("ainda não houve capitalização de juros desde o último valor do AforroNet")
	}
	last := view.Capitalisations[len(view.Capitalisations)-1]
	return &OtherAssetEntryInput{Date: last.Date, Kind: networth.KindValuation, Amount: view.ValueEUR, Note: AforroEstimateNote}, nil
}
