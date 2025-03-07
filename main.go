package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Transaction struct {
	DataOrdem         string `json:"data_ordem"`
	Hora              string `json:"hora"`
	DataValor         string `json:"data_valor"`
	Descritivo        string `json:"descritivo"`
	ISIN              string `json:"isin"`
	TipoTransacao     string `json:"tipo_transacao"`
	TaxaCambio        string `json:"taxa_cambio"`
	MoedaCambio       string `json:"moeda_cambio"`
	MontanteTransacao string `json:"montante_transacao"`
	MoedaCambio2      string `json:"moeda_cambio2"`
	SaldoConta        string `json:"saldo_conta"`
	IDOrdem           string `json:"id_ordem"`
}

type ExchangeRate struct {
	Root struct {
		Obs []struct {
			TimePeriod string `json:"_TIME_PERIOD"`
			ObsValue   string `json:"_OBS_VALUE"`
			Ccy        string `json:"_CCY"`
		} `json:"Obs"`
	} `json:"root"`
}

type StockTransaction struct {
	TransactionType string
	ISIN            string
	Name            string
	Date            string
	Quantity        int
	Price           float64
}

type SaleDetail struct {
	ISIN             string
	Country          string
	SaleYear         int
	SaleMonth        time.Month
	SaleValue        float64
	PurchaseYear     int
	PurchaseMonth    time.Month
	PurchaseValue    float64
	SaleQuantity     int
	PurchaseQuantity int
}

type PurchaseLot struct {
	Year     int
	Month    time.Month
	Quantity int
	Price    float64
}

func parseDate(dateStr string) (time.Time, error) {
	return time.Parse("02-01-2006", dateStr)
}

func parseStockTransaction(transaction string) (string, string, string, int, float64, error) {
	// Updated regex to handle names with complex formats like "EUN C10.00 17JUL20"

	//re := regexp.MustCompile(`(?i).*?:?\s*(compra|venda)\s+([\d\s]+)\s+([a-zA-Z0-9\s\.]+(?:\s+[A-Za-z0-9]+)*)(?:@([\d,\.]+))\s+[A-Za-z]+\s+\(([\w\d]+)\)$`)
	re := regexp.MustCompile(`(?i).*?:?\s*(compra|venda)\s+([\d\s]+)\s+([a-zA-Z0-9\s\.]+(?:\s+[A-Za-z0-9]+)*)(?:@([\d,\.]+))\s+[A-Za-z]+\s*(?:\(([\w\d]+)\))?$`)

	matches := re.FindStringSubmatch(transaction)
	if matches == nil {
		return "", "", "", 0, 0, fmt.Errorf("unknown transaction format in tipotransacao: %s", transaction)
	}

	transactionType := strings.ToLower(matches[1])
	quantityStr := strings.ReplaceAll(matches[2], " ", "") // Remove spaces from quantity
	name := strings.TrimSpace(matches[3])
	priceStr := strings.ReplaceAll(matches[4], ",", ".") // Replace commas with dots for parsing
	isin := matches[5]

	quantity, err := strconv.Atoi(quantityStr)
	if err != nil {
		return "", "", "", 0, 0, fmt.Errorf("invalid quantity format: %s", quantityStr)
	}

	price, err := strconv.ParseFloat(priceStr, 64)
	if err != nil {
		return "", "", "", 0, 0, fmt.Errorf("invalid price format: %s", priceStr)
	}

	return transactionType, isin, name, quantity, price, nil
}

func processStockTransactions(transactions []Transaction) map[string][]StockTransaction {
	stockLots := make(map[string][]StockTransaction)

	for _, t := range transactions {
		//if t.ISIN == "CA05156X1087" {log.Printf(t.ISIN, t.Descritivo, t.TipoTransacao)}
		// Parse the transaction using the updated function
		transactionType, isin, name, quantity, price, err := parseStockTransaction(t.TipoTransacao)
		if err != nil {
			//if t.ISIN == "CA05156X1087" {log.Printf("Skipping transaction due to parse error: %v", err)}
			//log.Printf("Skipping transaction due to parse error: %v", err)
			continue
		}
		// Validate the transaction type
		if transactionType != "compra" && transactionType != "venda" {
			//log.Printf("Skipping transaction due to invalid type: %s", transactionType)
			continue
		}

		//if isin == "CA05156X1087" || t.ISIN == "CA05156X1087" {log.Printf("Processed transaction: Type=%s, ISIN=%s, Name=%s, Quantity=%d, Price=%.2f", transactionType, isin, name, quantity, price)}
		//log.Printf("Processed transaction: Type=%s, ISIN=%s, Name=%s, Quantity=%d, Price=%.2f", transactionType, isin, name, quantity, price)
		//log.Println("Processing a transaction...")

		// If isin is empty, use t.ISIN
		if isin == "" {
			isin = t.ISIN
		}

		stockLots[isin] = append(stockLots[isin], StockTransaction{
			TransactionType: strings.ToLower(transactionType),
			ISIN:            isin,
			Name:            name,
			Date:            t.DataValor,
			Quantity:        quantity,
			Price:           price,
		})
	}
	return stockLots
}

func formatDateToISO(date string) (string, error) {
	parts := strings.Split(date, "-")
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid date format: %s", date)
	}
	return fmt.Sprintf("%s-%s-%s", parts[2], parts[1], parts[0]), nil
}

func loadExchangeRates(filePath string) (ExchangeRate, error) {
	var rates ExchangeRate
	data, err := os.ReadFile(filePath)
	if err != nil {
		return rates, fmt.Errorf("error reading exchange rate file: %w", err)
	}

	err = json.Unmarshal(data, &rates)
	if err != nil {
		return rates, fmt.Errorf("error parsing exchange rate JSON: %w", err)
	}

	return rates, nil
}

func getExchangeRate(date, currency string, rates ExchangeRate) (float64, error) {
	for _, rate := range rates.Root.Obs {
		if rate.TimePeriod == date && rate.Ccy == currency {
			return strconv.ParseFloat(rate.ObsValue, 64)
		}
	}
	return 0, fmt.Errorf("exchange rate not found for %s on %s", currency, date)
}

func dividendosCalculator(transactions []Transaction, rates ExchangeRate) map[string]map[string]map[string]float64 {
	// Map to hold the results grouped by year, country, and type of amount (gross or taxed)
	result := make(map[string]map[string]map[string]float64)

	for _, t := range transactions {
		// Determine if the transaction is a "Dividendo" or "Imposto sobre dividendo"
		transactionType := strings.ToLower(t.TipoTransacao)
		if transactionType != "dividendo" && transactionType != "imposto sobre dividendo" {
			continue // Skip other transaction types
		}

		// Extract the year from data_valor
		dateParts := strings.Split(t.DataValor, "-")
		if len(dateParts) != 3 {
			//fmt.Printf("Skipping transaction due to invalid date format: %s\n", t.DataValor)
			continue // Skip invalid dates
		}
		year := dateParts[2] // Extract the year

		// Get the country code from ISIN (first 2 characters)
		if len(t.ISIN) < 2 {
			//fmt.Printf("Skipping transaction due to invalid ISIN: %s\n", t.ISIN)
			continue
		}
		country := t.ISIN[:2]

		// Log the transaction being processed
		//fmt.Printf("Processing transaction: %+v\n", t)

		// Get the exchange rate for the transaction date and currency
		var amount float64
		if strings.ToLower(t.MoedaCambio) == "eur" {
			// If currency is EUR, no conversion is needed
			amount, _ = strconv.ParseFloat(t.MontanteTransacao, 64)
		} else {
			formattedDate, err := formatDateToISO(t.DataValor)
			if err != nil {
				//fmt.Printf("Skipping transaction due to invalid date: %s\n", t.DataValor)
				continue
			}
			// Fetch the exchange rate for the date and currency
			exchangeRate, err := getExchangeRate(formattedDate, t.MoedaCambio, rates)
			if err != nil {
				//fmt.Printf("Error fetching exchange rate for %s: %v\n", t.MoedaCambio, err)
				continue
			}
			// Convert the amount to EUR
			amount, _ = strconv.ParseFloat(t.MontanteTransacao, 64)
			amount /= exchangeRate
		}

		// Round the amount to 2 decimal places using fmt.Sprintf
		amountStr := fmt.Sprintf("%.2f", amount)
		amount, _ = strconv.ParseFloat(amountStr, 64)

		// Initialize the map for the year and country if they don't exist
		if _, ok := result[year]; !ok {
			result[year] = make(map[string]map[string]float64)
		}
		if _, ok := result[year][country]; !ok {
			result[year][country] = make(map[string]float64)
			result[year][country]["gross_amt"] = 0.0
			result[year][country]["taxed_amt"] = 0.0
		}

		// Add the amount to the appropriate field (gross_amt or taxed_amt)
		if transactionType == "dividendo" {
			result[year][country]["gross_amt"] += amount
		} else if transactionType == "imposto sobre dividendo" {
			result[year][country]["taxed_amt"] += amount
		}

		// Log the grouping
		//fmt.Printf("Added amount %.2f to year %s, country %s, type %s\n", amount, year, country, transactionType)
	}

	return result
}

func getCountryFromISIN(isin string) string {
	if len(isin) >= 2 {
		return isin[:2]
	}
	return "Unknown"
}

func processFIFO(stockParsedLots map[string][]StockTransaction) ([]SaleDetail, map[string][]PurchaseLot) {
	var salesDetails []SaleDetail

	// Step 1: Build FIFO queues for purchases
	fifoQueues := make(map[string][]*PurchaseLot)

	// Initialize FIFO queues with purchases
	for isin, transactions := range stockParsedLots {
		var purchases []*PurchaseLot
		for _, trans := range transactions {
			if trans.TransactionType != "compra" {
				continue
			}

			date, err := time.Parse("02-01-2006", trans.Date)
			if err != nil {
				log.Printf("Error parsing purchase date %s: %v", trans.Date, err)
				continue
			}

			purchases = append(purchases, &PurchaseLot{
				Year:     date.Year(),
				Month:    date.Month(),
				Quantity: trans.Quantity,
				Price:    trans.Price,
			})
		}

		// Sort purchases chronologically (oldest first)
		sort.Slice(purchases, func(i, j int) bool {
			if purchases[i].Year != purchases[j].Year {
				return purchases[i].Year < purchases[j].Year
			}
			return purchases[i].Month < purchases[j].Month
		})

		fifoQueues[isin] = purchases
	}

	/*
		// Print all purchases from fifoQueues
		fmt.Println("\nAll Purchases:")
		for isin, purchases := range fifoQueues {
			fmt.Printf("Purchases for ISIN %s:\n", isin)
			for _, purchase := range purchases {
				fmt.Printf("  Year: %d, Month: %s, Quantity: %d, Price: %.2f\n",
					purchase.Year, purchase.Month, purchase.Quantity, purchase.Price)
			}
		}*/

	// Process sales
	for isin, transactions := range stockParsedLots {
		var sales []StockTransaction
		for _, trans := range transactions {
			if trans.TransactionType == "venda" {
				sales = append(sales, trans)
			}
		}

		// Sort sales by date
		sort.Slice(sales, func(i, j int) bool {
			dateI, _ := time.Parse("02-01-2006", sales[i].Date)
			dateJ, _ := time.Parse("02-01-2006", sales[j].Date)
			return dateI.Before(dateJ)
		})

		// Process each sale
		for _, sale := range sales {
			saleDate, _ := time.Parse("02-01-2006", sale.Date)
			saleQuantity := sale.Quantity
			salePrice := sale.Price

			// Get the FIFO queue for this ISIN
			purchases := fifoQueues[isin]

			// While there is remaining quantity to match and purchases exist
			for saleQuantity > 0 && len(purchases) > 0 {
				purchase := purchases[0]

				// Determine the quantity to match
				matchQuantity := min(saleQuantity, purchase.Quantity)

				// Create a new SaleDetail for this part of the sale
				saleDetail := SaleDetail{
					ISIN:             isin,
					Country:          getCountryFromISIN(isin),
					SaleYear:         saleDate.Year(),
					SaleMonth:        saleDate.Month(),
					SaleValue:        float64(matchQuantity) * salePrice,
					PurchaseYear:     purchase.Year,
					PurchaseMonth:    purchase.Month,
					PurchaseValue:    float64(matchQuantity) * purchase.Price,
					SaleQuantity:     matchQuantity,
					PurchaseQuantity: matchQuantity,
				}

				// Add the sale detail to the results
				salesDetails = append(salesDetails, saleDetail)

				// Update the remaining quantities
				saleQuantity -= matchQuantity
				purchase.Quantity -= matchQuantity

				// If the purchase quantity is zero, remove it from the queue
				if purchase.Quantity == 0 {
					purchases = purchases[1:]
				}
			}

			// Update the FIFO queue for this ISIN
			fifoQueues[isin] = purchases
		}
	}

	// Step 3: Identify remaining purchases (not sold)
	remainingPurchases := make(map[string][]PurchaseLot)
	for isin, purchases := range fifoQueues {
		for _, purchase := range purchases {
			if purchase.Quantity > 0 {
				remainingPurchases[isin] = append(remainingPurchases[isin], *purchase)
			}
		}
	}

	return salesDetails, remainingPurchases
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func uploadHandler(w http.ResponseWriter, r *http.Request, rates ExchangeRate) {
	r.ParseMultipartForm(10 << 20)

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Erro ao receber o arquivo", http.StatusBadRequest)
		log.Println(err)
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		http.Error(w, "Erro ao ler o arquivo CSV", http.StatusInternalServerError)
		log.Println(err)
		return
	}

	data := records[1:]
	var transactions []Transaction

	for _, record := range data {
		transaction := Transaction{
			DataOrdem:         record[0],
			Hora:              record[1],
			DataValor:         record[2],
			Descritivo:        record[3],
			ISIN:              record[4],
			TipoTransacao:     record[5],
			TaxaCambio:        record[6],
			MoedaCambio:       record[7],
			MontanteTransacao: record[8],
			MoedaCambio2:      record[9],
			SaldoConta:        record[10],
			IDOrdem:           record[11],
		}
		transactions = append(transactions, transaction)
	}

	result := dividendosCalculator(transactions, rates)
	// Process stock transactions
	stockParsedLots := processStockTransactions(transactions)

	salesDetails, remainingPurchases := processFIFO(stockParsedLots)
	//fmt.Println("salesDetails: ", salesDetails)

	// Print header with column alignment
	fmt.Println("ISIN\t\tCountry\tSale Year\tSale Month\tSale Value\t\tPurchase Year\tPurchase Month\tPurchase Value\tSale Qty\tPurchase Qty")

	for _, detail := range salesDetails {
		fmt.Printf("%s\t%s\t%d\t%s\t%12.2f\t\t%d\t%s\t%14.2f\t%d\t\t%d\n",
			detail.ISIN,
			detail.Country,
			detail.SaleYear,
			detail.SaleMonth,
			detail.SaleValue,
			detail.PurchaseYear,
			detail.PurchaseMonth,
			detail.PurchaseValue,
			detail.SaleQuantity,
			detail.PurchaseQuantity,
		)
	}

	// Print header with column alignment for remaining purchases
	fmt.Println("\nRemaining Purchases (Not Sold):")
	fmt.Println("ISIN\t\tYear\tMonth\tQuantity\tPrice")

	for isin, purchases := range remainingPurchases {
		for _, purchase := range purchases {
			fmt.Printf("%s\t%d\t%s\t%d\t\t%.2f\n",
				isin,
				purchase.Year,
				purchase.Month,
				purchase.Quantity,
				purchase.Price,
			)
		}
	}
	log.Println("Dividendos: ", result)

	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(stockParsedLots)
	if err != nil {
		http.Error(w, "Erro ao gerar resposta JSON", http.StatusInternalServerError)
		log.Println(err)
	}
}

func main() {
	rates, err := loadExchangeRates("historicalExchangeRate.json")
	if err != nil {
		log.Fatalf("Failed to load exchange rates: %v", err)
	}

	http.HandleFunc("/upload", func(w http.ResponseWriter, r *http.Request) {
		uploadHandler(w, r, rates)
	})

	log.Println("Servidor rodando em http://localhost:8080")
	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal("Erro ao iniciar o servidor:", err)
	}
}
