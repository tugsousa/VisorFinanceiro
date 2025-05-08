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
			// For flexibility, allow token without Bearer prefix if that's how it's sent
			// However, it's better to be strict. For now, let's assume it might be sent without.
			// If you want to enforce "Bearer ", uncomment the error below.
			// http.Error(w, "Malformed token", http.StatusUnauthorized)
			// return
			tokenString = authHeader // Or, treat the whole header as the token if no Bearer prefix
		}
		
		if tokenString == "" {
			log.Printf("Token string is empty after processing Authorization header for %s %s", r.Method, r.URL.Path)
			http.Error(w, "Malformed token", http.StatusUnauthorized)
			return
		}


		log.Printf("AuthMiddleware: Validating token: %s for %s %s", tokenString, r.Method, r.URL.Path)
		userID, err := h.authService.ValidateToken(tokenString)
		if err != nil {
			log.Printf("AuthMiddleware: Token validation failed: %v for %s %s", err, r.Method, r.URL.Path)
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		log.Printf("AuthMiddleware: Token validated for user ID: %s for %s %s", userID, r.Method, r.URL.Path)
		_, err = model.GetSessionByToken(database.DB, tokenString)
		if err != nil {
			log.Printf("AuthMiddleware: Session validation failed: %v for %s %s. Token used: %s", err, r.Method, r.URL.Path, tokenString)
			http.Error(w, "Invalid or expired session", http.StatusUnauthorized) // More specific error
			return
		}

		userIDInt, err := strconv.ParseInt(userID, 10, 64)
		if err != nil {
			log.Printf("AuthMiddleware: Invalid user ID format: %s for %s %s", userID, r.Method, r.URL.Path)
			http.Error(w, "Invalid user ID in token", http.StatusInternalServerError)
			return
		}

		ctx := context.WithValue(r.Context(), "userID", userIDInt)
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

	// Validate the refresh token. For simplicity, we're using the same JWT validation logic.
	// In a more complex system, refresh tokens might have their own validation or be stored differently.
	userID, err := h.authService.ValidateToken(requestBody.RefreshToken)
	if err != nil {
		log.Printf("Refresh token validation failed: %v", err)
		http.Error(w, "Invalid refresh token", http.StatusUnauthorized)
		return
	}

	// Check if this refresh token is part of an active session
	// This step depends on how you uniquely identify sessions by refresh token.
	// If sessions table's `refresh_token` column stores this, query by it.
	// For now, we'll assume the refresh token itself is sufficient for validation
	// and the old session with this refresh token needs to be invalidated/deleted.

	// Delete old session associated with this refresh token (if any)
	// This step is crucial to prevent refresh token reuse if you issue a new one.
	// If you re-use refresh tokens, this step might differ.
	// Let's assume you want to delete the old session by the refresh token.
	// You'll need a `DeleteSessionByRefreshToken` function in your model.
	/*
		err = model.DeleteSessionByRefreshToken(database.DB, requestBody.RefreshToken)
		if err != nil && err.Error() != "no session found to delete for the given refresh token" {
			log.Printf("Failed to delete old session by refresh token: %v", err)
			// Decide if this is a critical error. Usually, you'd still issue a new token.
		}
	*/


	newAccessToken, err := h.authService.GenerateToken(userID)
	if err != nil {
		http.Error(w, "Failed to generate new access token", http.StatusInternalServerError)
		return
	}

	// Optionally, generate a new refresh token (recommended for security - token rotation)
	newRefreshToken, err := h.authService.GenerateRefreshToken()
	if err != nil {
		http.Error(w, "Failed to generate new refresh token", http.StatusInternalServerError)
		return
	}

	userIDInt, _ := strconv.ParseInt(userID, 10, 64) // Already validated
	newSession := &model.Session{
		UserID:       int(userIDInt), // Ensure UserID is correctly populated
		Token:        newAccessToken,
		RefreshToken: newRefreshToken, // Store the new refresh token
		UserAgent:    r.UserAgent(),
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(security.RefreshTokenExpiry), // Expiry for the new refresh token
	}

	if err := model.CreateSession(database.DB, newSession); err != nil {
		http.Error(w, "Failed to create new session on refresh", http.StatusInternalServerError)
		return
	}
	
	// It's good practice to also invalidate the old session that used the `requestBody.RefreshToken`
	// This prevents the old refresh token from being used again if compromised.
	// We'll assume the main token for session deletion is the access token, but if you store
	// refresh tokens uniquely, you'd delete by that. For now, the new session creation
	// means the old one will naturally expire or be superseded.

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"access_token":  newAccessToken,
		"refresh_token": newRefreshToken, // Send the new refresh token back
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
		// Check for unique constraint violation (username already exists)
		if strings.Contains(err.Error(), "UNIQUE constraint failed: users.username") {
			http.Error(w, "Username already exists", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json") // Ensure content type is set
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User registered successfully",
	})
}

// LogoutUserHandler handles user logout by invalidating the session.
func (h *UserHandler) LogoutUserHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Logout request received")

	// Set CORS headers for the response
	origin := r.Header.Get("Origin")
	if origin == "http://localhost:3000" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Requested-With, Cookie")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE") // Ensure POST is allowed
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
		// You might want to be strict here and return an error,
		// or allow the token if it's sent without "Bearer ".
		// For consistency with AuthMiddleware, let's try to proceed if a token is there.
		tokenString = authHeader
	}
	
	if tokenString == "" {
		log.Println("Logout: Token string is empty after processing Authorization header")
		http.Error(w, "Malformed token", http.StatusUnauthorized)
		return
	}

	// The AuthMiddleware (if applied to this route) would have already validated the token.
	// Here, we just need to use the token to delete the session.
	err := model.DeleteSessionByToken(database.DB, tokenString)
	if err != nil {
		log.Printf("Logout: Failed to delete session for token %s: %v", tokenString, err)
		// Even if deleting fails (e.g., session already gone), client should still be logged out.
		// You might return a different status if the session wasn't found, but 204 is fine.
		// http.Error(w, "Failed to invalidate session", http.StatusInternalServerError)
		// return
	} else {
		log.Printf("Logout: Session for token %s invalidated successfully", tokenString)
	}

	// Regardless of DB operation success, clear any auth-related cookies if you were setting them server-side.
	// For JWTs in headers, this step is mostly for the client to clear its storage.
	// If you had an HttpOnly cookie for the access token (not common for SPA Bearer tokens):
	/*
	http.SetCookie(w, &http.Cookie{
		Name:     "access_token_cookie_name", // if you used one
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0), // Expire immediately
		HttpOnly: true,
		Secure:   r.TLS != nil, // true if HTTPS
		SameSite: http.SameSiteLaxMode,
	})
	*/
	
	w.WriteHeader(http.StatusNoContent) // 204 No Content is standard for successful logout
	log.Println("Logout: Responded with 204 No Content")
}