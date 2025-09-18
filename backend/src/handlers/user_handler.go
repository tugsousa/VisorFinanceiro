package handlers

import (
	"context"
	"database/sql"
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

func sendJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	logger.L.Warn("Sending JSON error to client", "message", message, "statusCode", statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

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

func GetUserIDFromContext(ctx context.Context) (int64, bool) {
	userID, ok := ctx.Value(userIDContextKey).(int64)
	return userID, ok
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// --- ADMIN FUNCTIONS ---

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

// Structs for the new Admin Dashboard API response
type TimeSeriesDataPoint struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type AdminStats struct {
	TotalUsers         int                   `json:"totalUsers"`
	DailyActiveUsers   int                   `json:"dailyActiveUsers"`
	MonthlyActiveUsers int                   `json:"monthlyActiveUsers"`
	TotalUploads       int                   `json:"totalUploads"`
	TotalTransactions  int                   `json:"totalTransactions"`
	UsersPerDay        []TimeSeriesDataPoint `json:"usersPerDay"`
	UploadsPerDay      []TimeSeriesDataPoint `json:"uploadsPerDay"`
	TransactionsPerDay []TimeSeriesDataPoint `json:"transactionsPerDay"`
	ActiveUsersPerDay  []TimeSeriesDataPoint `json:"activeUsersPerDay"`
}

type AdminUserView struct {
	ID                  int64          `json:"id"`
	Username            string         `json:"username"`
	Email               string         `json:"email"`
	AuthProvider        string         `json:"auth_provider"`
	CreatedAt           time.Time      `json:"created_at"`
	TotalUploadCount    int            `json:"total_upload_count"`
	CurrentFileCount    int            `json:"upload_count"`
	DistinctBrokerCount int            `json:"distinct_broker_count"`
	PortfolioValueEUR   float64        `json:"portfolio_value_eur"`
	Top5Holdings        string         `json:"top_5_holdings"` // JSON string
	LastLoginAt         model.NullTime `json:"last_login_at"`
	LastLoginIP         string         `json:"last_login_ip"`
	LoginCount          int            `json:"login_count"`
}

// Generic helper for time series queries
func queryTimeSeries(query string) ([]TimeSeriesDataPoint, error) {
	rows, err := database.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []TimeSeriesDataPoint
	for rows.Next() {
		var point TimeSeriesDataPoint
		if err := rows.Scan(&point.Date, &point.Count); err != nil {
			return nil, err
		}
		results = append(results, point)
	}
	return results, nil
}

func (h *UserHandler) HandleGetAdminStats(w http.ResponseWriter, r *http.Request) {
	var stats AdminStats
	var err error

	// Simple counts
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&stats.TotalUsers)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM login_history WHERE DATE(login_at) = DATE('now')").Scan(&stats.DailyActiveUsers)
	_ = database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM login_history WHERE login_at >= date('now', '-30 days')").Scan(&stats.MonthlyActiveUsers)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM uploads_history").Scan(&stats.TotalUploads)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM processed_transactions").Scan(&stats.TotalTransactions)

	// Time series data
	stats.UsersPerDay, err = queryTimeSeries("SELECT DATE(created_at) as date, COUNT(*) as count FROM users GROUP BY date ORDER BY date ASC")
	if err != nil {
		logger.L.Error("Failed to get users per day", "error", err)
	}
	stats.UploadsPerDay, err = queryTimeSeries("SELECT DATE(uploaded_at) as date, COUNT(*) as count FROM uploads_history GROUP BY date ORDER BY date ASC")
	if err != nil {
		logger.L.Error("Failed to get uploads per day", "error", err)
	}
	stats.TransactionsPerDay, err = queryTimeSeries("SELECT DATE(SUBSTR(date, 7, 4) || '-' || SUBSTR(date, 4, 2) || '-' || SUBSTR(date, 1, 2)) as date, COUNT(*) as count FROM processed_transactions GROUP BY date ORDER BY date ASC")
	if err != nil {
		logger.L.Error("Failed to get transactions per day", "error", err)
	}
	stats.ActiveUsersPerDay, err = queryTimeSeries("SELECT DATE(login_at) as date, COUNT(DISTINCT user_id) as count FROM login_history GROUP BY date ORDER BY date ASC")
	if err != nil {
		logger.L.Error("Failed to get active users per day", "error", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (h *UserHandler) HandleGetAdminUsers(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT 
			u.id, u.username, u.email, u.auth_provider, u.created_at,
			u.total_upload_count, u.upload_count,
			(SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = u.id) as distinct_broker_count,
			u.portfolio_value_eur, u.top_5_holdings,
			u.last_login_at, u.last_login_ip, u.login_count
		FROM users u
		ORDER BY u.created_at DESC
	`

	rows, err := database.DB.Query(query)
	if err != nil {
		logger.L.Error("Failed to get admin user list", "error", err)
		sendJSONError(w, "Failed to retrieve user list", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []AdminUserView
	for rows.Next() {
		var u AdminUserView
		var lastLoginIP, topHoldings sql.NullString
		var lastLoginAt sql.NullTime

		if err := rows.Scan(
			&u.ID, &u.Username, &u.Email, &u.AuthProvider, &u.CreatedAt,
			&u.TotalUploadCount, &u.CurrentFileCount, &u.DistinctBrokerCount,
			&u.PortfolioValueEUR, &topHoldings,
			&lastLoginAt, &lastLoginIP, &u.LoginCount,
		); err != nil {
			logger.L.Error("Failed to scan admin user row", "error", err)
			sendJSONError(w, "Failed to process user data", http.StatusInternalServerError)
			return
		}

		u.LastLoginAt = model.NullTime(lastLoginAt)
		u.LastLoginIP = lastLoginIP.String
		u.Top5Holdings = topHoldings.String

		users = append(users, u)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
