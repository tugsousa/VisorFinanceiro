package services

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/networth"
)

// A Certificado de Aforro with a series and a subscription date is valued by the rates IGCP published
// (backend/data/aforro_rates.json): the amount subscribed, stored as a valuation on the subscription date,
// plus the interest of every quarter capitalised since. A value read on AforroNet, entered later, becomes the
// new starting point; it's needed when a quarter has no known rate (a subscription older than December 2024,
// or a month missing from the data), where the value otherwise stays at the one before that quarter.
// aforro_estimate explains that value (the quarters, their rates, why it stops) and is what the net worth
// counts. A certificate without a series is a plain manual asset.

// AforroEstimateNote marks the valuation entries that are an accepted estimate rather than a value read on
// AforroNet. They come from before certificates were valued by their rates; the valuation and the estimate
// both skip them, since the rates give the same value again.
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
	// CountedInTotal is true when this is the value the net worth counts, which is the case whenever there's
	// an estimate; with status "unavailable" the certificate counts at the last value entered.
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

// aforroCertificateOf is what values a certificate by its rates, or nil for an asset that isn't a
// certificate with a series and a subscription date, or when the rates aren't loaded: it's then valued as a
// manual asset.
func aforroCertificateOf(a OtherAsset) *networth.AforroCertificate {
	if a.Type != networth.TypeSavingsCertificate || a.Details == nil || a.Details.Series == "" {
		return nil
	}
	rates := currentAforroRates()
	if rates == nil {
		return nil
	}
	subscribed, err := networth.ParseDate(a.OpenedAt)
	if err != nil {
		return nil
	}
	return &networth.AforroCertificate{Rates: rates, Series: a.Details.Series, Subscribed: subscribed}
}

// aforroEstimateOf values a certificate from its last valuation (the amount subscribed or a value read on
// AforroNet), with the same rules as its valuation in the net worth, and says how. It returns nil
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

	// The anchor: the last valuation, not an accepted estimate.
	var anchor *OtherAssetEntry
	for i := range a.Entries {
		e := &a.Entries[i]
		if e.Kind == networth.KindValuation && e.Note != AforroEstimateNote && (anchor == nil || e.Date >= anchor.Date) {
			anchor = e
		}
	}
	if anchor == nil {
		return unavailable("Indique o valor subscrito, ou o valor que consta no AforroNet, para a aplicação calcular o valor.")
	}
	for _, e := range a.Entries {
		if e.Kind != networth.KindValuation && e.Date > anchor.Date {
			return unavailable("Há movimentos depois do último valor (%s): conta o valor indicado. Indique o valor do AforroNet para a aplicação voltar a calcular.", formatISODatePT(anchor.Date))
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
	view := &AforroEstimateView{Status: AforroStatusOK, AforroEstimate: &estimate, CountedInTotal: true}
	switch estimate.Stopped {
	case networth.AforroStoppedNoRate:
		view.Status = AforroStatusRatesEnded
		view.Reason = fmt.Sprintf("A aplicação não tem a taxa do trimestre que terminou a %s (só conhece taxas de %s a %s, com alguns meses em falta), por isso o valor fica no de antes dessa data. Indique o valor do AforroNet para o atualizar.",
			formatISODatePT(estimate.StoppedOn), formatMonthPT(estimate.RatesFrom), formatMonthPT(estimate.RatesThrough))
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
// the day of the last quarter it includes. It's refused when there's nothing to accept, which is now always
// the case for a certificate with an estimate, since that estimate is already the value that counts.
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
	if view.CountedInTotal {
		return nil, inputErrorf("o valor deste certificado já é calculado pela aplicação: não há estimativa para aceitar")
	}
	if len(view.Capitalisations) == 0 {
		return nil, inputErrorf("ainda não houve capitalização de juros desde o último valor do AforroNet")
	}
	last := view.Capitalisations[len(view.Capitalisations)-1]
	return &OtherAssetEntryInput{Date: last.Date, Kind: networth.KindValuation, Amount: view.ValueEUR, Note: AforroEstimateNote}, nil
}
