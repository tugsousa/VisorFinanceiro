package main

import (
	"log"
	"net/http"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/handlers"
	_ "github.com/username/taxfolio/backend/src/model" // Ensure model package is initialized
	"github.com/username/taxfolio/backend/src/parsers"
	"github.com/username/taxfolio/backend/src/processors"
	"github.com/username/taxfolio/backend/src/services"
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
	userHandler := handlers.NewUserHandler("your-secret-key-here") // TODO: Replace with actual JWT secret

	// Initialize parsers and processors
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

	router.HandleFunc("/api/login", userHandler.LoginUserHandler)
	router.HandleFunc("/api/register", userHandler.RegisterUserHandler)
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
