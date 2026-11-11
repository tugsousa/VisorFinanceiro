package services

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/networth"
)

// NetWorthService manages the savings and assets the user keeps outside the brokers (other assets) and adds
// them to the broker portfolios to give the total net worth. Other assets belong to the user, not to a
// portfolio, so they never change a portfolio's returns, history or IRS.
type NetWorthService interface {
	ListOtherAssets(userID int64) ([]OtherAsset, error)
	CreateOtherAsset(userID int64, in OtherAssetInput) (*OtherAsset, error)
	UpdateOtherAsset(userID int64, assetID int64, in OtherAssetInput) (*OtherAsset, error)
	DeleteOtherAsset(userID int64, assetID int64) error
	AddOtherAssetEntry(userID int64, assetID int64, in OtherAssetEntryInput) (*OtherAssetEntry, error)
	DeleteOtherAssetEntry(userID int64, assetID int64, entryID int64) error
	GetNetWorth(userID int64) (*NetWorth, error)
}

var (
	// ErrOtherAssetNotFound is returned for an asset or entry that doesn't exist or isn't the user's.
	ErrOtherAssetNotFound = errors.New("ativo não encontrado")
	// ErrOtherAssetInput is matched (errors.Is) by the errors about invalid input; their message is for the user.
	ErrOtherAssetInput = errors.New("dados inválidos")
)

type otherAssetInputError string

func (e otherAssetInputError) Error() string        { return string(e) }
func (e otherAssetInputError) Is(target error) bool { return target == ErrOtherAssetInput }

func inputErrorf(format string, args ...any) error {
	return otherAssetInputError(fmt.Sprintf(format, args...))
}

const (
	maxAssetNameLength = 100
	maxEntryNoteLength = 200
)

// OtherAssetDetails is what a type needs beyond the common fields, stored as JSON in other_assets.details.
// A term deposit uses the first four fields; its start date is the asset's opened_at. Property uses the rest,
// all optional; its purchase date is the asset's opened_at, and its market value comes from the valuations.
type OtherAssetDetails struct {
	Principal      float64 `json:"principal,omitempty"`
	RatePct        float64 `json:"rate_pct,omitempty"` // TANB, in %
	Maturity       string  `json:"maturity,omitempty"` // YYYY-MM-DD
	Capitalisation string  `json:"capitalisation,omitempty"`

	Usage               string  `json:"usage,omitempty"` // own_home, rented, holiday, land, other
	PurchasePrice       float64 `json:"purchase_price,omitempty"`
	PurchaseCosts       float64 `json:"purchase_costs,omitempty"`        // IMT, Imposto do Selo, escritura…
	MortgageBalance     float64 `json:"mortgage_balance,omitempty"`      // capital em dívida
	MortgageBalanceDate string  `json:"mortgage_balance_date,omitempty"` // YYYY-MM-DD
	MortgageRatePct     float64 `json:"mortgage_rate_pct,omitempty"`     // TAN, in %
	MortgagePayment     float64 `json:"mortgage_payment,omitempty"`      // prestação mensal
	MonthlyRent         float64 `json:"monthly_rent,omitempty"`
	AnnualCosts         float64 `json:"annual_costs,omitempty"` // IMI, condomínio, seguros, manutenção
}

// hasMortgage says whether the property details describe a mortgage.
func (d *OtherAssetDetails) hasMortgage() bool {
	return d != nil && (d.MortgageBalance > 0 || d.MortgageBalanceDate != "" || d.MortgagePayment > 0)
}

// OtherAssetEntry is a contribution, withdrawal, valuation or interest payment of an asset.
type OtherAssetEntry struct {
	ID       int64    `json:"id"`
	Date     string   `json:"date"` // YYYY-MM-DD
	Kind     string   `json:"kind"`
	Amount   float64  `json:"amount"`
	Quantity *float64 `json:"quantity,omitempty"`
	Note     string   `json:"note,omitempty"`
}

// OtherAsset is an asset with its value today. ValueEUR is the value that counts for the net worth: for a term
// deposit it's net of the tax withheld on the interest, and GrossValueEUR is before it; for property it's the
// equity (market value minus the mortgage), and GrossValueEUR is the market value.
type OtherAsset struct {
	DebtEUR    float64                     `json:"debt_eur,omitempty"`
	RealEstate *networth.RealEstateMetrics `json:"real_estate,omitempty"`

	ID                int64              `json:"id"`
	Type              string             `json:"type"`
	Name              string             `json:"name"`
	Currency          string             `json:"currency"`
	Details           *OtherAssetDetails `json:"details,omitempty"`
	OpenedAt          string             `json:"opened_at,omitempty"`
	ClosedAt          string             `json:"closed_at,omitempty"`
	ValueEUR          float64            `json:"value_eur"`
	GrossValueEUR     float64            `json:"gross_value_eur"`
	InterestGrossEUR  float64            `json:"interest_gross_eur,omitempty"`
	InterestNetEUR    float64            `json:"interest_net_eur,omitempty"`
	Matured           bool               `json:"matured,omitempty"`
	LastValuationDate string             `json:"last_valuation_date,omitempty"`
	Entries           []OtherAssetEntry  `json:"entries"`
}

// OtherAssetInput creates or updates an asset. InitialValue (manual types, creation only) adds a valuation
// on InitialDate, today by default. The type of an existing asset can't be changed.
type OtherAssetInput struct {
	Type         string             `json:"type"`
	Name         string             `json:"name"`
	Currency     string             `json:"currency"`
	OpenedAt     string             `json:"opened_at"`
	ClosedAt     string             `json:"closed_at"`
	Details      *OtherAssetDetails `json:"details"`
	InitialValue *float64           `json:"initial_value"`
	InitialDate  string             `json:"initial_date"`
}

// OtherAssetEntryInput adds an entry to a manual asset.
type OtherAssetEntryInput struct {
	Date   string  `json:"date"`
	Kind   string  `json:"kind"`
	Amount float64 `json:"amount"`
	Note   string  `json:"note"`
}

// NetWorthPortfolio is a broker portfolio valued now, as on the dashboard: holdings at market price (at cost
// where there's no price) plus cash.
type NetWorthPortfolio struct {
	ID               int64   `json:"id"`
	Name             string  `json:"name"`
	HoldingsEUR      float64 `json:"holdings_eur"`
	CashEUR          float64 `json:"cash_eur"`
	TotalEUR         float64 `json:"total_eur"`
	UnpricedHoldings int     `json:"unpriced_holdings,omitempty"`
}

// NetWorth is the total net worth: every broker portfolio of the user plus the other assets.
type NetWorth struct {
	AsOf           string                  `json:"as_of"` // YYYY-MM-DD
	TotalEUR       float64                 `json:"total_eur"`
	PortfoliosEUR  float64                 `json:"portfolios_eur"`
	OtherAssetsEUR float64                 `json:"other_assets_eur"`
	DebtEUR        float64                 `json:"debt_eur"` // mortgages, already deducted from OtherAssetsEUR
	MonthChangeEUR *float64                `json:"month_change_eur"`
	ByType         []networth.TypeTotal    `json:"by_type"`
	Portfolios     []NetWorthPortfolio     `json:"portfolios"`
	Assets         []OtherAsset            `json:"assets"`
	History        []networth.HistoryPoint `json:"history"`
}

// --- Reading ---

func (s *uploadServiceImpl) ListOtherAssets(userID int64) ([]OtherAsset, error) {
	assets, err := loadOtherAssets(userID, 0)
	if err != nil {
		return nil, err
	}
	now := today()
	for i := range assets {
		v, err := toValuationAsset(assets[i])
		if err != nil {
			return nil, err
		}
		fillValue(&assets[i], v.ValueOn(now), now)
	}
	return assets, nil
}

// loadOtherAssets reads the user's assets with their entries; only the asset assetID when it isn't 0.
func loadOtherAssets(userID int64, assetID int64) ([]OtherAsset, error) {
	query := `SELECT id, type, name, currency, COALESCE(details, ''), COALESCE(opened_at, ''), COALESCE(closed_at, '')
		FROM other_assets WHERE user_id = ?`
	args := []any{userID}
	if assetID != 0 {
		query += " AND id = ?"
		args = append(args, assetID)
	}
	rows, err := database.DB.Query(query+" ORDER BY type, name, id", args...)
	if err != nil {
		return nil, fmt.Errorf("failed to read the other assets: %w", err)
	}
	defer rows.Close()

	assets := []OtherAsset{}
	index := map[int64]int{}
	for rows.Next() {
		var a OtherAsset
		var details string
		if err := rows.Scan(&a.ID, &a.Type, &a.Name, &a.Currency, &details, &a.OpenedAt, &a.ClosedAt); err != nil {
			return nil, fmt.Errorf("failed to read the other assets: %w", err)
		}
		if details != "" {
			a.Details = &OtherAssetDetails{}
			if err := json.Unmarshal([]byte(details), a.Details); err != nil {
				return nil, fmt.Errorf("asset %d has invalid details: %w", a.ID, err)
			}
		}
		a.Entries = []OtherAssetEntry{}
		index[a.ID] = len(assets)
		assets = append(assets, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read the other assets: %w", err)
	}
	rows.Close()
	if len(assets) == 0 {
		return assets, nil
	}

	entryQuery := `SELECT e.asset_id, e.id, e.date, e.kind, e.amount, e.quantity, COALESCE(e.note, '')
		FROM other_asset_entries e JOIN other_assets a ON a.id = e.asset_id
		WHERE a.user_id = ?`
	entryArgs := []any{userID}
	if assetID != 0 {
		entryQuery += " AND a.id = ?"
		entryArgs = append(entryArgs, assetID)
	}
	entryRows, err := database.DB.Query(entryQuery+" ORDER BY e.date, e.id", entryArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to read the entries of the other assets: %w", err)
	}
	defer entryRows.Close()
	for entryRows.Next() {
		var owner int64
		var e OtherAssetEntry
		var quantity sql.NullFloat64
		if err := entryRows.Scan(&owner, &e.ID, &e.Date, &e.Kind, &e.Amount, &quantity, &e.Note); err != nil {
			return nil, fmt.Errorf("failed to read the entries of the other assets: %w", err)
		}
		if quantity.Valid {
			q := quantity.Float64
			e.Quantity = &q
		}
		if i, ok := index[owner]; ok {
			assets[i].Entries = append(assets[i].Entries, e)
		}
	}
	return assets, entryRows.Err()
}

// toValuationAsset converts a stored asset into what the networth package values.
func toValuationAsset(a OtherAsset) (networth.Asset, error) {
	v := networth.Asset{ID: a.ID, Type: a.Type, Name: a.Name}
	if a.ClosedAt != "" {
		closed, err := networth.ParseDate(a.ClosedAt)
		if err != nil {
			return v, fmt.Errorf("asset %d: %w", a.ID, err)
		}
		v.ClosedAt = &closed
	}
	if a.Type == networth.TypeTermDeposit {
		deposit, err := termDepositOf(a.OpenedAt, a.Details)
		if err != nil {
			return v, fmt.Errorf("asset %d: %w", a.ID, err)
		}
		v.Deposit = &deposit
		return v, nil
	}
	if a.Type == networth.TypeRealEstate && a.Details.hasMortgage() {
		mortgage, err := mortgageOf(a.Details)
		if err != nil {
			return v, fmt.Errorf("asset %d: %w", a.ID, err)
		}
		v.Mortgage = &mortgage
	}
	for _, e := range a.Entries {
		date, err := networth.ParseDate(e.Date)
		if err != nil {
			return v, fmt.Errorf("asset %d: %w", a.ID, err)
		}
		v.Entries = append(v.Entries, networth.Entry{ID: e.ID, Date: date, Kind: e.Kind, Amount: e.Amount})
	}
	return v, nil
}

func termDepositOf(openedAt string, details *OtherAssetDetails) (networth.TermDeposit, error) {
	if details == nil {
		return networth.TermDeposit{}, inputErrorf("faltam os dados do depósito a prazo")
	}
	if openedAt == "" {
		return networth.TermDeposit{}, inputErrorf("falta a data de início")
	}
	start, err := networth.ParseDate(openedAt)
	if err != nil {
		return networth.TermDeposit{}, otherAssetInputError(err.Error())
	}
	if details.Maturity == "" {
		return networth.TermDeposit{}, inputErrorf("falta a data de vencimento")
	}
	maturity, err := networth.ParseDate(details.Maturity)
	if err != nil {
		return networth.TermDeposit{}, otherAssetInputError(err.Error())
	}
	deposit := networth.TermDeposit{
		Principal:      details.Principal,
		RatePct:        details.RatePct,
		Start:          start,
		Maturity:       maturity,
		Capitalisation: details.Capitalisation,
	}
	if err := deposit.Validate(); err != nil {
		return deposit, otherAssetInputError(err.Error())
	}
	return deposit, nil
}

func mortgageOf(details *OtherAssetDetails) (networth.Mortgage, error) {
	if details.MortgageBalanceDate == "" {
		return networth.Mortgage{}, inputErrorf("indique a data do capital em dívida")
	}
	date, err := networth.ParseDate(details.MortgageBalanceDate)
	if err != nil {
		return networth.Mortgage{}, otherAssetInputError(err.Error())
	}
	m := networth.Mortgage{
		Balance:        details.MortgageBalance,
		BalanceDate:    date,
		RatePct:        details.MortgageRatePct,
		MonthlyPayment: details.MortgagePayment,
	}
	if err := m.Validate(); err != nil {
		return m, otherAssetInputError(err.Error())
	}
	return m, nil
}

func realEstateOf(details *OtherAssetDetails) networth.RealEstate {
	if details == nil {
		return networth.RealEstate{}
	}
	return networth.RealEstate{
		Usage:          details.Usage,
		PurchasePrice:  details.PurchasePrice,
		PurchaseCosts:  details.PurchaseCosts,
		MonthlyRent:    details.MonthlyRent,
		AnnualCosts:    details.AnnualCosts,
		MonthlyPayment: details.MortgagePayment,
	}
}

func fillValue(a *OtherAsset, v networth.Value, now time.Time) {
	a.ValueEUR = round2(v.Net)
	a.GrossValueEUR = round2(v.Gross)
	if a.Type == networth.TypeRealEstate && v.Exists {
		a.DebtEUR = round2(v.Debt)
		metrics := realEstateOf(a.Details).Metrics(v.Gross, v.Debt)
		a.RealEstate = &metrics
	}
	if a.Type == networth.TypeTermDeposit {
		a.InterestGrossEUR = round2(v.InterestGross)
		a.InterestNetEUR = round2(v.InterestNet)
		if a.Details != nil && a.Details.Maturity != "" && a.Details.Maturity <= now.Format(networth.DateLayout) {
			a.Matured = true
		}
	}
	for _, e := range a.Entries {
		if e.Kind == networth.KindValuation && e.Date > a.LastValuationDate {
			a.LastValuationDate = e.Date
		}
	}
}

// --- Writing ---

func (s *uploadServiceImpl) CreateOtherAsset(userID int64, in OtherAssetInput) (*OtherAsset, error) {
	in.Type = strings.TrimSpace(in.Type)
	if !networth.IsSupportedType(in.Type) {
		return nil, inputErrorf("tipo de ativo desconhecido: %q", in.Type)
	}
	fields, err := validateAssetFields(in.Type, in)
	if err != nil {
		return nil, err
	}

	var initial *OtherAssetEntryInput
	if in.InitialValue != nil && networth.IsManualType(in.Type) {
		date := in.InitialDate
		if date == "" {
			date = today().Format(networth.DateLayout)
		}
		initial = &OtherAssetEntryInput{Date: date, Kind: networth.KindValuation, Amount: *in.InitialValue}
		if err := validateEntry(*initial); err != nil {
			return nil, err
		}
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`INSERT INTO other_assets (user_id, type, name, currency, details, opened_at, closed_at)
		VALUES (?, ?, ?, 'EUR', ?, ?, ?)`, userID, in.Type, fields.name, fields.details, fields.openedAt, fields.closedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create the asset: %w", err)
	}
	assetID, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	if initial != nil {
		if _, err := tx.Exec(`INSERT INTO other_asset_entries (asset_id, date, kind, amount) VALUES (?, ?, ?, ?)`,
			assetID, initial.Date, initial.Kind, initial.Amount); err != nil {
			return nil, fmt.Errorf("failed to store the initial value: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.getOtherAsset(userID, assetID)
}

func (s *uploadServiceImpl) UpdateOtherAsset(userID int64, assetID int64, in OtherAssetInput) (*OtherAsset, error) {
	var storedType string
	err := database.DB.QueryRow("SELECT type FROM other_assets WHERE id = ? AND user_id = ?", assetID, userID).Scan(&storedType)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrOtherAssetNotFound
	}
	if err != nil {
		return nil, err
	}
	if t := strings.TrimSpace(in.Type); t != "" && t != storedType {
		return nil, inputErrorf("não é possível mudar o tipo de um ativo")
	}
	fields, err := validateAssetFields(storedType, in)
	if err != nil {
		return nil, err
	}
	_, err = database.DB.Exec(`UPDATE other_assets SET name = ?, details = ?, opened_at = ?, closed_at = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND user_id = ?`, fields.name, fields.details, fields.openedAt, fields.closedAt, assetID, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to update the asset: %w", err)
	}
	return s.getOtherAsset(userID, assetID)
}

func (s *uploadServiceImpl) DeleteOtherAsset(userID int64, assetID int64) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// The entries would go with the asset (ON DELETE CASCADE), but only while foreign keys are enforced.
	if _, err := tx.Exec(`DELETE FROM other_asset_entries WHERE asset_id IN (SELECT id FROM other_assets WHERE id = ? AND user_id = ?)`,
		assetID, userID); err != nil {
		return fmt.Errorf("failed to delete the entries: %w", err)
	}
	result, err := tx.Exec("DELETE FROM other_assets WHERE id = ? AND user_id = ?", assetID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete the asset: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrOtherAssetNotFound
	}
	return tx.Commit()
}

func (s *uploadServiceImpl) AddOtherAssetEntry(userID int64, assetID int64, in OtherAssetEntryInput) (*OtherAssetEntry, error) {
	var assetType string
	err := database.DB.QueryRow("SELECT type FROM other_assets WHERE id = ? AND user_id = ?", assetID, userID).Scan(&assetType)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrOtherAssetNotFound
	}
	if err != nil {
		return nil, err
	}
	if !networth.IsManualType(assetType) {
		return nil, inputErrorf("o valor de um depósito a prazo é calculado a partir do capital e da taxa; altere os dados do depósito")
	}
	in.Kind = strings.TrimSpace(in.Kind)
	in.Note = strings.TrimSpace(in.Note)
	if err := validateEntry(in); err != nil {
		return nil, err
	}
	result, err := database.DB.Exec(`INSERT INTO other_asset_entries (asset_id, date, kind, amount, note) VALUES (?, ?, ?, ?, ?)`,
		assetID, in.Date, in.Kind, in.Amount, nullIfEmpty(in.Note))
	if err != nil {
		return nil, fmt.Errorf("failed to add the entry: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	database.DB.Exec("UPDATE other_assets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", assetID)
	return &OtherAssetEntry{ID: id, Date: in.Date, Kind: in.Kind, Amount: in.Amount, Note: in.Note}, nil
}

func (s *uploadServiceImpl) DeleteOtherAssetEntry(userID int64, assetID int64, entryID int64) error {
	result, err := database.DB.Exec(`DELETE FROM other_asset_entries
		WHERE id = ? AND asset_id IN (SELECT id FROM other_assets WHERE id = ? AND user_id = ?)`, entryID, assetID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete the entry: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrOtherAssetNotFound
	}
	return nil
}

func (s *uploadServiceImpl) getOtherAsset(userID int64, assetID int64) (*OtherAsset, error) {
	assets, err := loadOtherAssets(userID, assetID)
	if err != nil {
		return nil, err
	}
	if len(assets) == 0 {
		return nil, ErrOtherAssetNotFound
	}
	a := assets[0]
	v, err := toValuationAsset(a)
	if err != nil {
		return nil, err
	}
	now := today()
	fillValue(&a, v.ValueOn(now), now)
	return &a, nil
}

type assetFields struct {
	name     string
	details  any // JSON text or nil
	openedAt any // YYYY-MM-DD or nil
	closedAt any
}

// validateAssetFields checks the common fields and the details the type needs, and returns what to store.
func validateAssetFields(assetType string, in OtherAssetInput) (assetFields, error) {
	var fields assetFields
	fields.name = strings.TrimSpace(in.Name)
	if fields.name == "" {
		return fields, inputErrorf("o nome é obrigatório")
	}
	if len([]rune(fields.name)) > maxAssetNameLength {
		return fields, inputErrorf("o nome pode ter até %d caracteres", maxAssetNameLength)
	}
	if c := strings.ToUpper(strings.TrimSpace(in.Currency)); c != "" && c != "EUR" {
		return fields, inputErrorf("por agora só são suportados ativos em EUR")
	}

	in.OpenedAt = strings.TrimSpace(in.OpenedAt)
	in.ClosedAt = strings.TrimSpace(in.ClosedAt)
	var opened, closed time.Time
	var err error
	if in.OpenedAt != "" {
		if opened, err = networth.ParseDate(in.OpenedAt); err != nil {
			return fields, otherAssetInputError(err.Error())
		}
		fields.openedAt = in.OpenedAt
	}
	if in.ClosedAt != "" {
		if closed, err = networth.ParseDate(in.ClosedAt); err != nil {
			return fields, otherAssetInputError(err.Error())
		}
		if !opened.IsZero() && closed.Before(opened) {
			return fields, inputErrorf("a data de fecho não pode ser anterior à data de abertura")
		}
		fields.closedAt = in.ClosedAt
	}

	if assetType == networth.TypeTermDeposit {
		if _, err := termDepositOf(in.OpenedAt, in.Details); err != nil {
			return fields, err
		}
		details := OtherAssetDetails{
			Principal:      in.Details.Principal,
			RatePct:        in.Details.RatePct,
			Maturity:       in.Details.Maturity,
			Capitalisation: in.Details.Capitalisation,
		}
		text, err := json.Marshal(details)
		if err != nil {
			return fields, err
		}
		fields.details = string(text)
	}

	if assetType == networth.TypeRealEstate && in.Details != nil {
		d := *in.Details
		details := OtherAssetDetails{
			Usage:           strings.TrimSpace(d.Usage),
			PurchasePrice:   d.PurchasePrice,
			PurchaseCosts:   d.PurchaseCosts,
			MortgageBalance: d.MortgageBalance,
			MortgageRatePct: d.MortgageRatePct,
			MortgagePayment: d.MortgagePayment,
			MonthlyRent:     d.MonthlyRent,
			AnnualCosts:     d.AnnualCosts,
		}
		details.MortgageBalanceDate = strings.TrimSpace(d.MortgageBalanceDate)
		if !networth.IsValidUsage(details.Usage) {
			return fields, inputErrorf("uso do imóvel desconhecido: %q", details.Usage)
		}
		for label, amount := range map[string]float64{
			"o preço de compra": details.PurchasePrice, "os custos de aquisição": details.PurchaseCosts,
			"a renda": details.MonthlyRent, "as despesas anuais": details.AnnualCosts,
		} {
			if amount < 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
				return fields, inputErrorf("%s não pode ser negativo", label)
			}
		}
		if details.hasMortgage() {
			if _, err := mortgageOf(&details); err != nil {
				return fields, err
			}
		}
		text, err := json.Marshal(details)
		if err != nil {
			return fields, err
		}
		if string(text) != "{}" {
			fields.details = string(text)
		}
	}
	return fields, nil
}

func validateEntry(in OtherAssetEntryInput) error {
	if !networth.IsValidKind(in.Kind) {
		return inputErrorf("tipo de movimento desconhecido: %q", in.Kind)
	}
	date, err := networth.ParseDate(strings.TrimSpace(in.Date))
	if err != nil {
		return otherAssetInputError(err.Error())
	}
	if date.After(today()) {
		return inputErrorf("a data não pode ser futura")
	}
	if math.IsNaN(in.Amount) || math.IsInf(in.Amount, 0) || in.Amount < 0 {
		return inputErrorf("o valor não pode ser negativo")
	}
	if in.Kind != networth.KindValuation && in.Amount == 0 {
		return inputErrorf("o valor tem de ser maior que zero")
	}
	if len([]rune(in.Note)) > maxEntryNoteLength {
		return inputErrorf("a nota pode ter até %d caracteres", maxEntryNoteLength)
	}
	return nil
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func nullIfEmpty(text string) any {
	if text == "" {
		return nil
	}
	return text
}

// --- Net worth ---

// portfolioValuer values a broker portfolio now; the upload service in the app, a stub in tests.
type portfolioValuer interface {
	GetCurrentHoldingsWithValue(userID int64, portfolioID int64) ([]models.HoldingWithValue, error)
	GetCurrentCashBalance(userID int64, portfolioID int64) (float64, error)
}

func (s *uploadServiceImpl) GetNetWorth(userID int64) (*NetWorth, error) {
	return buildNetWorth(userID, s, today())
}

// buildNetWorth reads every portfolio and other asset of the user and adds them up. It only reads: the
// portfolios' figures and snapshots are used as they are.
func buildNetWorth(userID int64, valuer portfolioValuer, now time.Time) (*NetWorth, error) {
	rows, err := database.DB.Query("SELECT id, name FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, name ASC", userID)
	if err != nil {
		return nil, fmt.Errorf("failed to read the portfolios: %w", err)
	}
	var portfolioRows []NetWorthPortfolio
	for rows.Next() {
		var p NetWorthPortfolio
		if err := rows.Scan(&p.ID, &p.Name); err != nil {
			rows.Close()
			return nil, fmt.Errorf("failed to read the portfolios: %w", err)
		}
		portfolioRows = append(portfolioRows, p)
	}
	rows.Close()

	portfolios := make([]networth.Portfolio, 0, len(portfolioRows))
	for i := range portfolioRows {
		p := &portfolioRows[i]
		holdings, err := valuer.GetCurrentHoldingsWithValue(userID, p.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to value portfolio %q: %w", p.Name, err)
		}
		for _, h := range holdings {
			if h.Status == "OK" {
				p.HoldingsEUR += h.MarketValueEUR
			} else {
				// Valued at cost, as on the dashboard and in the portfolio history.
				p.HoldingsEUR += math.Abs(h.TotalCostBasisEUR)
				if h.Quantity > 0 {
					p.UnpricedHoldings++
				}
			}
		}
		if p.CashEUR, err = valuer.GetCurrentCashBalance(userID, p.ID); err != nil {
			return nil, fmt.Errorf("failed to read the cash of portfolio %q: %w", p.Name, err)
		}
		portfolios = append(portfolios, networth.Portfolio{ID: p.ID, Name: p.Name, HoldingsEUR: p.HoldingsEUR, CashEUR: p.CashEUR})
		p.HoldingsEUR = round2(p.HoldingsEUR)
		p.CashEUR = round2(p.CashEUR)
		p.TotalEUR = round2(p.HoldingsEUR + p.CashEUR)
	}

	snapshots, err := loadNetWorthSnapshots(userID)
	if err != nil {
		return nil, err
	}

	stored, err := loadOtherAssets(userID, 0)
	if err != nil {
		return nil, err
	}
	assets := make([]networth.Asset, 0, len(stored))
	for _, a := range stored {
		v, err := toValuationAsset(a)
		if err != nil {
			return nil, err
		}
		assets = append(assets, v)
	}

	summary := networth.Summarize(portfolios, assets, snapshots, now)
	for i := range stored {
		fillValue(&stored[i], summary.AssetValues[stored[i].ID], now)
	}
	if portfolioRows == nil {
		portfolioRows = []NetWorthPortfolio{}
	}
	return &NetWorth{
		AsOf:           now.Format(networth.DateLayout),
		TotalEUR:       summary.TotalEUR,
		PortfoliosEUR:  summary.PortfoliosEUR,
		OtherAssetsEUR: summary.OtherAssetsEUR,
		DebtEUR:        summary.DebtEUR,
		MonthChangeEUR: summary.MonthChangeEUR,
		ByType:         summary.ByType,
		Portfolios:     portfolioRows,
		Assets:         stored,
		History:        summary.History,
	}, nil
}

// loadNetWorthSnapshots reads the daily value (holdings and cash) of each of the user's portfolios.
func loadNetWorthSnapshots(userID int64) ([]networth.Snapshot, error) {
	rows, err := database.DB.Query(`SELECT s.portfolio_id, s.date, COALESCE(s.total_equity, 0)
		FROM portfolio_snapshots s JOIN portfolios p ON p.id = s.portfolio_id AND p.user_id = s.user_id
		WHERE s.user_id = ? ORDER BY s.portfolio_id, s.date`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to read the portfolio snapshots: %w", err)
	}
	defer rows.Close()
	var snapshots []networth.Snapshot
	for rows.Next() {
		var s networth.Snapshot
		var date string
		if err := rows.Scan(&s.PortfolioID, &date, &s.ValueEUR); err != nil {
			return nil, fmt.Errorf("failed to read the portfolio snapshots: %w", err)
		}
		if s.Date, err = networth.ParseDate(date); err != nil {
			continue
		}
		snapshots = append(snapshots, s)
	}
	return snapshots, rows.Err()
}
