package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/model"

	"github.com/golang-jwt/jwt/v5"
)

type UserHandler struct {
	JWTSecret string
}

func NewUserHandler(jwtSecret string) *UserHandler {
	return &UserHandler{
		JWTSecret: jwtSecret,
	}
}

type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

func (h *UserHandler) generateTokens(username string) (string, string, error) {
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	})
	accessTokenString, err := accessToken.SignedString([]byte(h.JWTSecret))
	if err != nil {
		return "", "", err
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		},
	})
	refreshTokenString, err := refreshToken.SignedString([]byte(h.JWTSecret))
	if err != nil {
		return "", "", err
	}

	return accessTokenString, refreshTokenString, nil
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

	accessToken, refreshToken, err := h.generateTokens(user.Username)
	if err != nil {
		http.Error(w, "Failed to generate tokens", http.StatusInternalServerError)
		return
	}

	session := &model.Session{
		UserID:       user.ID,
		Token:        accessToken,
		RefreshToken: refreshToken,
		UserAgent:    r.UserAgent(),
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour),
	}
	if err := model.CreateSession(database.DB, session); err != nil {
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}

func (h *UserHandler) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenString := r.Header.Get("Authorization")
		if tokenString == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(h.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		_, err = model.GetSessionByToken(database.DB, tokenString)
		if err != nil {
			http.Error(w, "Invalid session", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

func (h *UserHandler) RefreshTokenHandler(w http.ResponseWriter, r *http.Request) {
	var request struct {
		RefreshToken string `json:"refresh_token"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(request.RefreshToken, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(h.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		http.Error(w, "Invalid refresh token", http.StatusUnauthorized)
		return
	}

	accessToken, refreshToken, err := h.generateTokens(claims.Username)
	if err != nil {
		http.Error(w, "Failed to generate tokens", http.StatusInternalServerError)
		return
	}

	session := &model.Session{
		Token:        accessToken,
		RefreshToken: refreshToken,
		UserAgent:    r.UserAgent(),
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour),
	}
	if err := model.CreateSession(database.DB, session); err != nil {
		http.Error(w, "Failed to update session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}

func (h *UserHandler) RegisterUserHandler(w http.ResponseWriter, r *http.Request) {
	var user model.User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}
	user.Password = string(hashedPassword)

	if err := user.CreateUser(database.DB); err != nil {
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User registered successfully",
	})
}
