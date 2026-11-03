package degiro

import (
	"math"
	"strings"
	"testing"
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
