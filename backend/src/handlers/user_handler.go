package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"golang.org/x/oauth2"
)

type contextKey string

const userIDContextKey contextKey = "userID"

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
var passwordRegex = regexp.MustCompile(`^.{6,}$`)

var (
	googleOauthConfig *oauth2.Config
	oauthStateString  = "random-string-for-security"
)

// UserHandler now acts as a receiver for methods defined across
// multiple files in this package (auth_handler.go, oauth_handler.go, etc.).
type UserHandler struct {
	authService  *security.AuthService
	emailService services.EmailService
}

func NewUserHandler(authService *security.AuthService, emailService services.EmailService) *UserHandler {
	return &UserHandler{
		authService:  authService,
		emailService: emailService,
	}
}

// sendJSONError is a helper used by multiple handlers in this package.
func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	logger.L.Warn("Sending JSON error to client", "message", message, "statusCode", statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// VerifyEmailHandler remains here as a general, non-grouped user action.
func (h *UserHandler) VerifyEmailHandler(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		sendJSONError(w, "Verification token is missing", http.StatusBadRequest)
		return
	}

	user, err := model.GetUserByVerificationToken(database.DB, token)
	if err != nil {
		logger.L.Warn("Verification token lookup failed", "tokenPrefix", token[:min(10, len(token))], "error", err)
		sendJSONError(w, "Invalid or expired verification token.", http.StatusBadRequest)
		return
	}

	if user.IsEmailVerified {
		logger.L.Info("Email already verified", "userID", user.ID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Email already verified. You can log in."})
		return
	}

	if time.Now().After(user.EmailVerificationTokenExpiresAt) {
		logger.L.Warn("Verification token expired", "userID", user.ID, "tokenExpiry", user.EmailVerificationTokenExpiresAt)
		sendJSONError(w, "Verification token has expired. Please request a new one.", http.StatusBadRequest)
		return
	}

	if err := user.UpdateUserVerificationStatus(database.DB, true); err != nil {
		logger.L.Error("Failed to update user verification status in DB", "userID", user.ID, "error", err)
		sendJSONError(w, "Failed to verify email. Please try again or contact support.", http.StatusInternalServerError)
		return
	}

	logger.L.Info("Email verified successfully", "userID", user.ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Email verified successfully! You can now log in."})
}

// GetUserIDFromContext is used by the middleware and other handlers.
func GetUserIDFromContext(ctx context.Context) (int64, bool) {
	userID, ok := ctx.Value(userIDContextKey).(int64)
	return userID, ok
}

// min is a small helper function.
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// --- NOVAS FUNÇÕES DE ADMIN ---

// AdminMiddleware verifica se o utilizador autenticado é um administrador.
func (h *UserHandler) AdminMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := GetUserIDFromContext(r.Context())
		if !ok {
			sendJSONError(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		user, err := model.GetUserByID(database.DB, userID)
		if err != nil {
			sendJSONError(w, "User not found", http.StatusNotFound)
			return
		}

		isUserAdmin := false
		for _, adminEmail := range config.Cfg.AdminEmails {
			if strings.EqualFold(user.Email, adminEmail) {
				isUserAdmin = true
				break
			}
		}

		if !isUserAdmin {
			logger.L.Warn("Admin access denied for user", "userID", user.ID, "email", user.Email)
			sendJSONError(w, "Forbidden: Administrator access required", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Structs para a resposta da API de admin
type AdminStats struct {
	TotalUsers  int          `json:"totalUsers"`
	RecentUsers []SimpleUser `json:"recentUsers"`
}

type SimpleUser struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"createdAt"`
}

// HandleGetAdminStats obtém estatísticas básicas para o dashboard de admin.
func (h *UserHandler) HandleGetAdminStats(w http.ResponseWriter, r *http.Request) {
	var totalUsers int
	err := database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)
	if err != nil {
		logger.L.Error("Failed to get total users for admin stats", "error", err)
		sendJSONError(w, "Failed to get total users", http.StatusInternalServerError)
		return
	}

	rows, err := database.DB.Query("SELECT id, username, email, created_at FROM users ORDER BY created_at DESC LIMIT 20")
	if err != nil {
		logger.L.Error("Failed to get recent users for admin stats", "error", err)
		sendJSONError(w, "Failed to get recent users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var recentUsers []SimpleUser
	for rows.Next() {
		var u SimpleUser
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.CreatedAt); err != nil {
			logger.L.Error("Failed to scan user row for admin stats", "error", err)
			sendJSONError(w, "Failed to scan user row", http.StatusInternalServerError)
			return
		}
		recentUsers = append(recentUsers, u)
	}

	stats := AdminStats{
		TotalUsers:  totalUsers,
		RecentUsers: recentUsers,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
