// backend/src/handlers/middleware.go
package handlers

import (
	"context"
	"log/slog" // <-- Importação adicionada
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid" // <-- Adicionar "github.com/google/uuid" ao go.mod
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
)

// As chaves de contexto contextKey e userIDContextKey são definidas em user_handler.go
// e re-exportadas através dos outros ficheiros no mesmo pacote.
// A chave requestIDContextKey é adicionada aqui para o middleware.
const requestIDContextKey contextKey = "requestID"

// ContextualLoggerMiddleware cria um logger com um requestID para cada requisição.
func ContextualLoggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Gerar Request ID
		requestID := uuid.New().String()

		// 2. Criar um logger enriquecido com o Request ID
		ctxLogger := logger.L.With(slog.String("requestID", requestID))

		// 3. Injetar o logger e o requestID no contexto
		ctx := logger.ToContext(r.Context(), ctxLogger)
		ctx = context.WithValue(ctx, requestIDContextKey, requestID)

		// 4. Propagar para o próximo middleware
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// AuthMiddleware foi atualizado para propagar o UserID para o logger.
func (h *UserHandler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		// 1. Obter o logger contextual
		ctxLogger := logger.FromContext(r.Context())

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			ctxLogger.Debug("AuthMiddleware: Authorization header missing", "path", r.URL.Path)
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
			ctxLogger.Debug("AuthMiddleware: Token string empty", "path", r.URL.Path)
			sendJSONError(w, "Malformed token", http.StatusUnauthorized)
			return
		}

		userIDStr, err := h.authService.ValidateToken(tokenString)
		if err != nil {
			ctxLogger.Warn("AuthMiddleware: Token validation failed", "path", r.URL.Path, "error", err)
			sendJSONError(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		_, err = model.GetSessionByToken(database.DB, tokenString)
		if err != nil {
			userIDIntCheck, _ := strconv.ParseInt(userIDStr, 10, 64)
			user, userErr := model.GetUserByID(database.DB, userIDIntCheck)
			if userErr != nil {
				ctxLogger.Warn("AuthMiddleware: User not found for token after session check failed", "userID", userIDStr, "error", userErr)
				sendJSONError(w, "Invalid session or user", http.StatusUnauthorized)
				return
			}
			if user.AuthProvider == "local" {
				ctxLogger.Warn("AuthMiddleware: Session validation failed for local user's access token", "path", r.URL.Path, "error", err)
				sendJSONError(w, "Invalid or expired session", http.StatusUnauthorized)
				return
			}
		}

		userIDInt, err := strconv.ParseInt(userIDStr, 10, 64)
		if err != nil {
			ctxLogger.Error("AuthMiddleware: Invalid user ID format in token", "userIDStr", userIDStr, "error", err)
			sendJSONError(w, "Invalid user ID in token", http.StatusInternalServerError)
			return
		}

		// 2. Enriquecer o logger com o userID e injetá-lo de volta no contexto
		enrichedLogger := ctxLogger.With(slog.Int64("userID", userIDInt))
		ctx := logger.ToContext(r.Context(), enrichedLogger)

		// 3. Adicionar o userID ao contexto normal para handlers
		ctx = context.WithValue(ctx, userIDContextKey, userIDInt)

		// 4. Passar a requisição com o contexto atualizado
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
