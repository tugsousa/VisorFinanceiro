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
	UnderlyingSecurityID string  `xml:"underlyingSecurityID,attr"`
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
type IBKRParser struct {
	skipped models.SkippedRows
}

// NewParser creates a new instance of the IBKRParser.
func NewParser() *IBKRParser {
	return &IBKRParser{}
}

// SkippedRows describes the rows of the parsed file that weren't imported.
func (p *IBKRParser) SkippedRows() []string {
	return p.skipped.Messages()
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
		statementStart := len(canonicalTxs)

		// Process Trades (Stocks and Options)
		for _, trade := range stmt.Trades {
			// As requested, ignore internal currency exchange transactions
			if trade.Exchange == "IDEALFX" {
				continue
			}

			tx, err := p.processTrade(trade)
			if err != nil {
				logger.L.Warn("IBKR Parser: Skipping trade due to processing error", "ibOrderID", trade.IBOrderID, "error", err)
				p.skipped.Add("Operação com data inválida")
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
			case "Dividends", "Payment In Lieu Of Dividends":
				tx, err := p.processDividend(cashTx)
				if err != nil {
					logger.L.Warn("IBKR Parser: Skipping dividend due to processing error", "description", cashTx.Description, "error", err)
					p.skipped.Add(cashTx.Type + " com data inválida")
					continue
				}
				canonicalTxs = append(canonicalTxs, tx)
			case "Withholding Tax":
				// Withholding on other income, such as credit interest, is not dividend tax.
				if !strings.Contains(strings.ToUpper(cashTx.Description), "DIVIDEND") {
					p.skipped.Add("Withholding Tax sobre outros rendimentos")
					continue
				}
				tx, err := p.processDividendTax(cashTx)
				if err != nil {
					logger.L.Warn("IBKR Parser: Skipping dividend tax due to processing error", "description", cashTx.Description, "error", err)
					p.skipped.Add(cashTx.Type + " com data inválida")
					continue
				}
				canonicalTxs = append(canonicalTxs, tx)
			case "Deposits/Withdrawals":
				tx, err := p.processCashMovement(cashTx)
				if err != nil {
					logger.L.Warn("IBKR Parser: Skipping cash movement due to processing error", "description", cashTx.Description, "error", err)
					p.skipped.Add(cashTx.Type + " com data inválida")
					continue
				}
				canonicalTxs = append(canonicalTxs, tx)
			case "Broker Interest Paid", "Broker Fees", "Other Fees", "Advisor Fees", "Commission Adjustments":
				tx, err := p.processFee(cashTx)
				if err != nil {
					logger.L.Warn("IBKR Parser: Skipping fee due to processing error", "description", cashTx.Description, "error", err)
					p.skipped.Add(cashTx.Type + " com data inválida")
					continue
				}
				canonicalTxs = append(canonicalTxs, tx)
			default:
				// Such as interest received, which the reports have no place for yet.
				p.skipped.Add(cashTx.Type)
			}
		}

		numberRepeatedRows(canonicalTxs[statementStart:])
	}

	return canonicalTxs, nil
}

// numberRepeatedRows appends an occurrence number to rows of a statement with identical raw text,
// such as fills of an order in the same second at the same price and quantity. These are separate
// transactions, but the database would discard them as duplicates because the hash uses the raw text.
func numberRepeatedRows(txs []models.CanonicalTransaction) {
	occurrences := make(map[string]int)
	for i := range txs {
		occurrences[txs[i].RawText]++
		if n := occurrences[txs[i].RawText]; n > 1 {
			txs[i].RawText = fmt.Sprintf("%s|%d", txs[i].RawText, n)
		}
	}
}

// processTrade converts an IBKR Trade record to a CanonicalTransaction.
func (p *IBKRParser) processTrade(trade Trade) (models.CanonicalTransaction, error) {
	date, err := parseIBKRDateTime(trade.DateTime)
	if err != nil {
		return models.CanonicalTransaction{}, err
	}

	var finalISIN string
	if trade.AssetCategory == "OPT" && trade.UnderlyingSecurityID != "" {
		finalISIN = trade.UnderlyingSecurityID
	} else {
		finalISIN = trade.ISIN
	}

	// Construct a comprehensive raw text string for hashing and reference.
	// The commission is left out: a trade must keep its hash if the report's commission fields change.
	rawText := fmt.Sprintf("Trade|%s|%s|%s|%s|%s|%f|%f|%f|%s|%s",
		trade.AssetCategory, trade.IBOrderID, trade.DateTime, trade.Description, trade.BuySell,
		trade.Quantity, trade.TradePrice, trade.TradeMoney, trade.Currency, trade.Symbol,
	)

	tx := models.CanonicalTransaction{
		Source:             "ibkr",
		TransactionDate:    date,
		ProductName:        trade.Description,
		ISIN:               finalISIN,
		Quantity:           math.Abs(trade.Quantity),
		Price:              trade.TradePrice,
		Commission:         math.Abs(trade.IBCommission),
		CommissionCurrency: trade.IBCommissionCurrency,
		Currency:           trade.Currency,
		OrderID:            fmt.Sprintf("%s", trade.IBOrderID),
		RawText:            rawText,
		SourceAmount:       trade.TradeMoney,
		Amount:             -trade.TradeMoney, // IBKR tradeMoney is positive for BUY (cost), negative for SELL (proceeds). We invert for our model.
		BuySell:            trade.BuySell,
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

	// Construct a comprehensive raw text string.
	rawText := fmt.Sprintf("Dividend|%s|%s|%s|%f|%s|%s",
		cashTx.DateTime, cashTx.Description, cashTx.Symbol, cashTx.Amount, cashTx.Currency, cashTx.ISIN,
	)

	// The dividend amount is the gross amount received. IBKR reports the tax withheld in separate rows.
	tx := models.CanonicalTransaction{
		Source:          "ibkr",
		TransactionDate: date,
		ProductName:     cashTx.Symbol,
		ISIN:            cashTx.ISIN,
		Amount:          cashTx.Amount, // Dividends are positive income.
		SourceAmount:    cashTx.Amount,
		Currency:        cashTx.Currency,
		RawText:         rawText,
		TransactionType: "DIVIDEND",
	}
	return tx, nil
}

// processDividendTax converts an IBKR dividend Withholding Tax CashTransaction to a CanonicalTransaction.
func (p *IBKRParser) processDividendTax(cashTx CashTransaction) (models.CanonicalTransaction, error) {
	date, err := parseIBKRDateTime(cashTx.DateTime)
	if err != nil {
		return models.CanonicalTransaction{}, err
	}

	// Construct a comprehensive raw text string.
	rawText := fmt.Sprintf("DividendTax|%s|%s|%s|%f|%s|%s",
		cashTx.DateTime, cashTx.Description, cashTx.Symbol, cashTx.Amount, cashTx.Currency, cashTx.ISIN,
	)

	tx := models.CanonicalTransaction{
		Source:             "ibkr",
		TransactionDate:    date,
		ProductName:        cashTx.Symbol,
		ISIN:               cashTx.ISIN,
		Amount:             cashTx.Amount, // Keeps its source sign, so a positive reversal cancels the original tax.
		SourceAmount:       cashTx.Amount,
		Currency:           cashTx.Currency,
		RawText:            rawText,
		TransactionType:    "DIVIDEND",
		TransactionSubType: "TAX",
	}
	return tx, nil
}

// processCashMovement converts a Deposit/Withdrawal to a CanonicalTransaction.
func (p *IBKRParser) processCashMovement(cashTx CashTransaction) (models.CanonicalTransaction, error) {
	date, err := parseIBKRDateTime(cashTx.DateTime)
	if err != nil {
		return models.CanonicalTransaction{}, err
	}

	// Construct a comprehensive raw text string.
	rawText := fmt.Sprintf("CashMovement|%s|%s|%f|%s",
		cashTx.Type, cashTx.DateTime, cashTx.Amount, cashTx.Currency,
	)

	tx := models.CanonicalTransaction{
		Source:          "ibkr",
		TransactionDate: date,
		ProductName:     "Cash Transfer",
		Amount:          cashTx.Amount,
		SourceAmount:    cashTx.Amount,
		Currency:        cashTx.Currency,
		RawText:         rawText,
		TransactionType: "CASH",
	}

	if cashTx.Amount > 0 {
		tx.TransactionSubType = "DEPOSIT"
	} else {
		tx.TransactionSubType = "WITHDRAWAL"
	}
	return tx, nil
}

// processFee converts a fee or interest paid to a CanonicalTransaction.
func (p *IBKRParser) processFee(cashTx CashTransaction) (models.CanonicalTransaction, error) {
	date, err := parseIBKRDateTime(cashTx.DateTime)
	if err != nil {
		return models.CanonicalTransaction{}, err
	}

	rawText := fmt.Sprintf("Fee|%s|%s|%s|%f|%s",
		cashTx.Type, cashTx.DateTime, cashTx.Description, cashTx.Amount, cashTx.Currency,
	)

	tx := models.CanonicalTransaction{
		Source:          "ibkr",
		TransactionDate: date,
		ProductName:     cashTx.Description,
		Amount:          cashTx.Amount, // Keeps its source sign, so a positive reversal cancels the original fee.
		SourceAmount:    cashTx.Amount,
		Currency:        cashTx.Currency,
		RawText:         rawText,
		TransactionType: "FEE",
	}
	if cashTx.Type == "Broker Interest Paid" {
		tx.TransactionSubType = "INTEREST"
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
