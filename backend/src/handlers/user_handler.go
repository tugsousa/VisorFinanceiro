package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings" // Import strings package
	"time"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/security"
)

// Define a custom type for context keys to avoid collisions.
// This type is unexported, making it unique to this package.
type contextKey string

// Define the specific key we will use.
// This constant is unexported because GetUserIDFromContext is in the same package
// and provides a controlled way to access the userID.
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
	log.Printf("Login request headers: %v", r.Header)

	// Log CSRF token from header
	csrfToken := r.Header.Get("X-CSRF-Token")
	log.Printf("CSRF Token from header: %v", csrfToken)

	// Log CSRF token from cookie
	if cookie, err := r.Cookie("_gorilla_csrf"); err == nil {
		log.Printf("CSRF Token from cookie: %v", cookie.Value)
		log.Printf("CSRF tokens match: %v", cookie.Value == csrfToken)
	} else {
		log.Printf("Error getting CSRF cookie: %v", err)
	}

	// Log all cookies for debugging
	log.Printf("All cookies in login handler: %v", r.Cookies())

	// Set CORS headers for the response
	origin := r.Header.Get("Origin")
	if origin == "http://localhost:3000" {
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

	// Convert user ID to string for the token
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
		ExpiresAt:    time.Now().Add(security.RefreshTokenExpiry), // Use defined constant
	}
	if err := model.CreateSession(database.DB, session); err != nil {
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Prepare user data for the response
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
			log.Printf("Authorization header does not have Bearer prefix: %s for %s %s", authHeader, r.Method, r.URL.Path)
			tokenString = authHeader
		}

		if tokenString == "" {
			log.Printf("Token string is empty after processing Authorization header for %s %s", r.Method, r.URL.Path)
			http.Error(w, "Malformed token", http.StatusUnauthorized)
			return
		}

		log.Printf("AuthMiddleware: Validating token: %s for %s %s", tokenString, r.Method, r.URL.Path)
		userIDStr, err := h.authService.ValidateToken(tokenString)
		if err != nil {
			log.Printf("AuthMiddleware: Token validation failed: %v for %s %s", err, r.Method, r.URL.Path)
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		log.Printf("AuthMiddleware: Token validated for user ID: %s for %s %s", userIDStr, r.Method, r.URL.Path)
		_, err = model.GetSessionByToken(database.DB, tokenString)
		if err != nil {
			log.Printf("AuthMiddleware: Session validation failed: %v for %s %s. Token used: %s", err, r.Method, r.URL.Path, tokenString)
			http.Error(w, "Invalid or expired session", http.StatusUnauthorized) // More specific error
			return
		}

		userIDInt, err := strconv.ParseInt(userIDStr, 10, 64)
		if err != nil {
			log.Printf("AuthMiddleware: Invalid user ID format: %s for %s %s", userIDStr, r.Method, r.URL.Path)
			http.Error(w, "Invalid user ID in token", http.StatusInternalServerError)
			return
		}

		// Use the custom context key type
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

	userIDStr, err := h.authService.ValidateToken(requestBody.RefreshToken)
	if err != nil {
		log.Printf("Refresh token validation failed: %v", err)
		http.Error(w, "Invalid refresh token", http.StatusUnauthorized)
		return
	}

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

	userIDInt, _ := strconv.ParseInt(userIDStr, 10, 64) // Already validated
	newSession := &model.Session{
		UserID:       int(userIDInt),
		Token:        newAccessToken,
		RefreshToken: newRefreshToken,
		UserAgent:    r.UserAgent(),
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(security.RefreshTokenExpiry),
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

	origin := r.Header.Get("Origin")
	if origin == "http://localhost:3000" {
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
		log.Printf("Logout: Authorization header does not have Bearer prefix: %s", authHeader)
		tokenString = authHeader
	}

	if tokenString == "" {
		log.Println("Logout: Token string is empty after processing Authorization header")
		http.Error(w, "Malformed token", http.StatusUnauthorized)
		return
	}

	err := model.DeleteSessionByToken(database.DB, tokenString)
	if err != nil {
		log.Printf("Logout: Failed to delete session for token %s: %v", tokenString, err)
	} else {
		log.Printf("Logout: Session for token %s invalidated successfully", tokenString)
	}

	w.WriteHeader(http.StatusNoContent)
	log.Println("Logout: Responded with 204 No Content")
}

// GetUserIDFromContext retrieves the userID from the context.
// It's defined in this package and can be called by other handlers within the same package.
func GetUserIDFromContext(ctx context.Context) (int64, bool) {
	userID, ok := ctx.Value(userIDContextKey).(int64)
	return userID, ok
}
