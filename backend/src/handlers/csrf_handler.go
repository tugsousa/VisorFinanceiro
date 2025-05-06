package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/csrf"
)

func GetCSRFToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-CSRF-Token", csrf.Token(r))
	json.NewEncoder(w).Encode(map[string]string{
		"csrfToken": csrf.Token(r),
	})
}
