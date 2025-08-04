package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
)

func (h *UserHandler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			logger.L.Debug("AuthMiddleware: Authorization header missing", "path", r.URL.Path)
			sendJSONError(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		tokenString := ""
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			tokenString = authHeader
		}

		if tokenString == "" {
			logger.L.Debug("AuthMiddleware: Token string empty", "path", r.URL.Path)
			sendJSONError(w, "Malformed token", http.StatusUnauthorized)
			return
		}

		userIDStr, err := h.authService.ValidateToken(tokenString)
		if err != nil {
			logger.L.Warn("AuthMiddleware: Token validation failed", "path", r.URL.Path, "error", err)
			sendJSONError(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		_, err = model.GetSessionByToken(database.DB, tokenString)
		if err != nil {
			// Esta verificação pode falhar para tokens do Google, pois eles não criam uma sessão na nossa DB
			// Uma abordagem melhor seria verificar o AuthProvider do utilizador
			userIDIntCheck, _ := strconv.ParseInt(userIDStr, 10, 64)
			user, userErr := model.GetUserByID(database.DB, userIDIntCheck)
			if userErr != nil {
				logger.L.Warn("AuthMiddleware: User not found for token after session check failed", "userID", userIDStr, "error", userErr)
				sendJSONError(w, "Invalid session or user", http.StatusUnauthorized)
				return
			}
			// Se o utilizador for do Google, permitimos passar sem uma sessão na nossa DB.
			// Se for local e não tiver sessão, é um erro.
			if user.AuthProvider == "local" {
				logger.L.Warn("AuthMiddleware: Session validation failed for local user's access token", "path", r.URL.Path, "error", err)
				sendJSONError(w, "Invalid or expired session", http.StatusUnauthorized)
				return
			}
		}

		userIDInt, err := strconv.ParseInt(userIDStr, 10, 64)
		if err != nil {
			logger.L.Error("AuthMiddleware: Invalid user ID format in token", "userIDStr", userIDStr, "error", err)
			sendJSONError(w, "Invalid user ID in token", http.StatusInternalServerError)
			return
		}

		ctx := context.WithValue(r.Context(), userIDContextKey, userIDInt)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
