// backend/src/handlers/user_handler.go
package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
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

// UserHandler now includes the UploadService for the metrics refresh
type UserHandler struct {
	authService   *security.AuthService
	emailService  services.EmailService
	uploadService services.UploadService
}

// NewUserHandler is updated to accept the uploadService
func NewUserHandler(authService *security.AuthService, emailService services.EmailService, uploadService services.UploadService) *UserHandler {
	return &UserHandler{
		authService:   authService,
		emailService:  emailService,
		uploadService: uploadService,
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

// --- INÍCIO DAS NOVAS STRUCTS PARA O DASHBOARD ---

// TimeSeriesDataPoint representa um ponto de dados para gráficos de série temporal.
type TimeSeriesDataPoint struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// NameValueDataPoint é uma struct genérica para gráficos (ex: Pie, Bar).
type NameValueDataPoint struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

// VerificationStatsData contém as estatísticas de verificação de email.
type VerificationStatsData struct {
	Verified   int `json:"verified"`
	Unverified int `json:"unverified"`
}

// TopUser representa um utilizador numa lista de "Top X".
type TopUser struct {
	Email string `json:"email"`
	Value int    `json:"value"`
}

// AdminStats é a struct principal para todos os dados do dashboard de administrador.
type AdminStats struct {
	// Métricas existentes
	TotalUsers         int                   `json:"totalUsers"`
	DailyActiveUsers   int                   `json:"dailyActiveUsers"`
	MonthlyActiveUsers int                   `json:"monthlyActiveUsers"`
	TotalUploads       int                   `json:"totalUploads"`
	TotalTransactions  int                   `json:"totalTransactions"`
	NewUsersToday      int                   `json:"newUsersToday"`
	NewUsersThisWeek   int                   `json:"newUsersThisWeek"`
	NewUsersThisMonth  int                   `json:"newUsersThisMonth"`
	UsersPerDay        []TimeSeriesDataPoint `json:"usersPerDay"`
	UploadsPerDay      []TimeSeriesDataPoint `json:"uploadsPerDay"`
	TransactionsPerDay []TimeSeriesDataPoint `json:"transactionsPerDay"`
	ActiveUsersPerDay  []TimeSeriesDataPoint `json:"activeUsersPerDay"`

	// Novas métricas adicionadas
	VerificationStats        VerificationStatsData `json:"verificationStats"`
	AuthProviderStats        []NameValueDataPoint  `json:"authProviderStats"`
	UploadsByBroker          []NameValueDataPoint  `json:"uploadsByBroker"`
	AvgFileSizeMB            float64               `json:"avgFileSizeMB"`
	AvgTransactionsPerUpload float64               `json:"avgTransactionsPerUpload"`
	TopUsersByUploads        []TopUser             `json:"topUsersByUploads"`
	TopUsersByLogins         []TopUser             `json:"topUsersByLogins"`
}

// --- FIM DAS NOVAS STRUCTS ---

type AdminUserView struct {
	ID                  int64        `json:"id"`
	Username            string       `json:"username"`
	Email               string       `json:"email"`
	AuthProvider        string       `json:"auth_provider"`
	CreatedAt           time.Time    `json:"created_at"`
	TotalUploadCount    int          `json:"total_upload_count"`
	CurrentFileCount    int          `json:"upload_count"`
	DistinctBrokerCount int          `json:"distinct_broker_count"`
	PortfolioValueEUR   float64      `json:"portfolio_value_eur"`
	Top5Holdings        string       `json:"top_5_holdings"`
	LastLoginAt         sql.NullTime `json:"last_login_at"`
	LastLoginIP         string       `json:"last_login_ip"`
	LoginCount          int          `json:"login_count"`
}

func queryTimeSeries(query string) ([]TimeSeriesDataPoint, error) {
	rows, err := database.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []TimeSeriesDataPoint
	for rows.Next() {
		var point TimeSeriesDataPoint
		var nullableDate sql.NullString
		if err := rows.Scan(&nullableDate, &point.Count); err != nil {
			return nil, err
		}
		if nullableDate.Valid {
			point.Date = nullableDate.String
			results = append(results, point)
		}
	}
	return results, nil
}

// --- INÍCIO DA FUNÇÃO ATUALIZADA HandleGetAdminStats ---
func (h *UserHandler) HandleGetAdminStats(w http.ResponseWriter, r *http.Request) {
	var stats AdminStats
	var err error

	// Queries existentes
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&stats.TotalUsers)
	_ = database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM login_history WHERE DATE(login_at) = DATE('now', 'localtime')").Scan(&stats.DailyActiveUsers)
	_ = database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM login_history WHERE login_at >= date('now', '-30 days')").Scan(&stats.MonthlyActiveUsers)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM uploads_history").Scan(&stats.TotalUploads)
	_ = database.DB.QueryRow("SELECT COALESCE(SUM(transaction_count), 0) FROM uploads_history").Scan(&stats.TotalTransactions)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE DATE(created_at) = DATE('now', 'localtime')").Scan(&stats.NewUsersToday)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at >= DATE('now', '-7 days')").Scan(&stats.NewUsersThisWeek)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at >= DATE('now', '-30 days')").Scan(&stats.NewUsersThisMonth)
	stats.UsersPerDay, _ = queryTimeSeries("SELECT DATE(created_at) as date, COUNT(*) as count FROM users WHERE created_at IS NOT NULL GROUP BY date ORDER BY date ASC")
	stats.UploadsPerDay, _ = queryTimeSeries("SELECT DATE(uploaded_at) as date, COUNT(*) as count FROM uploads_history WHERE uploaded_at IS NOT NULL GROUP BY date ORDER BY date ASC")
	stats.TransactionsPerDay, _ = queryTimeSeries("SELECT DATE(uploaded_at) as date, SUM(transaction_count) as count FROM uploads_history WHERE uploaded_at IS NOT NULL GROUP BY date ORDER BY date ASC")
	stats.ActiveUsersPerDay, _ = queryTimeSeries("SELECT DATE(login_at) as date, COUNT(DISTINCT user_id) as count FROM login_history WHERE login_at IS NOT NULL GROUP BY date ORDER BY date ASC")

	// Novas queries
	// 1. Estado de Verificação de Email
	rows, err := database.DB.Query("SELECT is_email_verified, COUNT(*) FROM users GROUP BY is_email_verified")
	if err != nil {
		logger.L.Error("Failed to get email verification stats", "error", err)
	} else {
		for rows.Next() {
			var isVerified bool
			var count int
			if err := rows.Scan(&isVerified, &count); err == nil {
				if isVerified {
					stats.VerificationStats.Verified = count
				} else {
					stats.VerificationStats.Unverified = count
				}
			}
		}
		rows.Close()
	}

	// 2. Método de Autenticação
	rows, err = database.DB.Query("SELECT auth_provider, COUNT(*) FROM users GROUP BY auth_provider")
	if err != nil {
		logger.L.Error("Failed to get auth provider stats", "error", err)
	} else {
		for rows.Next() {
			var point NameValueDataPoint
			if err := rows.Scan(&point.Name, &point.Value); err == nil {
				stats.AuthProviderStats = append(stats.AuthProviderStats, point)
			}
		}
		rows.Close()
	}

	// 3. Popularidade das Corretoras
	rows, err = database.DB.Query("SELECT source, COUNT(*) as count FROM uploads_history GROUP BY source ORDER BY count DESC")
	if err != nil {
		logger.L.Error("Failed to get uploads by broker stats", "error", err)
	} else {
		for rows.Next() {
			var point NameValueDataPoint
			if err := rows.Scan(&point.Name, &point.Value); err == nil {
				stats.UploadsByBroker = append(stats.UploadsByBroker, point)
			}
		}
		rows.Close()
	}

	// 4. Análise de Uploads (Métricas médias)
	err = database.DB.QueryRow(`
		SELECT 
			COALESCE(AVG(file_size), 0) / (1024*1024), 
			COALESCE(AVG(transaction_count), 0) 
		FROM uploads_history
	`).Scan(&stats.AvgFileSizeMB, &stats.AvgTransactionsPerUpload)
	if err != nil {
		logger.L.Error("Failed to get average upload stats", "error", err)
	}

	// 5. Top 10 Utilizadores por Uploads
	rows, err = database.DB.Query("SELECT email, total_upload_count FROM users ORDER BY total_upload_count DESC LIMIT 10")
	if err != nil {
		logger.L.Error("Failed to get top users by uploads", "error", err)
	} else {
		for rows.Next() {
			var user TopUser
			if err := rows.Scan(&user.Email, &user.Value); err == nil {
				stats.TopUsersByUploads = append(stats.TopUsersByUploads, user)
			}
		}
		rows.Close()
	}

	// 6. Top 10 Utilizadores por Logins
	rows, err = database.DB.Query("SELECT email, login_count FROM users ORDER BY login_count DESC LIMIT 10")
	if err != nil {
		logger.L.Error("Failed to get top users by logins", "error", err)
	} else {
		for rows.Next() {
			var user TopUser
			if err := rows.Scan(&user.Email, &user.Value); err == nil {
				stats.TopUsersByLogins = append(stats.TopUsersByLogins, user)
			}
		}
		rows.Close()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// --- FIM DA FUNÇÃO ATUALIZADA HandleGetAdminStats ---

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

		u.LastLoginAt = lastLoginAt
		u.LastLoginIP = lastLoginIP.String
		u.Top5Holdings = topHoldings.String

		users = append(users, u)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func (h *UserHandler) HandleAdminRefreshUserMetrics(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userID")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		sendJSONError(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	logger.L.Info("Admin triggered portfolio metrics refresh for user", "targetUserID", userID)

	err = h.uploadService.UpdateUserPortfolioMetrics(userID)
	if err != nil {
		logger.L.Error("Failed to refresh user portfolio metrics", "targetUserID", userID, "error", err)
		sendJSONError(w, "Failed to update portfolio metrics", http.StatusInternalServerError)
		return
	}

	logger.L.Info("Successfully refreshed portfolio metrics for user", "targetUserID", userID)
	w.WriteHeader(http.StatusNoContent)
}
