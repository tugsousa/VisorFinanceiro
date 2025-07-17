package ibkr

import (
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
)

// --- XML Data Structures ---

// FlexQueryResponse is the root element of the IBKR Flex Query report.
type FlexQueryResponse struct {
	XMLName        xml.Name        `xml:"FlexQueryResponse"`
	FlexStatements []FlexStatement `xml:"FlexStatements>FlexStatement"`
}

// FlexStatement contains all the data for a given account and period.
type FlexStatement struct {
	XMLName          xml.Name          `xml:"FlexStatement"`
	AccountId        string            `xml:"accountId,attr"`
	Trades           []Trade           `xml:"Trades>Trade"`
	CashTransactions []CashTransaction `xml:"CashTransactions>CashTransaction"`
}

// Trade represents a stock or option trade transaction.
type Trade struct {
	AssetCategory        string  `xml:"assetCategory,attr"`
	Symbol               string  `xml:"symbol,attr"`
	Description          string  `xml:"description,attr"`
	Conid                string  `xml:"conid,attr"`
	ISIN                 string  `xml:"isin,attr"`
	Multiplier           float64 `xml:"multiplier,attr"`
	DateTime             string  `xml:"dateTime,attr"`
	TradeDate            string  `xml:"tradeDate,attr"`
	Quantity             float64 `xml:"quantity,attr"`
	TradePrice           float64 `xml:"tradePrice,attr"`
	TradeMoney           float64 `xml:"tradeMoney,attr"`
	Currency             string  `xml:"currency,attr"`
	Exchange             string  `xml:"exchange,attr"`
	IBCommission         float64 `xml:"ibCommission,attr"`
	IBCommissionCurrency string  `xml:"ibCommissionCurrency,attr"`
	BuySell              string  `xml:"buySell,attr"`
	IBOrderID            string  `xml:"ibOrderID,attr"`
	PutCall              string  `xml:"putCall,attr"` // For Options
}

// CashTransaction represents dividends, withdrawals, deposits, and other cash movements.
type CashTransaction struct {
	Type          string  `xml:"type,attr"`
	Description   string  `xml:"description,attr"`
	DateTime      string  `xml:"dateTime,attr"`
	Amount        float64 `xml:"amount,attr"`
	Currency      string  `xml:"currency,attr"`
	LevelOfDetail string  `xml:"levelOfDetail,attr"`
	ISIN          string  `xml:"isin,attr"`
	Symbol        string  `xml:"symbol,attr"`
}

// --- IBKR Parser Implementation ---

// IBKRParser implements the parsers.Parser interface for IBKR Flex Query XML files.
type IBKRParser struct{}

// NewParser creates a new instance of the IBKRParser.
func NewParser() *IBKRParser {
	return &IBKRParser{}
}

// Parse reads an IBKR XML file and converts its rows into a slice of CanonicalTransaction.
func (p *IBKRParser) Parse(file io.Reader) ([]models.CanonicalTransaction, error) {
	var response FlexQueryResponse
	decoder := xml.NewDecoder(file)
	if err := decoder.Decode(&response); err != nil {
		return nil, fmt.Errorf("ibkr parser: failed to decode XML: %w", err)
	}

	var canonicalTxs []models.CanonicalTransaction

	for _, stmt := range response.FlexStatements {
		// Process Trades (Stocks and Options)
		for _, trade := range stmt.Trades {
			// As requested, ignore internal currency exchange transactions
			if trade.Exchange == "IDEALFX" {
				continue
			}

			tx, err := p.processTrade(trade)
			if err != nil {
				logger.L.Warn("IBKR Parser: Skipping trade due to processing error", "ibOrderID", trade.IBOrderID, "error", err)
				continue
			}
			canonicalTxs = append(canonicalTxs, tx)
		}

		// Process Cash Transactions (Dividends, Deposits, etc.)
		for _, cashTx := range stmt.CashTransactions {
			// Only process detailed transactions to avoid duplicates from summaries
			if cashTx.LevelOfDetail != "DETAIL" {
				continue
			}

			// Check transaction type
			switch cashTx.Type {
			case "Dividends":
				tx, err := p.processDividend(cashTx)
				if err != nil {
					logger.L.Warn("IBKR Parser: Skipping dividend due to processing error", "description", cashTx.Description, "error", err)
					continue
				}
				canonicalTxs = append(canonicalTxs, tx)
			case "Deposits/Withdrawals":
				tx, err := p.processCashMovement(cashTx)
				if err != nil {
					logger.L.Warn("IBKR Parser: Skipping cash movement due to processing error", "description", cashTx.Description, "error", err)
					continue
				}
				canonicalTxs = append(canonicalTxs, tx)
			}
		}
	}

	return canonicalTxs, nil
}

// processTrade converts an IBKR Trade record to a CanonicalTransaction.
func (p *IBKRParser) processTrade(trade Trade) (models.CanonicalTransaction, error) {
	date, err := parseIBKRDateTime(trade.DateTime)
	if err != nil {
		return models.CanonicalTransaction{}, err
	}

	tx := models.CanonicalTransaction{
		Source:          "ibkr",
		TransactionDate: date,
		ProductName:     trade.Description,
		ISIN:            trade.ISIN,
		Quantity:        math.Abs(trade.Quantity),
		Price:           trade.TradePrice,
		Commission:      math.Abs(trade.IBCommission),
		Currency:        trade.Currency,
		OrderID:         fmt.Sprintf("%s", trade.IBOrderID),
		RawText:         fmt.Sprintf("%s %f %s @ %f", trade.BuySell, trade.Quantity, trade.Symbol, trade.TradePrice),
		SourceAmount:    trade.TradeMoney,
		Amount:          -trade.TradeMoney, // IBKR tradeMoney is positive for BUY (cost), negative for SELL (proceeds). We invert for our model.
		BuySell:         trade.BuySell,
	}

	if trade.AssetCategory == "STK" {
		tx.TransactionType = "STOCK"
	} else if trade.AssetCategory == "OPT" {
		tx.TransactionType = "OPTION"
		if trade.PutCall == "P" {
			tx.TransactionSubType = "PUT"
		} else if trade.PutCall == "C" {
			tx.TransactionSubType = "CALL"
		}
	} else {
		tx.TransactionType = strings.ToUpper(trade.AssetCategory)
	}

	return tx, nil
}

// processDividend converts an IBKR Dividend CashTransaction to a CanonicalTransaction.
func (p *IBKRParser) processDividend(cashTx CashTransaction) (models.CanonicalTransaction, error) {
	date, err := parseIBKRDateTime(cashTx.DateTime)
	if err != nil {
		return models.CanonicalTransaction{}, err
	}

	// Note: IBKR reports do not always separate withholding tax into a distinct transaction.
	// We are treating the dividend amount as the gross amount received. If tax is withheld,
	// it might be a negative dividend transaction or require manual adjustment based on full statements.
	tx := models.CanonicalTransaction{
		Source:          "ibkr",
		TransactionDate: date,
		ProductName:     cashTx.Symbol,
		ISIN:            cashTx.ISIN,
		Amount:          cashTx.Amount, // Dividends are positive income.
		SourceAmount:    cashTx.Amount,
		Currency:        cashTx.Currency,
		RawText:         cashTx.Description,
		TransactionType: "DIVIDEND",
	}
	return tx, nil
}

// processCashMovement converts a Deposit/Withdrawal to a CanonicalTransaction.
func (p *IBKRParser) processCashMovement(cashTx CashTransaction) (models.CanonicalTransaction, error) {
	date, err := parseIBKRDateTime(cashTx.DateTime)
	if err != nil {
		return models.CanonicalTransaction{}, err
	}

	tx := models.CanonicalTransaction{
		Source:          "ibkr",
		TransactionDate: date,
		ProductName:     "Cash Transfer",
		Amount:          cashTx.Amount,
		SourceAmount:    cashTx.Amount,
		Currency:        cashTx.Currency,
		RawText:         cashTx.Description,
		TransactionType: "CASH",
	}

	if cashTx.Amount > 0 {
		tx.TransactionSubType = "DEPOSIT"
	} else {
		tx.TransactionSubType = "WITHDRAWAL"
	}
	return tx, nil
}

// parseIBKRDateTime converts IBKR's "YYYYMMDD;HHMMSS" format to time.Time.
func parseIBKRDateTime(datetime string) (time.Time, error) {
	// Handle cases with and without time
	layout := "20060102;150405"
	if !strings.Contains(datetime, ";") {
		layout = "20060102"
	}

	t, err := time.Parse(layout, datetime)
	if err != nil {
		return time.Time{}, fmt.Errorf("could not parse ibkr datetime '%s': %w", datetime, err)
	}
	return t, nil
}

// Helper to convert string to float64, returning 0 on error.
func parseFloat(s string) float64 {
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}
