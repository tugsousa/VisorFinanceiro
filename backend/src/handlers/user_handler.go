// backend/src/handlers/user_handler.go
package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt" // Importação adicionada
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/patrickmn/go-cache" // --- NOVO: Importar go-cache ---
	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/model"
	"github.com/username/taxfolio/backend/src/models" // Importação adicionada
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
	"golang.org/x/oauth2"
)

// --- O código existente até às funções de Admin permanece o mesmo ---
type contextKey string

const userIDContextKey contextKey = "userID"

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
var passwordRegex = regexp.MustCompile(`^.{6,}$`)

var (
	googleOauthConfig *oauth2.Config
	oauthStateString  = "random-string-for-security"
)

type UserHandler struct {
	authService   *security.AuthService
	emailService  services.EmailService
	uploadService services.UploadService
	cache         *cache.Cache // --- NOVO: Adicionar cache ao handler ---
}

func NewUserHandler(authService *security.AuthService, emailService services.EmailService, uploadService services.UploadService, reportCache *cache.Cache) *UserHandler { // --- ALTERAÇÃO AQUI ---
	return &UserHandler{
		authService:   authService,
		emailService:  emailService,
		uploadService: uploadService,
		cache:         reportCache, // --- NOVO: Atribuir o cache ---
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

// --- FIM DO CÓDIGO EXISTENTE ---

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

type TimeSeriesDataPoint struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type NameValueDataPoint struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type VerificationStatsData struct {
	Verified   int `json:"verified"`
	Unverified int `json:"unverified"`
}

type TopUser struct {
	Email string `json:"email"`
	Value int    `json:"value"`
}

type AdminStats struct {
	TotalUsers               int                   `json:"totalUsers"`
	DailyActiveUsers         int                   `json:"dailyActiveUsers"`
	MonthlyActiveUsers       int                   `json:"monthlyActiveUsers"`
	TotalUploads             int                   `json:"totalUploads"`
	TotalTransactions        int                   `json:"totalTransactions"`
	NewUsersToday            int                   `json:"newUsersToday"`
	NewUsersThisWeek         int                   `json:"newUsersThisWeek"`
	NewUsersThisMonth        int                   `json:"newUsersThisMonth"`
	UsersPerDay              []TimeSeriesDataPoint `json:"usersPerDay"`
	UploadsPerDay            []TimeSeriesDataPoint `json:"uploadsPerDay"`
	TransactionsPerDay       []TimeSeriesDataPoint `json:"transactionsPerDay"`
	ActiveUsersPerDay        []TimeSeriesDataPoint `json:"activeUsersPerDay"`
	VerificationStats        VerificationStatsData `json:"verificationStats"`
	AuthProviderStats        []NameValueDataPoint  `json:"authProviderStats"`
	UploadsByBroker          []NameValueDataPoint  `json:"uploadsByBroker"`
	AvgFileSizeMB            float64               `json:"avgFileSizeMB"`
	AvgTransactionsPerUpload float64               `json:"avgTransactionsPerUpload"`
	TopUsersByUploads        []TopUser             `json:"topUsersByUploads"`
	TopUsersByLogins         []TopUser             `json:"topUsersByLogins"`
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

// --- NOVA: Estrutura para a resposta paginada ---
type AdminUsersPaginatedResponse struct {
	Users     []AdminUserView `json:"users"`
	TotalRows int             `json:"totalRows"`
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

// --- FUNÇÃO ATUALIZADA HandleGetAdminStats com CACHE ---
func (h *UserHandler) HandleGetAdminStats(w http.ResponseWriter, r *http.Request) {
	dateRange := r.URL.Query().Get("range")
	if dateRange == "" {
		dateRange = "all_time"
	}

	// 1. Verificar o cache
	cacheKey := fmt.Sprintf("admin_stats_%s", dateRange)
	if cached, found := h.cache.Get(cacheKey); found {
		logger.L.Info("Admin stats cache hit", "key", cacheKey)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cached)
		return
	}
	logger.L.Info("Admin stats cache miss", "key", cacheKey)

	// 2. Se não estiver no cache, calcular como antes
	var stats AdminStats
	var err error

	getWhereClause := func(columnName string) string {
		switch dateRange {
		case "last_7_days":
			return fmt.Sprintf(" WHERE %s >= DATE('now', '-7 days')", columnName)
		case "last_30_days":
			return fmt.Sprintf(" WHERE %s >= DATE('now', '-30 days')", columnName)
		case "this_month":
			return fmt.Sprintf(" WHERE STRFTIME('%%Y-%%m', %s) = STRFTIME('%%Y-%%m', 'now', 'localtime')", columnName)
		case "this_year":
			return fmt.Sprintf(" WHERE STRFTIME('%%Y', %s) = STRFTIME('%%Y', 'now', 'localtime')", columnName)
		default:
			return ""
		}
	}

	usersWhere := getWhereClause("created_at")
	uploadsWhere := getWhereClause("uploaded_at")
	loginHistoryWhere := getWhereClause("login_at")

	_ = database.DB.QueryRow("SELECT COUNT(*) FROM users" + usersWhere).Scan(&stats.TotalUsers)
	_ = database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM login_history WHERE DATE(login_at) = DATE('now', 'localtime')").Scan(&stats.DailyActiveUsers)
	_ = database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM login_history" + getWhereClause("login_at")).Scan(&stats.MonthlyActiveUsers)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM uploads_history" + uploadsWhere).Scan(&stats.TotalUploads)
	_ = database.DB.QueryRow("SELECT COALESCE(SUM(transaction_count), 0) FROM uploads_history" + uploadsWhere).Scan(&stats.TotalTransactions)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE DATE(created_at) = DATE('now', 'localtime')").Scan(&stats.NewUsersToday)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM users" + getWhereClause("created_at")).Scan(&stats.NewUsersThisWeek)

	stats.UsersPerDay, _ = queryTimeSeries("SELECT DATE(created_at) as date, COUNT(*) as count FROM users" + usersWhere + " AND created_at IS NOT NULL GROUP BY date ORDER BY date ASC")
	stats.UploadsPerDay, _ = queryTimeSeries("SELECT DATE(uploaded_at) as date, COUNT(*) as count FROM uploads_history" + uploadsWhere + " AND uploaded_at IS NOT NULL GROUP BY date ORDER BY date ASC")
	stats.TransactionsPerDay, _ = queryTimeSeries("SELECT DATE(uploaded_at) as date, SUM(transaction_count) as count FROM uploads_history" + uploadsWhere + " AND uploaded_at IS NOT NULL GROUP BY date ORDER BY date ASC")
	stats.ActiveUsersPerDay, _ = queryTimeSeries("SELECT DATE(login_at) as date, COUNT(DISTINCT user_id) as count FROM login_history" + loginHistoryWhere + " AND login_at IS NOT NULL GROUP BY date ORDER BY date ASC")

	rows, err := database.DB.Query("SELECT is_email_verified, COUNT(*) FROM users GROUP BY is_email_verified")
	if err == nil {
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

	rows, err = database.DB.Query("SELECT auth_provider, COUNT(*) FROM users GROUP BY auth_provider")
	if err == nil {
		for rows.Next() {
			var point NameValueDataPoint
			if err := rows.Scan(&point.Name, &point.Value); err == nil {
				stats.AuthProviderStats = append(stats.AuthProviderStats, point)
			}
		}
		rows.Close()
	}

	rows, err = database.DB.Query("SELECT source, COUNT(*) as count FROM uploads_history GROUP BY source ORDER BY count DESC")
	if err == nil {
		for rows.Next() {
			var point NameValueDataPoint
			if err := rows.Scan(&point.Name, &point.Value); err == nil {
				stats.UploadsByBroker = append(stats.UploadsByBroker, point)
			}
		}
		rows.Close()
	}

	_ = database.DB.QueryRow(`SELECT COALESCE(AVG(file_size), 0) / (1024*1024), COALESCE(AVG(transaction_count), 0) FROM uploads_history`+uploadsWhere).Scan(&stats.AvgFileSizeMB, &stats.AvgTransactionsPerUpload)

	rows, err = database.DB.Query("SELECT email, total_upload_count FROM users ORDER BY total_upload_count DESC LIMIT 10")
	if err == nil {
		for rows.Next() {
			var user TopUser
			if err := rows.Scan(&user.Email, &user.Value); err == nil {
				stats.TopUsersByUploads = append(stats.TopUsersByUploads, user)
			}
		}
		rows.Close()
	}

	rows, err = database.DB.Query("SELECT email, login_count FROM users ORDER BY login_count DESC LIMIT 10")
	if err == nil {
		for rows.Next() {
			var user TopUser
			if err := rows.Scan(&user.Email, &user.Value); err == nil {
				stats.TopUsersByLogins = append(stats.TopUsersByLogins, user)
			}
		}
		rows.Close()
	}

	// 3. Guardar os resultados no cache antes de responder
	h.cache.Set(cacheKey, stats, 10*time.Minute)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// --- FUNÇÃO ATUALIZADA HandleGetAdminUsers com PAGINAÇÃO ---
func (h *UserHandler) HandleGetAdminUsers(w http.ResponseWriter, r *http.Request) {
	// 1. Extrair e validar parâmetros da query
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize < 10 {
		pageSize = 10
	} else if pageSize > 100 {
		pageSize = 100
	}

	sortBy := r.URL.Query().Get("sortBy")
	order := strings.ToUpper(r.URL.Query().Get("order"))
	if order != "ASC" && order != "DESC" {
		order = "DESC"
	}

	// Whitelist para colunas de ordenação para prevenir SQL injection
	allowedSortBy := map[string]string{
		"id":                  "u.id",
		"email":               "u.email",
		"created_at":          "u.created_at",
		"total_upload_count":  "u.total_upload_count",
		"portfolio_value_eur": "u.portfolio_value_eur",
		"login_count":         "u.login_count",
		"last_login_at":       "u.last_login_at",
	}
	sortByColumn, ok := allowedSortBy[sortBy]
	if !ok {
		sortByColumn = "u.created_at" // Padrão
	}

	offset := (page - 1) * pageSize

	// 2. Query para obter o número total de utilizadores
	var totalRows int
	countQuery := "SELECT COUNT(*) FROM users"
	if err := database.DB.QueryRow(countQuery).Scan(&totalRows); err != nil {
		logger.L.Error("Failed to count admin users", "error", err)
		sendJSONError(w, "Failed to retrieve user count", http.StatusInternalServerError)
		return
	}

	// 3. Query para obter os dados paginados
	query := fmt.Sprintf(`
		SELECT u.id, u.username, u.email, u.auth_provider, u.created_at, u.total_upload_count, u.upload_count,
			(SELECT COUNT(DISTINCT source) FROM processed_transactions WHERE user_id = u.id) as distinct_broker_count,
			u.portfolio_value_eur, u.top_5_holdings, u.last_login_at, u.last_login_ip, u.login_count
		FROM users u
		ORDER BY %s %s
		LIMIT ? OFFSET ?
	`, sortByColumn, order)

	rows, err := database.DB.Query(query, pageSize, offset)
	if err != nil {
		logger.L.Error("Failed to get paginated admin user list", "error", err)
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
			&u.ID, &u.Username, &u.Email, &u.AuthProvider, &u.CreatedAt, &u.TotalUploadCount,
			&u.CurrentFileCount, &u.DistinctBrokerCount, &u.PortfolioValueEUR, &topHoldings,
			&lastLoginAt, &lastLoginIP, &u.LoginCount,
		); err != nil {
			logger.L.Error("Failed to scan admin user row", "error", err)
			continue
		}
		u.LastLoginAt = lastLoginAt
		u.LastLoginIP = lastLoginIP.String
		u.Top5Holdings = topHoldings.String
		users = append(users, u)
	}

	// 4. Construir a resposta
	response := AdminUsersPaginatedResponse{
		Users:     users,
		TotalRows: totalRows,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
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

// --- INÍCIO DOS NOVOS HANDLERS ---

// Estruturas de resposta para o drill-down do utilizador.
// Estas podem ser movidas para um ficheiro de models se preferir.
type UploadHistoryEntry struct {
	ID               int       `json:"id"`
	UploadedAt       time.Time `json:"uploaded_at"`
	Source           string    `json:"source"`
	Filename         string    `json:"filename"`
	FileSize         int64     `json:"file_size"`
	TransactionCount int       `json:"transaction_count"`
}

type AdminUserDetailsResponse struct {
	User          AdminUserView                 `json:"user"`
	UploadHistory []UploadHistoryEntry          `json:"upload_history"`
	Transactions  []models.ProcessedTransaction `json:"transactions"`
}

// HandleGetAdminUserDetails gere o pedido para a página de detalhes do utilizador (drill-down).
func (h *UserHandler) HandleGetAdminUserDetails(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userID")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		sendJSONError(w, "Formato de ID de utilizador inválido", http.StatusBadRequest)
		return
	}

	var response AdminUserDetailsResponse

	// 1. Obter detalhes do utilizador
	// (Reutilizando a lógica de query de HandleGetAdminUsers para um único utilizador)
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
		logger.L.Error("Falha ao obter detalhes do utilizador para drill-down", "error", err, "userID", userID)
		sendJSONError(w, "Falha ao obter detalhes do utilizador", http.StatusInternalServerError)
		return
	}
	u.LastLoginAt = lastLoginAt
	u.LastLoginIP = lastLoginIP.String
	u.Top5Holdings = topHoldings.String
	response.User = u

	// 2. Obter histórico de uploads
	rowsUploads, err := database.DB.Query("SELECT id, uploaded_at, source, filename, file_size, transaction_count FROM uploads_history WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT 100", userID)
	if err != nil { /* ... tratar erro ... */
	}
	defer rowsUploads.Close()
	for rowsUploads.Next() {
		var entry UploadHistoryEntry
		var filename sql.NullString
		var filesize sql.NullInt64
		if err := rowsUploads.Scan(&entry.ID, &entry.UploadedAt, &entry.Source, &filename, &filesize, &entry.TransactionCount); err == nil {
			entry.Filename = filename.String
			entry.FileSize = filesize.Int64
			response.UploadHistory = append(response.UploadHistory, entry)
		}
	}

	// 3. Obter todas as transações
	rowsTxs, err := database.DB.Query("SELECT id, date, source, product_name, isin, quantity, price, transaction_type, buy_sell, amount_eur FROM processed_transactions WHERE user_id = ? ORDER BY date DESC", userID)
	if err != nil { /* ... tratar erro ... */
	}
	defer rowsTxs.Close()
	// (Adapte esta parte para usar a sua função `fetchUserProcessedTransactions` se preferir)
	for rowsTxs.Next() {
		var tx models.ProcessedTransaction
		// Scan para um subconjunto de campos para o resumo. Adicione mais se necessário.
		if err := rowsTxs.Scan(&tx.ID, &tx.Date, &tx.Source, &tx.ProductName, &tx.ISIN, &tx.Quantity, &tx.Price, &tx.TransactionType, &tx.BuySell, &tx.AmountEUR); err == nil {
			response.Transactions = append(response.Transactions, tx)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Estrutura para o pedido de ação em lote
type BatchRequest struct {
	UserIDs []int64 `json:"user_ids"`
}

// HandleAdminRefreshMultipleUserMetrics gere o pedido para atualizar métricas em lote.
func (h *UserHandler) HandleAdminRefreshMultipleUserMetrics(w http.ResponseWriter, r *http.Request) {
	var req BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONError(w, "Corpo do pedido inválido", http.StatusBadRequest)
		return
	}

	if len(req.UserIDs) == 0 {
		sendJSONError(w, "Nenhum ID de utilizador fornecido", http.StatusBadRequest)
		return
	}

	var errors []string
	for _, userID := range req.UserIDs {
		logger.L.Info("Admin acionou atualização de métricas de portfólio em lote para o utilizador", "targetUserID", userID)
		err := h.uploadService.UpdateUserPortfolioMetrics(userID)
		if err != nil {
			errMsg := fmt.Sprintf("Falha ao atualizar métricas para o utilizador %d: %v", userID, err)
			logger.L.Error(errMsg)
			errors = append(errors, errMsg)
		}
	}

	if len(errors) > 0 {
		sendJSONError(w, fmt.Sprintf("Concluído com %d erros. Verifique os logs para mais detalhes.", len(errors)), http.StatusInternalServerError)
		return
	}

	logger.L.Info("Atualização em lote para utilizadores concluída com sucesso", "count", len(req.UserIDs))
	w.WriteHeader(http.StatusNoContent)
}

// --- FIM DOS NOVOS HANDLERS ---
