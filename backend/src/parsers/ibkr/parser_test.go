package ibkr

import (
	"strings"
	"testing"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
)

func parseReport(t *testing.T, trades, cashTransactions string) []models.CanonicalTransaction {
	t.Helper()
	logger.InitLogger("error")
	report := `<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1">
<Trades>` + trades + `</Trades>
<CashTransactions>` + cashTransactions + `</CashTransactions>
</FlexStatement></FlexStatements></FlexQueryResponse>`

	txs, err := NewParser().Parse(strings.NewReader(report))
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	return txs
}

func TestParse_ReadsTradeCommission(t *testing.T) {
	txs := parseReport(t, `<Trade assetCategory="STK" description="ACME" dateTime="20260216;100000" quantity="10" tradePrice="50" tradeMoney="500" currency="PLN" ibCommission="-3" ibCommissionCurrency="EUR" buySell="BUY" ibOrderID="1"/>`, "")

	if len(txs) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(txs))
	}
	if txs[0].Commission != 3 {
		t.Errorf("expected commission 3, got %v", txs[0].Commission)
	}
	if txs[0].CommissionCurrency != "EUR" {
		t.Errorf("expected commission currency EUR, got %q", txs[0].CommissionCurrency)
	}
}

// A report with commission fields must produce the same hash input as one without them,
// or re-uploading a report after adding them would import every trade a second time.
func TestParse_CommissionDoesNotChangeTradeRawText(t *testing.T) {
	const trade = `assetCategory="STK" description="ACME" dateTime="20260216;100000" quantity="10" tradePrice="50" tradeMoney="500" currency="EUR" buySell="BUY" ibOrderID="1"`

	without := parseReport(t, `<Trade `+trade+`/>`, "")
	with := parseReport(t, `<Trade `+trade+` ibCommission="-3" ibCommissionCurrency="EUR"/>`, "")

	if without[0].RawText != with[0].RawText {
		t.Errorf("raw text changed with commission:\n%s\n%s", without[0].RawText, with[0].RawText)
	}
}

// Identical fills of an order must all survive the database's unique hash, and must
// get the same hashes each time the report is uploaded.
func TestParse_KeepsIdenticalFillsDistinct(t *testing.T) {
	const fill = `<Trade assetCategory="STK" description="ACME" dateTime="20260216;100000" quantity="10" tradePrice="50" tradeMoney="500" currency="EUR" buySell="BUY" ibOrderID="1"/>`

	first := parseReport(t, fill+fill, "")
	second := parseReport(t, fill+fill, "")

	if len(first) != 2 {
		t.Fatalf("expected 2 transactions, got %d", len(first))
	}
	if first[0].RawText == first[1].RawText {
		t.Errorf("identical fills share raw text: %s", first[0].RawText)
	}
	for i := range first {
		if first[i].RawText != second[i].RawText {
			t.Errorf("raw text of fill %d differs between uploads:\n%s\n%s", i, first[i].RawText, second[i].RawText)
		}
	}
}

// Rows from the user's Flex report: detail and summary rows of a dividend, its tax, and tax on interest.
func TestParse_ImportsDividendWithholdingTax(t *testing.T) {
	txs := parseReport(t, "", `
<CashTransaction type="Withholding Tax" description="WITHHOLDING @ 20% ON CREDIT INT FOR NOV-2025" dateTime="20251203" amount="-0.07" currency="EUR" levelOfDetail="DETAIL" isin="" symbol=""/>
<CashTransaction type="Withholding Tax" description="TDIV(NL0011683594) CASH DIVIDEND EUR 0.27 PER SHARE - NL TAX" dateTime="20251210;202000" amount="-25.52" currency="EUR" levelOfDetail="DETAIL" isin="NL0011683594" symbol="TDIV"/>
<CashTransaction type="Withholding Tax" description="TDIV(NL0011683594) CASH DIVIDEND EUR 0.27 PER SHARE - NL TAX" dateTime="20251210" amount="-25.52" currency="EUR" levelOfDetail="SUMMARY" isin="NL0011683594" symbol="TDIV"/>
<CashTransaction type="Dividends" description="TDIV(NL0011683594) CASH DIVIDEND EUR 0.27 PER SHARE (Ordinary Dividend)" dateTime="20251210;202000" amount="170.1" currency="EUR" levelOfDetail="DETAIL" isin="NL0011683594" symbol="TDIV"/>
<CashTransaction type="Dividends" description="TDIV(NL0011683594) CASH DIVIDEND EUR 0.27 PER SHARE (Ordinary Dividend)" dateTime="20251210" amount="170.1" currency="EUR" levelOfDetail="SUMMARY" isin="NL0011683594" symbol="TDIV"/>
`)

	if len(txs) != 2 {
		t.Fatalf("expected the dividend and its tax, got %d transactions", len(txs))
	}

	tax, dividend := txs[0], txs[1]
	if tax.TransactionType != "DIVIDEND" || tax.TransactionSubType != "TAX" {
		t.Errorf("expected DIVIDEND/TAX, got %s/%s", tax.TransactionType, tax.TransactionSubType)
	}
	if tax.Amount != -25.52 {
		t.Errorf("expected tax amount -25.52, got %v", tax.Amount)
	}
	if tax.ISIN != "NL0011683594" {
		t.Errorf("expected tax ISIN NL0011683594, got %q", tax.ISIN)
	}
	if dividend.TransactionSubType != "" || dividend.Amount != 170.1 {
		t.Errorf("expected gross dividend of 170.1, got subtype %q amount %v", dividend.TransactionSubType, dividend.Amount)
	}
}

// A positive row reverses tax that was withheld, so it must cancel the original when summed.
func TestParse_DividendTaxReversalKeepsSign(t *testing.T) {
	txs := parseReport(t, "", `
<CashTransaction type="Withholding Tax" description="ACME CASH DIVIDEND - US TAX" dateTime="20251210;202000" amount="-10" currency="USD" levelOfDetail="DETAIL" isin="US0000000001" symbol="ACME"/>
<CashTransaction type="Withholding Tax" description="ACME CASH DIVIDEND - US TAX" dateTime="20251211;202000" amount="10" currency="USD" levelOfDetail="DETAIL" isin="US0000000001" symbol="ACME"/>
`)

	if len(txs) != 2 {
		t.Fatalf("expected 2 transactions, got %d", len(txs))
	}
	if sum := txs[0].Amount + txs[1].Amount; sum != 0 {
		t.Errorf("expected tax to net to 0, got %v", sum)
	}
}

func TestParse_PaymentInLieuCountsAsDividend(t *testing.T) {
	txs := parseReport(t, "", `<CashTransaction type="Payment In Lieu Of Dividends" description="ACME PAYMENT IN LIEU OF DIVIDEND" dateTime="20260216" amount="12.5" currency="USD" levelOfDetail="DETAIL" isin="US0378331005" symbol="ACME"/>
<CashTransaction type="Withholding Tax" description="ACME PAYMENT IN LIEU OF DIVIDEND - US TAX" dateTime="20260216" amount="-1.5" currency="USD" levelOfDetail="DETAIL" isin="US0378331005" symbol="ACME"/>`)

	if len(txs) != 2 {
		t.Fatalf("expected 2 transactions, got %d", len(txs))
	}
	if txs[0].TransactionType != "DIVIDEND" || txs[0].TransactionSubType != "" || txs[0].Amount != 12.5 {
		t.Errorf("unexpected payment: %+v", txs[0])
	}
	if txs[1].TransactionSubType != "TAX" {
		t.Errorf("expected the tax on the payment to count as dividend tax: %+v", txs[1])
	}
}

func TestParse_ImportsFeesWithTheirSign(t *testing.T) {
	txs := parseReport(t, "", `<CashTransaction type="Broker Interest Paid" description="USD DEBIT INT" dateTime="20260216" amount="-3" currency="USD" levelOfDetail="DETAIL"/>
<CashTransaction type="Other Fees" description="DATA FEE" dateTime="20260217" amount="-2" currency="USD" levelOfDetail="DETAIL"/>
<CashTransaction type="Other Fees" description="DATA FEE REVERSAL" dateTime="20260218" amount="2" currency="USD" levelOfDetail="DETAIL"/>`)

	if len(txs) != 3 {
		t.Fatalf("expected 3 transactions, got %d", len(txs))
	}
	if txs[0].TransactionType != "FEE" || txs[0].TransactionSubType != "INTEREST" || txs[0].Amount != -3 {
		t.Errorf("unexpected interest: %+v", txs[0])
	}
	if txs[1].TransactionType != "FEE" || txs[1].TransactionSubType != "" {
		t.Errorf("unexpected fee: %+v", txs[1])
	}
	if txs[1].RawText == txs[2].RawText {
		t.Error("a fee and its reversal must not look like duplicates")
	}
	if txs[2].Amount != 2 {
		t.Errorf("expected a reversal to stay positive, got %v", txs[2].Amount)
	}
}

// There's no place for interest received in the reports, so it must at least be reported.
func TestParse_ReportsCashTypesItDoesNotImport(t *testing.T) {
	const report = `<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1"><CashTransactions>
<CashTransaction type="Broker Interest Received" description="USD CREDIT INT" dateTime="20260216" amount="3" currency="USD" levelOfDetail="DETAIL"/>
<CashTransaction type="Broker Interest Received" description="EUR CREDIT INT" dateTime="20260217" amount="1" currency="EUR" levelOfDetail="DETAIL"/>
<CashTransaction type="Withholding Tax" description="USD CREDIT INT - TAX" dateTime="20260216" amount="-1" currency="USD" levelOfDetail="DETAIL"/>
<CashTransaction type="Broker Interest Received" description="SUMMARY" dateTime="20260216" amount="4" currency="USD" levelOfDetail="SUMMARY"/>
</CashTransactions></FlexStatement></FlexStatements></FlexQueryResponse>`

	logger.InitLogger("error")
	parser := NewParser()
	txs, err := parser.Parse(strings.NewReader(report))
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if len(txs) != 0 {
		t.Errorf("expected nothing to be imported, got %+v", txs)
	}
	skipped := parser.SkippedRows()
	if len(skipped) != 2 || skipped[0] != "Broker Interest Received (2)" || skipped[1] != "Withholding Tax sobre outros rendimentos (1)" {
		t.Errorf("unexpected skipped rows: %q", skipped)
	}
}
