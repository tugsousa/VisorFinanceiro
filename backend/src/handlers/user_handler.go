package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/config" // Import config
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/security"
)

// Define a custom type for context keys to avoid collisions.
type contextKey string

const userIDContextKey contextKey = "userID"

type UserHandler struct {
	authService *security.AuthService
}

func NewUserHandler(authService *security.AuthService) *UserHandler {
	return &UserHandler{
		authService: authService,
	}
}

func (h *UserHandler) LoginUserHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("Login request received from %s", r.RemoteAddr)
	// ... (CSRF logging and CORS headers as before) ...
	origin := r.Header.Get("Origin")
	if origin == "http://localhost:3000" { // Simplified for brevity
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token")
	}

	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		log.Printf("Invalid request body: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	log.Printf("Login attempt for user: %s", credentials.Username)
	user, err := model.GetUserByUsername(database.DB, credentials.Username)
	if err != nil {
		log.Printf("User lookup failed for %s: %v", credentials.Username, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid username or password"})
		return
	}

	if err := user.CheckPassword(credentials.Password); err != nil {
		log.Printf("Password check failed for user %s: %v", credentials.Username, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid username or password"})
		return
	}

	userIDStr := fmt.Sprintf("%d", user.ID)
	accessToken, err := h.authService.GenerateToken(userIDStr)
	if err != nil {
		http.Error(w, "Failed to generate access token", http.StatusInternalServerError)
		return
	}

	refreshToken, err := h.authService.GenerateRefreshToken()
	if err != nil {
		http.Error(w, "Failed to generate refresh token", http.StatusInternalServerError)
		return
	}

	session := &model.Session{
		UserID:       user.ID,
		Token:        accessToken,
		RefreshToken: refreshToken,
		UserAgent:    r.UserAgent(),
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(config.Cfg.RefreshTokenExpiry), // Use configured value
	}
	if err := model.CreateSession(database.DB, session); err != nil {
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	userData := map[string]interface{}{
		"id":       user.ID,
		"username": user.Username,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user":          userData,
	})
}

func (h *UserHandler) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			log.Printf("Authorization header missing for %s %s", r.Method, r.URL.Path)
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		tokenString := ""
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			tokenString = authHeader
		}

		if tokenString == "" {
			log.Printf("Token string is empty after processing Authorization header for %s %s", r.Method, r.URL.Path)
			http.Error(w, "Malformed token", http.StatusUnauthorized)
			return
		}

		log.Printf("AuthMiddleware: Validating token (first 10 chars): %s... for %s %s", tokenString[:min(10, len(tokenString))], r.Method, r.URL.Path)
		userIDStr, err := h.authService.ValidateToken(tokenString)
		if err != nil {
			log.Printf("AuthMiddleware: Token validation failed: %v for %s %s", err, r.Method, r.URL.Path)
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		log.Printf("AuthMiddleware: Token validated for user ID: %s for %s %s", userIDStr, r.Method, r.URL.Path)
		_, err = model.GetSessionByToken(database.DB, tokenString)
		if err != nil {
			log.Printf("AuthMiddleware: Session validation failed for access token: %v for %s %s. Token used (first 10): %s...", err, r.Method, r.URL.Path, tokenString[:min(10, len(tokenString))])
			http.Error(w, "Invalid or expired session", http.StatusUnauthorized)
			return
		}

		userIDInt, err := strconv.ParseInt(userIDStr, 10, 64)
		if err != nil {
			log.Printf("AuthMiddleware: Invalid user ID format: %s for %s %s", userIDStr, r.Method, r.URL.Path)
			http.Error(w, "Invalid user ID in token", http.StatusInternalServerError)
			return
		}

		ctx := context.WithValue(r.Context(), userIDContextKey, userIDInt)
		next(w, r.WithContext(ctx))
	}
}

func (h *UserHandler) RefreshTokenHandler(w http.ResponseWriter, r *http.Request) {
	var requestBody struct {
		RefreshToken string `json:"refresh_token"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if requestBody.RefreshToken == "" {
		http.Error(w, "Refresh token is required", http.StatusBadRequest)
		return
	}

	oldSession, err := model.GetSessionByRefreshToken(database.DB, requestBody.RefreshToken)
	if err != nil {
		log.Printf("Refresh token lookup failed or token invalid/expired: %v. Refresh token used (first 10): %s...", err, requestBody.RefreshToken[:min(10, len(requestBody.RefreshToken))])
		http.Error(w, "Invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

	if err := model.DeleteSessionByRefreshToken(database.DB, requestBody.RefreshToken); err != nil {
		log.Printf("Failed to delete old session during refresh: %v. Refresh token (first 10): %s...", err, requestBody.RefreshToken[:min(10, len(requestBody.RefreshToken))])
		// Decide if this is fatal or just a log. For now, log and continue.
	}

	userIDStr := fmt.Sprintf("%d", oldSession.UserID)
	newAccessToken, err := h.authService.GenerateToken(userIDStr)
	if err != nil {
		http.Error(w, "Failed to generate new access token", http.StatusInternalServerError)
		return
	}

	newRefreshToken, err := h.authService.GenerateRefreshToken()
	if err != nil {
		http.Error(w, "Failed to generate new refresh token", http.StatusInternalServerError)
		return
	}

	newSession := &model.Session{
		UserID:       oldSession.UserID,
		Token:        newAccessToken,
		RefreshToken: newRefreshToken,
		UserAgent:    r.UserAgent(),
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(config.Cfg.RefreshTokenExpiry), // Use configured value
	}

	if err := model.CreateSession(database.DB, newSession); err != nil {
		http.Error(w, "Failed to create new session on refresh", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"access_token":  newAccessToken,
		"refresh_token": newRefreshToken,
	})
}

func (h *UserHandler) RegisterUserHandler(w http.ResponseWriter, r *http.Request) {
	var credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	hashedPassword, err := h.authService.HashPassword(credentials.Password)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	user := &model.User{
		Username: credentials.Username,
		Password: hashedPassword,
	}

	if err := user.CreateUser(database.DB); err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed: users.username") {
			http.Error(w, "Username already exists", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User registered successfully",
	})
}

func (h *UserHandler) LogoutUserHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Logout request received")
	// ... (CORS headers as before) ...
	origin := r.Header.Get("Origin")
	if origin == "http://localhost:3000" { // Simplified for brevity
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Expose-Headers", "X-CSRF-Token")
	}

	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		log.Println("Logout: Authorization header missing")
		http.Error(w, "Authorization header required", http.StatusUnauthorized)
		return
	}

	tokenString := ""
	if strings.HasPrefix(authHeader, "Bearer ") {
		tokenString = strings.TrimPrefix(authHeader, "Bearer ")
	} else {
		tokenString = authHeader
	}

	if tokenString == "" {
		log.Println("Logout: Token string is empty after processing Authorization header")
		http.Error(w, "Malformed token", http.StatusUnauthorized)
		return
	}

	err := model.DeleteSessionByToken(database.DB, tokenString)
	if err != nil {
		log.Printf("Logout: Failed to delete session for token (first 10) %s...: %v", tokenString[:min(10, len(tokenString))], err)
	} else {
		log.Printf("Logout: Session for token (first 10) %s... invalidated successfully", tokenString[:min(10, len(tokenString))])
	}

	w.WriteHeader(http.StatusNoContent)
	log.Println("Logout: Responded with 204 No Content")
}

func (h *UserHandler) HandleCheckUserData(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		sendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var count int
	err := database.DB.QueryRow("SELECT COUNT(*) FROM processed_transactions WHERE user_id = ?", userID).Scan(&count)
	if err != nil {
		log.Printf("Error checking user data for userID %d: %v", userID, err)
		sendJSONError(w, "failed to check user data", http.StatusInternalServerError)
		return
	}
	hasData := count > 0
	log.Printf("User data check for userID %d: hasData = %v (count = %d)", userID, hasData, count)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"hasData": hasData})
}

func GetUserIDFromContext(ctx context.Context) (int64, bool) {
	userID, ok := ctx.Value(userIDContextKey).(int64)
	return userID, ok
}

// Helper min function to avoid index out of bounds for logging
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
