package handlers

import (
	"TAXFOLIO/src/database"
	"TAXFOLIO/src/model"
	"encoding/json"
	"net/http"
)

type UserHandler struct {
	// Add any dependencies here
}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

func (h *UserHandler) LoginUserHandler(w http.ResponseWriter, r *http.Request) {
	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	user, err := model.GetUserByUsername(database.DB, credentials.Username)
	if err != nil {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	if err := user.CheckPassword(credentials.Password); err != nil {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Login successful",
	})
}

func (h *UserHandler) RegisterUserHandler(w http.ResponseWriter, r *http.Request) {
	// Implement registration logic here
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Registration successful",
	})
}

// Add other handler methods to match the function calls in main.go
func (h *UserHandler) HandleUpload(w http.ResponseWriter, r *http.Request)                  {}
func (h *UserHandler) HandleGetStockSales(w http.ResponseWriter, r *http.Request)           {}
func (h *UserHandler) HandleGetOptionSales(w http.ResponseWriter, r *http.Request)          {}
func (h *UserHandler) HandleGetDividendTaxSummary(w http.ResponseWriter, r *http.Request)   {}
func (h *UserHandler) HandleGetDividendTransaction(w http.ResponseWriter, r *http.Request)  {}
func (h *UserHandler) HandleGetRawTransaction(w http.ResponseWriter, r *http.Request)       {}
func (h *UserHandler) HandleGetProcessedTransaction(w http.ResponseWriter, r *http.Request) {}
func (h *UserHandler) HandleGetStockHolding(w http.ResponseWriter, r *http.Request)         {}
func (h *UserHandler) HandleGetOptionHolding(w http.ResponseWriter, r *http.Request)        {}
