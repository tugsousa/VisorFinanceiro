package main

import (
	"TAXFOLIO/src/database"
	"TAXFOLIO/src/handlers"
	"TAXFOLIO/src/parsers"
	"TAXFOLIO/src/processors"
	"TAXFOLIO/src/services"
	"log"
	"net/http"
)

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	csvParser := parsers.NewCSVParser()
	transactionProcessor := parsers.NewTransactionProcessor()
	dividendProcessor := processors.NewDividendProcessor()
	stockProcessor := processors.NewStockProcessor()
	optionProcessor := processors.NewOptionProcessor()
	cashMovementProcessor := processors.NewCashMovementProcessor()

	uploadService := services.NewUploadService(
		csvParser,
		transactionProcessor,
		dividendProcessor,
		stockProcessor,
		optionProcessor,
		cashMovementProcessor,
	)

	uploadHandler := handlers.NewUploadHandler(uploadService)

	router := http.NewServeMux()
	// Corrected route registration
	router.HandleFunc("/api/upload", uploadHandler.HandleUpload)
	router.HandleFunc("/api/stock-sales", uploadHandler.HandleGetStockSales)
	router.HandleFunc("/api/option-sales", uploadHandler.HandleGetOptionSales)
	router.HandleFunc("/api/dividend-tax-summary", uploadHandler.HandleGetDividendTaxSummary)
	router.HandleFunc("/api/dividend-transactions", uploadHandler.HandleGetDividendTransactions)
	router.HandleFunc("/api/raw-transactions", uploadHandler.HandleGetRawTransactions)
	router.HandleFunc("/api/processed-transactions", uploadHandler.HandleGetProcessedTransactions)
	router.HandleFunc("/api/holdings/stocks", uploadHandler.HandleGetStockHoldings)
	router.HandleFunc("/api/holdings/options", uploadHandler.HandleGetOptionHoldings)
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("TAXFOLIO Backend is running"))
	})

	corsRouter := enableCORS(router)
	database.InitDB()

	log.Println("Server running at http://localhost:8080")
	if err := http.ListenAndServe(":8080", corsRouter); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
