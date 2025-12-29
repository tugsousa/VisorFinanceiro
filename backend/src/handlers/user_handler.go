// backend/src/handlers/user_handler.go

package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/models"
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
)

type UserHandler struct {
	authService   *security.AuthService
	emailService  services.EmailService
	uploadService services.UploadService
	cache         *cache.Cache
	mfaService    *services.MFAService
}

type TopStockInfo struct {
	ISIN        string  `json:"isin"`
	ProductName string  `json:"productName"`
	Value       float64 `json:"value"`
}

func validatePasswordComplexity(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters long")
	}

	var (
		hasUpper   bool
		hasLower   bool
		hasNumber  bool
		hasSpecial bool
	)

	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !hasUpper || !hasLower || !hasNumber || !hasSpecial {
		return fmt.Errorf("password must contain at least one uppercase letter, one lowercase letter, one number, and one special character")
	}

	return nil
}

func NewUserHandler(authService *security.AuthService, emailService services.EmailService, uploadService services.UploadService, reportCache *cache.Cache) *UserHandler {
	return &UserHandler{
		authService:   authService,
		emailService:  emailService,
		uploadService: uploadService,
		cache:         reportCache,
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
			logger.L.Warn("Admin access denied for user", "userID", user.ID)
			sendJSONError(w, "Forbidden: Administrator access required", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Stats Structure updated to include all fields required by AdminDashboardPage.js
type AdminStats struct {
	TotalPortfolioValue      float64 `json:"totalPortfolioValue"`
	TotalUsers               int     `json:"totalUsers"`
	DeletedUserCount         int     `json:"deletedUserCount"`
	TotalUploads             int     `json:"totalUploads"`
	DailyActiveUsers         int     `json:"dailyActiveUsers"`
	MonthlyActiveUsers       int     `json:"monthlyActiveUsers"`
	AvgTimeToFirstUploadDays float64 `json:"avgTimeToFirstUploadDays"`
	NewUsersToday            int     `json:"newUsersToday"`
	NewUsersThisWeek         int     `json:"newUsersThisWeek"`
	NewUsersThisMonth        int     `json:"newUsersThisMonth"`
	ActivationRate           float64 `json:"activation_rate"`
	TotalTransactions        int     `json:"total_transactions"`

	// Period Specific Metrics
	NewUsersInPeriod                  int     `json:"newUsersInPeriod"`
	ActiveUsersInPeriod               int     `json:"activeUsersInPeriod"`
	UploadsInPeriod                   int     `json:"uploadsInPeriod"`
	UploadFailureRate                 float64 `json:"uploadFailureRate"`
	TotalCashDepositedEURInPeriod     float64 `json:"totalCashDepositedEURInPeriod"`
	CashDepositsInPeriod              int     `json:"cashDepositsInPeriod"`
	TotalDividendsReceivedEURInPeriod float64 `json:"totalDividendsReceivedEURInPeriod"`
	AvgDividendReceivedEURInPeriod    float64 `json:"avgDividendReceivedEURInPeriod"`

	// Lists / Charts
	TopUsersByLogins                []AdminUserView `json:"topUsersByLogins"`
	TopUsersByUploads               []AdminUserView `json:"topUsersByUploads"`
	VerificationStats               map[string]int  `json:"verificationStats"`
	AuthProviderStats               []ChartData     `json:"authProviderStats"`
	ValueByBroker                   []ChartData     `json:"valueByBroker"`
	DepositsByBroker                []ChartData     `json:"depositsByBroker"`
	TopStocksByValue                []StockMetric   `json:"topStocksByValue"`
	TopStocksByTrades               []StockMetric   `json:"topStocksByTrades"`
	InvestmentDistributionByCountry []ChartData     `json:"investmentDistributionByCountry"`

	// Time Series
	ActiveUsersPerDay []TimeSeriesData `json:"activeUsersPerDay"`
	UsersPerDay       []TimeSeriesData `json:"usersPerDay"`
}

type ChartData struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}

type StockMetric struct {
	ProductName string  `json:"productName"`
	ISIN        string  `json:"isin"`
	Value       float64 `json:"value"`
}

type TimeSeriesData struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

func (h *UserHandler) HandleGetAdminStats(w http.ResponseWriter, r *http.Request) {
	stats := AdminStats{
		VerificationStats: make(map[string]int),
	}

	rangeParam := r.URL.Query().Get("range")

	// Default to a wide interval (effectively "All Time") to keep queries parameterized safely
	interval := "-100 years"

	// Select the SQLite interval modifier based on the requested range
	switch rangeParam {
	case "last_7_days":
		interval = "-7 days"
	case "last_30_days":
		interval = "-30 days"
	case "last_365_days":
		interval = "-365 days"
	}

	// Helper to handle queries safely without repeating code
	// We pass the 'interval' as a parameter (?) to the query
	var usersWithUploads int
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE total_upload_count > 0").Scan(&usersWithUploads)

	if stats.TotalUsers > 0 {
		stats.ActivationRate = (float64(usersWithUploads) / float64(stats.TotalUsers)) * 100
	} else {
		stats.ActivationRate = 0
	}

	// 2. Total Transactions
	database.DB.QueryRow("SELECT COUNT(*) FROM processed_transactions").Scan(&stats.TotalTransactions)

	// 1. General Metrics
	database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&stats.TotalUsers)
	database.DB.QueryRow("SELECT COALESCE(SUM(portfolio_value_eur), 0) FROM users").Scan(&stats.TotalPortfolioValue)
	database.DB.QueryRow("SELECT metric_value FROM system_metrics WHERE metric_name = 'deleted_user_count'").Scan(&stats.DeletedUserCount)
	database.DB.QueryRow("SELECT COUNT(*) FROM uploads_history").Scan(&stats.TotalUploads)

	// Active Users (Using fixed intervals for DAU/MAU standards)
	database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM login_history WHERE login_at > date('now', '-1 day')").Scan(&stats.DailyActiveUsers)
	database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM login_history WHERE login_at > date('now', '-30 days')").Scan(&stats.MonthlyActiveUsers)

	// 2. New Users (Fixed periods)
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at > date('now', 'start of day')").Scan(&stats.NewUsersToday)
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at > date('now', '-7 days')").Scan(&stats.NewUsersThisWeek)
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at > date('now', 'start of month')").Scan(&stats.NewUsersThisMonth)

	// 3. Metrics in Selected Period (Parameterized)
	// Notice we use the '?' placeholder and pass 'interval' as an argument
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at >= date('now', ?)", interval).Scan(&stats.NewUsersInPeriod)
	database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM login_history WHERE login_at >= date('now', ?)", interval).Scan(&stats.ActiveUsersInPeriod)

	var successfulUploads int
	database.DB.QueryRow("SELECT COUNT(*) FROM uploads_history WHERE uploaded_at >= date('now', ?)", interval).Scan(&successfulUploads)
	stats.UploadsInPeriod = successfulUploads

	var failedUploads int
	database.DB.QueryRow("SELECT COUNT(*) FROM upload_failures WHERE failed_at >= date('now', ?)", interval).Scan(&failedUploads)

	totalAttempts := successfulUploads + failedUploads
	if totalAttempts > 0 {
		stats.UploadFailureRate = (float64(failedUploads) / float64(totalAttempts)) * 100
	} else {
		stats.UploadFailureRate = 0
	}

	// 4. Financial Metrics (Global)
	// These were previously filtered by strict string checks; we can keep logic simple for now
	if rangeParam == "all_time" || rangeParam == "" {
		database.DB.QueryRow(`
			SELECT COALESCE(SUM(amount_eur), 0)
			FROM processed_transactions 
			WHERE transaction_type = 'CASH' AND transaction_subtype = 'DEPOSIT'`).Scan(&stats.TotalCashDepositedEURInPeriod)
		database.DB.QueryRow(`
			SELECT COUNT(*) 
			FROM processed_transactions 
			WHERE transaction_type = 'CASH' AND transaction_subtype = 'DEPOSIT'`).Scan(&stats.CashDepositsInPeriod)
		database.DB.QueryRow(`
			SELECT COALESCE(SUM(amount_eur), 0)
			FROM processed_transactions 
			WHERE transaction_type = 'DIVIDEND' AND transaction_subtype != 'TAX'`).Scan(&stats.TotalDividendsReceivedEURInPeriod)
		database.DB.QueryRow(`
			SELECT COALESCE(AVG(amount_eur), 0)
			FROM processed_transactions 
			WHERE transaction_type = 'DIVIDEND' AND transaction_subtype != 'TAX'`).Scan(&stats.AvgDividendReceivedEURInPeriod)
	} else {
		// If you want to support filtering these by date later, add a JOIN with the date column and use 'interval'
		stats.TotalCashDepositedEURInPeriod = 0
		stats.CashDepositsInPeriod = 0
		stats.TotalDividendsReceivedEURInPeriod = 0
		stats.AvgDividendReceivedEURInPeriod = 0
	}

	// KPI: Avg Time to First Upload
	database.DB.QueryRow(`
		SELECT COALESCE(AVG(JULIANDAY(first_upload_at) - JULIANDAY(created_at)), 0)
		FROM users WHERE first_upload_at IS NOT NULL
	`).Scan(&stats.AvgTimeToFirstUploadDays)

	// 5. Verification Stats
	var verified, unverified int
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE is_email_verified = 1").Scan(&verified)
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE is_email_verified = 0").Scan(&unverified)
	stats.VerificationStats = map[string]int{"verified": verified, "unverified": unverified}

	// 6. Top Users Helper
	fetchUsers := func(query string) []AdminUserView {
		rows, _ := database.DB.Query(query)
		if rows == nil {
			return []AdminUserView{}
		}
		defer rows.Close()
		var users []AdminUserView
		for rows.Next() {
			var u AdminUserView
			var lastLogin, topHoldings sql.NullString
			var lastLoginAt sql.NullTime
			rows.Scan(&u.ID, &u.Email, &u.LoginCount, &u.TotalUploadCount, &u.PortfolioValueEUR, &lastLoginAt, &lastLogin, &topHoldings)
			u.LastLoginAt = lastLoginAt
			u.LastLoginIP = lastLogin.String
			u.Top5Holdings = topHoldings.String
			users = append(users, u)
		}
		return users
	}

	stats.TopUsersByLogins = fetchUsers(`
		SELECT id, email, login_count, total_upload_count, portfolio_value_eur, last_login_at, last_login_ip, top_5_holdings
		FROM users ORDER BY login_count DESC LIMIT 5`)

	stats.TopUsersByUploads = fetchUsers(`
		SELECT id, email, login_count, total_upload_count, portfolio_value_eur, last_login_at, last_login_ip, top_5_holdings
		FROM users ORDER BY total_upload_count DESC LIMIT 5`)

	// 7. Broker Charts
	brokerRows, _ := database.DB.Query("SELECT source, COUNT(*) FROM processed_transactions GROUP BY source")
	if brokerRows != nil {
		defer brokerRows.Close()
		for brokerRows.Next() {
			var name string
			var val float64
			brokerRows.Scan(&name, &val)
			stats.ValueByBroker = append(stats.ValueByBroker, ChartData{Name: name, Value: val})
		}
	}

	// 8. Auth Provider Charts
	authRows, _ := database.DB.Query("SELECT auth_provider, COUNT(*) FROM users GROUP BY auth_provider")
	if authRows != nil {
		defer authRows.Close()
		for authRows.Next() {
			var name string
			var val float64
			authRows.Scan(&name, &val)
			stats.AuthProviderStats = append(stats.AuthProviderStats, ChartData{Name: name, Value: val})
		}
	}

	// 9. Timeline Data (Users per day)
	// Parameterized using the same interval logic if you wish, or fixed 30 days as before.
	// We will use strict parameters here as well for consistency.
	rowsUsers, _ := database.DB.Query(`
		SELECT strftime('%Y-%m-%d', created_at) as day, COUNT(*) 
		FROM users 
		WHERE created_at >= date('now', ?) 
		GROUP BY day ORDER BY day ASC
	`, interval) // Changed from hardcoded '-30 days' to follow the filter, or keep '-30 days' if that's the desired UI behavior.

	// If you prefer the chart to ALWAYS be 30 days regardless of filter:
	// replace `interval` with `"-30 days"` in the line above.

	if rowsUsers != nil {
		defer rowsUsers.Close()
		for rowsUsers.Next() {
			var d TimeSeriesData
			rowsUsers.Scan(&d.Date, &d.Count)
			stats.UsersPerDay = append(stats.UsersPerDay, d)
		}
	}

	// 10. Timeline Data (Active Users)
	rowsActive, _ := database.DB.Query(`
		SELECT strftime('%Y-%m-%d', login_at) as day, COUNT(DISTINCT user_id) 
		FROM login_history 
		WHERE login_at >= date('now', ?) 
		GROUP BY day ORDER BY day ASC
	`, interval) // Same note as above

	if rowsActive != nil {
		defer rowsActive.Close()
		for rowsActive.Next() {
			var d TimeSeriesData
			rowsActive.Scan(&d.Date, &d.Count)
			stats.ActiveUsersPerDay = append(stats.ActiveUsersPerDay, d)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (h *UserHandler) HandleGetAdminUsers(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize < 1 {
		pageSize = 25
	}
	offset := (page - 1) * pageSize

	sortBy := r.URL.Query().Get("sortBy")
	order := strings.ToUpper(r.URL.Query().Get("order")) // Normalize to uppercase

	// 1. White-list allowed columns for sorting
	validSorts := map[string]bool{
		"created_at":          true,
		"login_count":         true,
		"portfolio_value_eur": true,
		"total_upload_count":  true,
		"email":               true,
	}
	if !validSorts[sortBy] {
		sortBy = "created_at"
	}

	// 2. White-list sort direction
	if order != "ASC" && order != "DESC" {
		order = "DESC"
	}

	// 3. Safe Construction
	// Because 'sortBy' and 'order' are strictly checked against our hardcoded values above,
	// using Sprintf here is safe from injection.
	query := fmt.Sprintf(`
		SELECT id, username, email, auth_provider, created_at, total_upload_count, upload_count,
		(SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = u.id) as distinct_broker_count,
		portfolio_value_eur, top_5_holdings, last_login_at, last_login_ip, login_count
		FROM users u
		ORDER BY %s %s LIMIT ? OFFSET ?`, sortBy, order)

	rows, err := database.DB.Query(query, pageSize, offset)
	if err != nil {
		logger.L.Error("Failed to list users", "error", err)
		sendJSONError(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []AdminUserView
	for rows.Next() {
		var u AdminUserView
		var lastLoginIP, topHoldings sql.NullString
		var lastLoginAt sql.NullTime
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.AuthProvider, &u.CreatedAt, &u.TotalUploadCount, &u.CurrentFileCount, &u.DistinctBrokerCount, &u.PortfolioValueEUR, &topHoldings, &lastLoginAt, &lastLoginIP, &u.LoginCount); err == nil {
			u.LastLoginAt = lastLoginAt
			u.LastLoginIP = lastLoginIP.String
			u.Top5Holdings = topHoldings.String
			users = append(users, u)
		}
	}

	var totalRows int
	database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalRows)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"users":     users,
		"totalRows": totalRows,
	})
}

// HandleAdminRefreshUserMetrics refreshes metrics for all portfolios of a user.
func (h *UserHandler) HandleAdminRefreshUserMetrics(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userID")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		sendJSONError(w, "Invalid user ID format", http.StatusBadRequest)
		return
	}

	logger.L.Info("Admin triggered portfolio metrics refresh for user", "targetUserID", userID)

	rows, err := database.DB.Query("SELECT id FROM portfolios WHERE user_id = ?", userID)
	if err != nil {
		logger.L.Error("Failed to fetch user portfolios for refresh", "userID", userID, "error", err)
		sendJSONError(w, "Failed to fetch user portfolios", http.StatusInternalServerError)
		return
	}

	var portfolioIDs []int64
	for rows.Next() {
		var pfID int64
		if err := rows.Scan(&pfID); err == nil {
			portfolioIDs = append(portfolioIDs, pfID)
		}
	}
	rows.Close()

	var successCount, failCount int
	for _, pfID := range portfolioIDs {
		if err := h.uploadService.UpdateUserPortfolioMetrics(userID, pfID); err != nil {
			logger.L.Error("Failed to refresh metrics for portfolio", "pfID", pfID, "error", err)
			failCount++
		} else {
			successCount++
		}
	}

	logger.L.Info("Refreshed user portfolios", "userID", userID, "success", successCount, "fail", failCount)
	w.WriteHeader(http.StatusNoContent)
}

type UploadHistoryEntry struct {
	ID               int       `json:"id"`
	UploadedAt       time.Time `json:"uploaded_at"`
	Source           string    `json:"source"`
	Filename         string    `json:"filename"`
	FileSize         int64     `json:"file_size"`
	TransactionCount int       `json:"transaction_count"`
	PortfolioName    string    `json:"portfolio_name"`
}

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

type AdminUserDetailsResponse struct {
	User                AdminUserView                 `json:"user"`
	Portfolios          []models.Portfolio            `json:"portfolios"`
	UploadHistory       []UploadHistoryEntry          `json:"upload_history"`
	Transactions        []models.ProcessedTransaction `json:"transactions"`
	Metrics             *services.UploadResult        `json:"metrics,omitempty"`
	CurrentHoldings     []models.HoldingWithValue     `json:"current_holdings"`
	DefaultPortfolioID  int64                         `json:"default_portfolio_id"`
	SelectedPortfolioID int64                         `json:"selected_portfolio_id"`
}

func (h *UserHandler) HandleGetAdminUserDetails(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userID")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		sendJSONError(w, "Formato de ID de utilizador inválido", http.StatusBadRequest)
		return
	}

	var portfolios []models.Portfolio
	pRows, err := database.DB.Query("SELECT id, user_id, name, description, is_default, created_at FROM portfolios WHERE user_id = ?", userID)
	if err != nil {
		logger.L.Error("Failed to fetch user portfolios", "error", err)
		sendJSONError(w, "DB Error", http.StatusInternalServerError)
		return
	}
	defer pRows.Close()

	var defaultPortfolioID int64
	for pRows.Next() {
		var p models.Portfolio
		if err := pRows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.IsDefault, &p.CreatedAt); err == nil {
			portfolios = append(portfolios, p)
			if p.IsDefault {
				defaultPortfolioID = p.ID
			}
		}
	}

	targetPortfolioID := defaultPortfolioID
	if queryPID := r.URL.Query().Get("portfolio_id"); queryPID != "" {
		if pid, err := strconv.ParseInt(queryPID, 10, 64); err == nil {
			for _, p := range portfolios {
				if p.ID == pid {
					targetPortfolioID = pid
					break
				}
			}
		}
	}

	if targetPortfolioID == 0 && len(portfolios) > 0 {
		targetPortfolioID = portfolios[0].ID
	}

	var response AdminUserDetailsResponse
	response.DefaultPortfolioID = defaultPortfolioID
	response.SelectedPortfolioID = targetPortfolioID
	response.Portfolios = portfolios

	queryUser := `
		SELECT u.id, u.username, u.email, u.auth_provider, u.created_at, u.total_upload_count, u.upload_count,
			(SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = u.id) as distinct_broker_count,
			u.portfolio_value_eur, u.top_5_holdings, u.last_login_at, u.last_login_ip, u.login_count
		FROM users u WHERE u.id = ?`

	row := database.DB.QueryRow(queryUser, userID)
	var u AdminUserView
	var lastLoginIP, topHoldings sql.NullString
	var lastLoginAt sql.NullTime
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.AuthProvider, &u.CreatedAt, &u.TotalUploadCount, &u.CurrentFileCount, &u.DistinctBrokerCount, &u.PortfolioValueEUR, &topHoldings, &lastLoginAt, &lastLoginIP, &u.LoginCount); err != nil {
		if err == sql.ErrNoRows {
			sendJSONError(w, "Utilizador não encontrado", http.StatusNotFound)
			return
		}
		logger.L.Error("Falha ao obter detalhes do utilizador", "error", err)
		sendJSONError(w, "Falha ao obter detalhes do utilizador", http.StatusInternalServerError)
		return
	}
	u.LastLoginAt = lastLoginAt
	u.LastLoginIP = lastLoginIP.String
	u.Top5Holdings = topHoldings.String
	response.User = u

	rowsUploads, err := database.DB.Query(`
        SELECT uh.id, uh.uploaded_at, uh.source, uh.filename, uh.file_size, uh.transaction_count, p.name
        FROM uploads_history uh
        LEFT JOIN portfolios p ON uh.portfolio_id = p.id
        WHERE uh.user_id = ? 
        ORDER BY uh.uploaded_at DESC LIMIT 100`, userID)
	if err == nil {
		defer rowsUploads.Close()
		for rowsUploads.Next() {
			var entry UploadHistoryEntry
			var filename, pfName sql.NullString
			var filesize sql.NullInt64
			if err := rowsUploads.Scan(&entry.ID, &entry.UploadedAt, &entry.Source, &filename, &filesize, &entry.TransactionCount, &pfName); err == nil {
				entry.Filename = filename.String
				entry.FileSize = filesize.Int64
				entry.PortfolioName = pfName.String
				response.UploadHistory = append(response.UploadHistory, entry)
			}
		}
	}

	if targetPortfolioID > 0 {
		rowsTxs, err := database.DB.Query(`
			SELECT id, date, source, product_name, isin, quantity, original_quantity, price, 
			       transaction_type, transaction_subtype, buy_sell, description, amount, currency, commission, 
			       order_id, exchange_rate, amount_eur, country_code, input_string, hash_id
			FROM processed_transactions WHERE user_id = ? AND portfolio_id = ? ORDER BY date DESC LIMIT 500`, userID, targetPortfolioID)
		if err == nil {
			defer rowsTxs.Close()
			for rowsTxs.Next() {
				var tx models.ProcessedTransaction
				if err := rowsTxs.Scan(
					&tx.ID, &tx.Date, &tx.Source, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.OriginalQuantity, &tx.Price,
					&tx.TransactionType, &tx.TransactionSubType, &tx.BuySell, &tx.Description, &tx.Amount, &tx.Currency,
					&tx.Commission, &tx.OrderID, &tx.ExchangeRate, &tx.AmountEUR, &tx.CountryCode, &tx.InputString, &tx.HashId,
				); err == nil {
					response.Transactions = append(response.Transactions, tx)
				}
			}
		}

		metrics, err := h.uploadService.GetLatestUploadResult(userID, targetPortfolioID)
		if err == nil {
			response.Metrics = metrics
		}

		currentHoldings, err := h.uploadService.GetCurrentHoldingsWithValue(userID, targetPortfolioID)
		if err == nil {
			response.CurrentHoldings = currentHoldings
		} else {
			response.CurrentHoldings = []models.HoldingWithValue{}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

type BatchRequest struct {
	UserIDs []int64 `json:"user_ids"`
}

func (h *UserHandler) HandleAdminRefreshMultipleUserMetrics(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

func (h *UserHandler) HandleAdminClearStatsCache(w http.ResponseWriter, r *http.Request) {
	h.cache.Flush()
	w.WriteHeader(http.StatusNoContent)
}

type ImpersonateRequest struct {
	MfaCode string `json:"mfa_code"`
}

func (h *UserHandler) HandleImpersonateUser(w http.ResponseWriter, r *http.Request) {
	// 1. Obter o ID do Admin que está a fazer o pedido
	adminID, _ := GetUserIDFromContext(r.Context())

	// 2. Parse do targetUserID da URL
	targetUserIDStr := chi.URLParam(r, "userID")
	targetUserID, err := strconv.ParseInt(targetUserIDStr, 10, 64)
	if err != nil {
		sendJSONError(w, "ID de utilizador inválido", http.StatusBadRequest)
		return
	}

	// 3. Ler o código MFA do body
	var req ImpersonateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// --- FIX: Sanitize Input ---
	// Trim whitespace to prevent copy-paste errors
	req.MfaCode = strings.TrimSpace(req.MfaCode)

	// 4. Buscar dados do ADMIN para validar o MFA dele
	adminUser, err := model.GetUserByID(database.DB, adminID)
	if err != nil {
		sendJSONError(w, "Admin user not found", http.StatusUnauthorized)
		return
	}

	// 5. Verificar se o admin tem MFA ativo
	if !adminUser.MfaEnabled {
		sendJSONError(w, "MFA required. Please enable 2FA in your profile settings.", http.StatusForbidden)
		return
	}

	// --- DEBUG LOGGING ---
	logger.L.Info("MFA Debug: Impersonation Attempt",
		"adminID", adminID,
		"adminUsername", adminUser.Username,
		"secret_exists", len(adminUser.MfaSecret) > 0,
		"secret_len", len(adminUser.MfaSecret),
		"input_code_received", req.MfaCode,
	)

	// 6. Validar o código MFA
	if !h.mfaService.ValidateToken(adminUser.MfaSecret, req.MfaCode) {
		logger.L.Warn("Failed MFA attempt for impersonation: Invalid Code",
			"adminID", adminID,
			"input_code", req.MfaCode)
		sendJSONError(w, "Código MFA inválido", http.StatusUnauthorized)
		return
	}

	user, err := model.GetUserByID(database.DB, targetUserID)
	if err != nil {
		sendJSONError(w, "Utilizador não encontrado", http.StatusNotFound)
		return
	}

	// 1. Gerar Access Token
	accessToken, err := h.authService.GenerateToken(fmt.Sprintf("%d", user.ID))
	if err != nil {
		logger.L.Error("Falha ao gerar token de impersonation", "error", err)
		sendJSONError(w, "Erro ao gerar acesso", http.StatusInternalServerError)
		return
	}

	// 2. Gerar Refresh Token
	refreshToken, err := h.authService.GenerateRefreshToken()
	if err != nil {
		logger.L.Error("Falha ao gerar refresh token de impersonation", "error", err)
		sendJSONError(w, "Erro ao gerar credenciais", http.StatusInternalServerError)
		return
	}

	// 3. CRIAR A SESSÃO NA BASE DE DADOS
	session := &model.Session{
		UserID:       user.ID,
		Token:        accessToken,
		RefreshToken: refreshToken,
		UserAgent:    "Admin-Impersonation (" + r.UserAgent() + ")",
		ClientIP:     r.RemoteAddr,
		IsBlocked:    false,
		ExpiresAt:    time.Now().Add(config.Cfg.RefreshTokenExpiry),
	}

	if err := model.CreateSession(database.DB, session); err != nil {
		logger.L.Error("Falha ao registar sessão de impersonation na BD", "userID", user.ID, "error", err)
		sendJSONError(w, "Falha ao iniciar sessão simulada", http.StatusInternalServerError)
		return
	}

	// 4. SECURITY UPDATE: Set Refresh Cookie for the impersonated session
	setRefreshTokenCookie(w, refreshToken, config.Cfg.RefreshTokenExpiry)

	// 5. Retornar resposta (sem refresh_token no corpo)
	response := map[string]interface{}{
		"access_token": accessToken,
		"user": map[string]interface{}{
			"id":            user.ID,
			"username":      user.Username,
			"email":         user.Email,
			"auth_provider": user.AuthProvider,
			"is_admin":      isAdmin(user.Email),
			"mfa_enabled":   user.MfaEnabled,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *UserHandler) HandleSetupMFA(w http.ResponseWriter, r *http.Request) {
	userID, _ := GetUserIDFromContext(r.Context())

	// Buscar user para obter o username (para o QR code ficar bonito no Google Auth)
	user, err := model.GetUserByID(database.DB, userID)
	if err != nil {
		sendJSONError(w, "User not found", http.StatusNotFound)
		return
	}

	secret, qrCode, err := h.mfaService.GenerateMFASecret(user.Username)
	if err != nil {
		sendJSONError(w, "Failed to generate MFA", http.StatusInternalServerError)
		return
	}

	// Guardar o segredo temporariamente na BD (mas NÃO ativar ainda mfa_enabled)
	// Precisas de criar um método no model UpdateMfaSecret(userID, secret)
	if err := user.UpdateMfaSecret(database.DB, secret); err != nil {
		sendJSONError(w, "Failed to save MFA secret", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"secret":  secret, // Opcional enviar o texto, caso o QR falhe
		"qr_code": qrCode, // Imagem base64
	})
}

func (h *UserHandler) HandleActivateMFA(w http.ResponseWriter, r *http.Request) {
	userID, _ := GetUserIDFromContext(r.Context())

	var req struct {
		Code string `json:"code"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	user, _ := model.GetUserByID(database.DB, userID)

	if !h.mfaService.ValidateToken(user.MfaSecret, req.Code) {
		sendJSONError(w, "Código inválido", http.StatusUnauthorized)
		return
	}

	// Ativar na BD. Criar método UpdateMfaEnabled(userID, true)
	user.UpdateMfaEnabled(database.DB, true)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "MFA Ativado com sucesso"})
}
