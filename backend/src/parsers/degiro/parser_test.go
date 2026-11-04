package degiro

import (
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/username/taxfolio/backend/src/models"
)

// A single dividend that DeGiro booked, reversed and rebooked several times.
// It nets out to one dividend of 476.10 with 142.83 of tax.
const reversedDividendCSV = `Data,Hora,Data Valor,Produto,ISIN,Descrição,Taxa,Mudança,,Saldo,,ID Ordem
02-10-2025,15:06,29-09-2025,COLRUYT GROUP NV,BE0974256852,Dividendo,,EUR,"-476,10",EUR,"446,50",
02-10-2025,15:05,30-09-2025,COLRUYT GROUP NV,BE0974256852,Imposto sobre dividendo,,EUR,"-142,83",EUR,"922,60",
02-10-2025,15:05,30-09-2025,COLRUYT GROUP NV,BE0974256852,Dividendo,,EUR,"476,10",EUR,"1065,43",
01-10-2025,09:40,29-09-2025,COLRUYT GROUP NV,BE0974256852,Imposto sobre dividendo,,EUR,"142,83",EUR,"589,33",
01-10-2025,09:40,29-09-2025,COLRUYT GROUP NV,BE0974256852,Dividendo,,EUR,"-476,10",EUR,"446,50",
01-10-2025,09:40,30-09-2025,COLRUYT GROUP NV,BE0974256852,Imposto sobre dividendo,,EUR,"142,83",EUR,"922,60",
01-10-2025,09:40,30-09-2025,COLRUYT GROUP NV,BE0974256852,Dividendo,,EUR,"-476,10",EUR,"779,77",
01-10-2025,09:39,29-09-2025,COLRUYT GROUP NV,BE0974256852,Dividendo,,EUR,"476,10",EUR,"1255,87",
01-10-2025,09:37,29-09-2025,COLRUYT GROUP NV,BE0974256852,Imposto sobre dividendo,,EUR,"-142,83",EUR,"779,77",
01-10-2025,09:37,29-09-2025,COLRUYT GROUP NV,BE0974256852,Dividendo,,EUR,"476,10",EUR,"922,60",
01-10-2025,07:21,30-09-2025,COLRUYT GROUP NV,BE0974256852,Imposto sobre dividendo,,EUR,"-142,83",EUR,"446,50",
01-10-2025,07:21,30-09-2025,COLRUYT GROUP NV,BE0974256852,Dividendo,,EUR,"476,10",EUR,"589,33",
`

func TestParse_ReversedDividendTaxNetsOut(t *testing.T) {
	txs, err := NewParser().Parse(strings.NewReader(reversedDividendCSV))
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if len(txs) != 12 {
		t.Fatalf("expected 12 transactions, got %d", len(txs))
	}

	var gross, tax float64
	for _, tx := range txs {
		if tx.TransactionSubType == "TAX" {
			tax += tx.Amount
		} else {
			gross += tx.Amount
		}
	}

	if math.Abs(gross-476.10) > 0.001 {
		t.Errorf("expected net gross of 476.10, got %.2f", gross)
	}
	if math.Abs(tax-(-142.83)) > 0.001 {
		t.Errorf("expected net tax of -142.83, got %.2f", tax)
	}
}

const statementRow = `01-10-2025,09:40,29-09-2025,ACME,US0378331005,"Compra 2 ACME@10,5 USD",,USD,"-21,00",USD,"100,00",abc
`

// Files in other languages used to import nothing, as if they had no transactions.
func TestParse_RejectsFilesInOtherLanguages(t *testing.T) {
	headers := map[string]string{
		"English": "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n",
		"Dutch":   "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n",
		"Spanish": "Fecha,Hora,Fecha valor,Producto,ISIN,Descripción,Tipo,Variación,,Saldo,,ID Orden\n",
		"Italian": "Data,Ora,Data valuta,Prodotto,ISIN,Descrizione,Borsa,Modifica,,Saldo,,ID Ordine\n",
	}
	for language, header := range headers {
		t.Run(language, func(t *testing.T) {
			_, err := NewParser().Parse(strings.NewReader(header + statementRow))
			var fileErr models.FileError
			if !errors.As(err, &fileErr) {
				t.Errorf("expected a file error, got %v", err)
			}
		})
	}
}

func TestParse_AcceptsPortugueseHeaderWithByteOrderMark(t *testing.T) {
	const header = "\uFEFFData,Hora,Data Valor,Produto,ISIN,Descrição,Taxa,Mudança,,Saldo,,ID Ordem\n"
	txs, err := NewParser().Parse(strings.NewReader(header + statementRow))
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if len(txs) != 1 || txs[0].BuySell != "BUY" {
		t.Errorf("unexpected transactions: %+v", txs)
	}
}

func TestParse_ReportsSkippedRows(t *testing.T) {
	const file = `Data,Hora,Data Valor,Produto,ISIN,Descrição,Taxa,Mudança,,Saldo,,ID Ordem
01-10-2025,09:40,29-09-2025,ACME,US0378331005,Algo novo,,EUR,"1,00",EUR,"100,00",
02-10-2025,09:40,29-09-2025,ACME,US0378331005,Algo novo,,EUR,"1,00",EUR,"100,00",
data errada,09:40,29-09-2025,ACME,US0378331005,Dividendo,,EUR,"1,00",EUR,"100,00",
` + statementRow

	parser := NewParser()
	if _, err := parser.Parse(strings.NewReader(file)); err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	skipped := parser.SkippedRows()
	if len(skipped) != 2 || skipped[0] != "Algo novo (2)" || skipped[1] != "Linha com data inválida (1)" {
		t.Errorf("unexpected skipped rows: %q", skipped)
	}
}
