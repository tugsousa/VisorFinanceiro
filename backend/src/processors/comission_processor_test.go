package processors

import (
	"math"
	"strings"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/parsers/degiro"
	"github.com/username/taxfolio/backend/src/utils"
)

const degiroCSVHeader = "Data,Hora,Data Valor,Produto,ISIN,Descrição,Taxa,Mudança,,Saldo,,ID Ordem\n"

// Two orders that each fill in one go, plus a sale that stays open.
const singleFillOptionsCSV = degiroCSVHeader + `17-12-2025,13:22,17-12-2025,COL P38.00 18SEP26,BEEX00385761,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-1,50",EUR,"1281,32",order-5
17-12-2025,13:22,17-12-2025,COL P38.00 18SEP26,BEEX00385761,"Venda 2 COL P38.00 18SEP26@6,5 EUR (BEEX00385761)",,EUR,"1300,00",EUR,"1282,82",order-5
30-05-2025,15:52,30-05-2025,COL P35.00 19DEC25,BEEX00012704,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-2,25",EUR,"419,38",order-4
30-05-2025,15:52,30-05-2025,COL P35.00 19DEC25,BEEX00012704,"Compra 3 COL P35.00 19DEC25@1,25 EUR (BEEX00012704)",,EUR,"-375,00",EUR,"421,63",order-4
02-05-2025,10:51,02-05-2025,COL P35.00 19DEC25,BEEX00012704,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-2,25",EUR,"796,63",order-3
02-05-2025,10:51,02-05-2025,COL P35.00 19DEC25,BEEX00012704,"Venda 3 COL P35.00 19DEC25@2,65 EUR (BEEX00012704)",,EUR,"795,00",EUR,"798,88",order-3
15-04-2025,11:34,15-04-2025,COL P35.00 19DEC25,BEEX00012704,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-1,50",EUR,"-196,72",order-2
15-04-2025,11:34,15-04-2025,COL P35.00 19DEC25,BEEX00012704,"Compra 2 COL P35.00 19DEC25@1,15 EUR (BEEX00012704)",,EUR,"-230,00",EUR,"-195,22",order-2
29-01-2025,10:42,29-01-2025,COL P35.00 19DEC25,BEEX00012704,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-1,50",EUR,"521,50",order-1
29-01-2025,10:42,29-01-2025,COL P35.00 19DEC25,BEEX00012704,"Venda 2 COL P35.00 19DEC25@2,5 EUR (BEEX00012704)",,EUR,"500,00",EUR,"523,00",order-1
`

// A sale of 4 filled as 1 + 3, closed by a single purchase of 4. Each order paid 3.00.
const splitFillOptionsCSV = degiroCSVHeader + `15-04-2025,11:34,15-04-2025,COL P35.00 19DEC25,BEEX00012704,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-3,00",EUR,"100,00",close-order
15-04-2025,11:34,15-04-2025,COL P35.00 19DEC25,BEEX00012704,"Compra 4 COL P35.00 19DEC25@1,00 EUR (BEEX00012704)",,EUR,"-400,00",EUR,"103,00",close-order
29-01-2025,10:42,29-01-2025,COL P35.00 19DEC25,BEEX00012704,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-2,25",EUR,"503,00",open-order
29-01-2025,10:42,29-01-2025,COL P35.00 19DEC25,BEEX00012704,"Venda 3 COL P35.00 19DEC25@2,5 EUR (BEEX00012704)",,EUR,"750,00",EUR,"505,25",open-order
29-01-2025,10:42,29-01-2025,COL P35.00 19DEC25,BEEX00012704,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-0,75",EUR,"-244,75",open-order
29-01-2025,10:42,29-01-2025,COL P35.00 19DEC25,BEEX00012704,"Venda 1 COL P35.00 19DEC25@2,5 EUR (BEEX00012704)",,EUR,"250,00",EUR,"-244,00",open-order
`

// A purchase of 2 sold as 1 + 1. The purchase paid 1.00 and the sale paid 0.50 + 0.50.
const splitFillStocksCSV = degiroCSVHeader + `15-04-2025,11:34,15-04-2025,COLRUYT GROUP NV,BE0974256852,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-0,50",EUR,"100,00",sell-order
15-04-2025,11:34,15-04-2025,COLRUYT GROUP NV,BE0974256852,"Venda 1 COLRUYT GROUP NV@40 EUR (BE0974256852)",,EUR,"40,00",EUR,"100,50",sell-order
15-04-2025,11:34,15-04-2025,COLRUYT GROUP NV,BE0974256852,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-0,50",EUR,"60,50",sell-order
15-04-2025,11:34,15-04-2025,COLRUYT GROUP NV,BE0974256852,"Venda 1 COLRUYT GROUP NV@40 EUR (BE0974256852)",,EUR,"40,00",EUR,"61,00",sell-order
29-01-2025,10:42,29-01-2025,COLRUYT GROUP NV,BE0974256852,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-1,00",EUR,"21,00",buy-order
29-01-2025,10:42,29-01-2025,COLRUYT GROUP NV,BE0974256852,"Compra 2 COLRUYT GROUP NV@30 EUR (BE0974256852)",,EUR,"-60,00",EUR,"22,00",buy-order
`

// A USD purchase filled as 12 + 67 and a USD sale, each order paying a commission of 2.00 EUR.
const usdStockWithEURCommissionCSV = degiroCSVHeader + `20-07-2026,17:00,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-2,00",EUR,"100,00",sell-order
20-07-2026,17:00,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,"Venda 79 Accenture PLC Class A@150 USD (IE00B4BNMY34)",,USD,"11850,00",USD,"11850,00",sell-order
20-07-2026,16:16,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,Crédito de divisa,"1,1386",USD,"9487,20",USD,"0,00",buy-order
20-07-2026,16:16,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,Levantamento de divisa,,EUR,"-8332,00",EUR,"66,45",buy-order
20-07-2026,16:16,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,"Compra 67 Accenture PLC Class A@141,6 USD (IE00B4BNMY34)",,USD,"-9487,20",USD,"-9487,20",buy-order
20-07-2026,16:15,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,Crédito de divisa,"1,1386",USD,"1699,20",USD,"0,00",buy-order
20-07-2026,16:15,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,Levantamento de divisa,,EUR,"-1492,30",EUR,"8398,45",buy-order
20-07-2026,16:15,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-2,00",EUR,"9890,75",buy-order
20-07-2026,16:15,20-07-2026,ACCENTURE PLC CLASS A,IE00B4BNMY34,"Compra 12 Accenture PLC Class A@141,6 USD (IE00B4BNMY34)",,USD,"-1699,20",USD,"-1699,20",buy-order
`

// A commission of 1.00 booked, reversed and rebooked on one order.
const reversedCommissionCSV = degiroCSVHeader + `15-04-2025,11:36,15-04-2025,COLRUYT GROUP NV,BE0974256852,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-1,00",EUR,"10,00",sell-order
15-04-2025,11:35,15-04-2025,COLRUYT GROUP NV,BE0974256852,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"1,00",EUR,"11,00",sell-order
15-04-2025,11:34,15-04-2025,COLRUYT GROUP NV,BE0974256852,Comissões de transação DEGIRO e/ou taxas de terceiros,,EUR,"-1,00",EUR,"10,00",sell-order
15-04-2025,11:34,15-04-2025,COLRUYT GROUP NV,BE0974256852,"Venda 2 COLRUYT GROUP NV@40 EUR (BE0974256852)",,EUR,"80,00",EUR,"11,00",sell-order
29-01-2025,10:42,29-01-2025,COLRUYT GROUP NV,BE0974256852,"Compra 2 COLRUYT GROUP NV@30 EUR (BE0974256852)",,EUR,"-60,00",EUR,"22,00",buy-order
`

func sumStockCommissions(details []models.SaleDetail) float64 {
	var total float64
	for _, detail := range details {
		total += detail.Commission
	}
	return total
}

func sumFees(fees []models.FeeDetail) float64 {
	var total float64
	for _, fee := range fees {
		total += fee.AmountEUR
	}
	return total
}

func TestEURCommissionOnForeignCurrencyTradeIsNotConverted(t *testing.T) {
	seedRate("USD", time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC), 1.1386)
	txs := processDegiroCSV(t, usdStockWithEURCommissionCSV)

	details, _ := NewStockProcessor().Process(txs)

	assertAmount(t, "stock commission", 4, sumStockCommissions(details))
	assertAmount(t, "fees", -4, sumFees(NewFeeProcessor().Process(txs)))
}

func TestReversedCommissionNetsOut(t *testing.T) {
	txs := processDegiroCSV(t, reversedCommissionCSV)

	details, _ := NewStockProcessor().Process(txs)

	assertAmount(t, "stock commission", 1, sumStockCommissions(details))
	assertAmount(t, "fees", -1, sumFees(NewFeeProcessor().Process(txs)))
}

// Rows imported without their commission row keep the commission stored on them.
func TestStoredCommissionIsKeptWithoutCommissionRow(t *testing.T) {
	logger.InitLogger("error")
	if err := utils.InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
	buy := models.ProcessedTransaction{
		Source: "degiro", Date: "29-01-2025", ProductName: "COLRUYT", ISIN: "BE0974256852", TransactionType: "STOCK",
		BuySell: "BUY", Quantity: 2, OriginalQuantity: 2, Amount: -60, AmountEUR: -60, ExchangeRate: 1, Commission: 1, OrderID: "buy",
	}
	sell := buy
	sell.Date, sell.BuySell, sell.Amount, sell.AmountEUR, sell.OrderID = "15-04-2025", "SELL", 80, 80, "sell"
	txs := []models.ProcessedTransaction{buy, sell}

	details, _ := NewStockProcessor().Process(txs)

	assertAmount(t, "stock commission", 2, sumStockCommissions(details))
	assertAmount(t, "fees", -2, sumFees(NewFeeProcessor().Process(txs)))
}

// IBKR reports commission per execution, so every execution of an order adds to the fees.
func TestFeeProcessor_CountsEveryExecutionOfOtherSources(t *testing.T) {
	execution := models.ProcessedTransaction{
		Source: "ibkr", Date: "29-01-2025", ProductName: "ACME", TransactionType: "STOCK", Commission: 1, OrderID: "order",
	}
	withoutOrderID := execution
	withoutOrderID.Commission, withoutOrderID.OrderID = 0.5, ""

	fees := NewFeeProcessor().Process([]models.ProcessedTransaction{execution, execution, withoutOrderID})

	assertAmount(t, "fees", -2.5, sumFees(fees))
}

func processDegiroCSV(t *testing.T, csv string) []models.ProcessedTransaction {
	t.Helper()
	logger.InitLogger("error")
	if err := utils.InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
	canonical, err := degiro.NewParser().Parse(strings.NewReader(csv))
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	processed, err := NewTransactionProcessor().Process(canonical)
	if err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	return processed
}

func sumOptionCommissions(details []models.OptionSaleDetail) float64 {
	var total float64
	for _, detail := range details {
		total += detail.Commission
	}
	return total
}

func assertAmount(t *testing.T, label string, expected, got float64) {
	t.Helper()
	if math.Abs(expected-got) > 0.001 {
		t.Errorf("%s: expected %.2f, got %.2f", label, expected, got)
	}
}

func TestOptionProcessor_SingleFillOrdersKeepTheirCommission(t *testing.T) {
	details, _ := NewOptionProcessor().Process(processDegiroCSV(t, singleFillOptionsCSV))

	var delta float64
	for _, detail := range details {
		delta += detail.Delta
	}
	assertAmount(t, "delta", 690, delta)
	assertAmount(t, "commission", 7.5, sumOptionCommissions(details))
}

func TestOptionProcessor_SplitOrderChargesItsCommissionOnce(t *testing.T) {
	details, _ := NewOptionProcessor().Process(processDegiroCSV(t, splitFillOptionsCSV))

	assertAmount(t, "commission", 6, sumOptionCommissions(details))
	for _, detail := range details {
		assertAmount(t, "commission of matched lot", 1.5*float64(detail.Quantity), detail.Commission)
	}
}

func TestStockProcessor_SplitOrderChargesItsCommissionOnce(t *testing.T) {
	details, _ := NewStockProcessor().Process(processDegiroCSV(t, splitFillStocksCSV))

	var total float64
	for _, detail := range details {
		total += detail.Commission
	}
	assertAmount(t, "commission", 2, total)
}

func TestStockProcessor_SplitsCommissionBetweenSaleAndPurchase(t *testing.T) {
	logger.InitLogger("error")
	if err := utils.InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
	buy := models.ProcessedTransaction{
		Source: "ibkr", Date: "29-01-2025", ProductName: "COLRUYT", ISIN: "BE0974256852", TransactionType: "STOCK",
		BuySell: "BUY", Quantity: 3, OriginalQuantity: 3, Amount: -90, AmountEUR: -90, ExchangeRate: 1, Commission: 1.005, OrderID: "buy",
	}
	sell := buy
	sell.Date, sell.BuySell, sell.Quantity, sell.OriginalQuantity = "15-04-2025", "SELL", 3, 3
	sell.Amount, sell.AmountEUR, sell.Commission, sell.OrderID = 120, 120, 1, "sell"
	secondLot := buy
	secondLot.Date, secondLot.Quantity, secondLot.OriginalQuantity = "30-01-2025", 2, 2
	secondLot.Commission, secondLot.OrderID = 0, "second-buy"
	firstLot := buy
	firstLot.Quantity, firstLot.OriginalQuantity = 1, 1

	details, _ := NewStockProcessor().Process([]models.ProcessedTransaction{firstLot, secondLot, sell})

	if len(details) != 2 {
		t.Fatalf("expected 2 matched lots, got %d", len(details))
	}
	assertAmount(t, "sale part of first lot", 0.33, details[0].SaleCommission)
	assertAmount(t, "buy part of first lot", 1.01, details[0].BuyCommission)
	assertAmount(t, "sale part of second lot", 0.67, details[1].SaleCommission)
	assertAmount(t, "buy part of second lot", 0, details[1].BuyCommission)
	for _, detail := range details {
		assertAmount(t, "commission parts", detail.Commission, detail.SaleCommission+detail.BuyCommission)
	}
}

// FIFO matches by ISIN, so a sale can close a lot bought at another broker.
func TestStockProcessor_KeepsBrokerOfEachSide(t *testing.T) {
	logger.InitLogger("error")
	if err := utils.InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
	buy := models.ProcessedTransaction{
		Source: "degiro", Date: "29-01-2025", ProductName: "COLRUYT", ISIN: "BE0974256852", TransactionType: "STOCK",
		BuySell: "BUY", Quantity: 1, OriginalQuantity: 1, Amount: -30, AmountEUR: -30, ExchangeRate: 1, OrderID: "buy",
	}
	sell := buy
	sell.Source, sell.Date, sell.BuySell, sell.Amount, sell.AmountEUR, sell.OrderID = "ibkr", "15-04-2025", "SELL", 40, 40, "sell"

	details, _ := NewStockProcessor().Process([]models.ProcessedTransaction{buy, sell})

	if len(details) != 1 {
		t.Fatalf("expected 1 matched lot, got %d", len(details))
	}
	if details[0].SaleSource != "ibkr" || details[0].BuySource != "degiro" {
		t.Errorf("expected sale at ibkr and purchase at degiro, got %q and %q", details[0].SaleSource, details[0].BuySource)
	}
}

func TestOptionProcessor_KeepsBrokerOfEachSide(t *testing.T) {
	details, _ := NewOptionProcessor().Process(processDegiroCSV(t, splitFillOptionsCSV))

	if len(details) == 0 {
		t.Fatal("expected closed option positions")
	}
	for _, detail := range details {
		if detail.OpenSource != "degiro" || detail.CloseSource != "degiro" {
			t.Errorf("expected degiro on both sides, got %q and %q", detail.OpenSource, detail.CloseSource)
		}
	}
}

// The fee processor runs on the same slice and needs each order's total.
func TestSplitOrderAllocationLeavesFeesUntouched(t *testing.T) {
	txs := processDegiroCSV(t, splitFillOptionsCSV)

	NewOptionProcessor().Process(txs)
	NewStockProcessor().Process(txs)

	var fees float64
	for _, fee := range NewFeeProcessor().Process(txs) {
		fees += fee.AmountEUR
	}
	assertAmount(t, "fees", -6, fees)
}

// IBKR reports commission per execution, so executions of one order must not share it.
func TestOptionProcessor_KeepsPerExecutionCommissionOfOtherSources(t *testing.T) {
	logger.InitLogger("error")
	if err := utils.InitCountryData("../../data/country.json"); err != nil {
		t.Fatalf("failed to load country data: %v", err)
	}
	execution := models.ProcessedTransaction{
		Source: "ibkr", Date: "29-01-2025", ProductName: "COL P35", ISIN: "BE0974256852", TransactionType: "OPTION",
		BuySell: "SELL", Quantity: 1, OriginalQuantity: 1, Amount: 250, ExchangeRate: 1, Commission: 1, OrderID: "open",
	}
	closing := execution
	closing.Date, closing.BuySell, closing.Quantity, closing.OriginalQuantity = "15-04-2025", "BUY", 2, 2
	closing.Amount, closing.Commission, closing.OrderID = -200, 0, "close"

	details, _ := NewOptionProcessor().Process([]models.ProcessedTransaction{execution, execution, closing})

	assertAmount(t, "commission", 2, sumOptionCommissions(details))
}
