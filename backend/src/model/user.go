package model

import (
	"database/sql"
	"errors"
	"log"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID                              int64     `json:"id"`
	Username                        string    `json:"username"`
	Email                           string    `json:"email"`
	Password                        string    `json:"-"`
	AuthProvider                    string    `json:"auth_provider,omitempty"`
	UploadCount                     int       `json:"upload_count"`
	TotalUploadCount                int       `json:"total_upload_count"`
	LoginCount                      int       `json:"login_count"`
	LastLoginAt                     NullTime  `json:"last_login_at"`
	LastLoginIP                     string    `json:"last_login_ip"`
	PortfolioValueEUR               float64   `json:"portfolio_value_eur"`
	Top5Holdings                    string    `json:"top_5_holdings"`
	CreatedAt                       time.Time `json:"created_at"`
	UpdatedAt                       time.Time `json:"updated_at"`
	IsEmailVerified                 bool      `json:"is_email_verified"`
	EmailVerificationToken          string    `json:"-"`
	EmailVerificationTokenExpiresAt time.Time `json:"-"`
	PasswordResetToken              string    `json:"-"`
	PasswordResetTokenExpiresAt     time.Time `json:"-"`
	IsAdmin                         bool      `json:"is_admin"`
	MfaSecret                       string    `json:"-"`
	MfaEnabled                      bool      `json:"mfa_enabled"`
}

// NullTime is an alias for sql.NullTime for better JSON handling if needed.
type NullTime sql.NullTime

func (nt NullTime) MarshalJSON() ([]byte, error) {
	if !nt.Valid {
		return []byte("null"), nil
	}
	return nt.Time.MarshalJSON()
}

// ... (rest of the file remains the same)
func (u *User) HashPassword(password string) error {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.Password = string(hashedPassword)
	return nil
}

func (u *User) CheckPassword(password string) error {
	return bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
}

func (u *User) CreateUser(db *sql.DB) error {
	now := time.Now()
	u.CreatedAt = now
	u.UpdatedAt = now
	if u.AuthProvider == "" {
		u.AuthProvider = "local"
	}

	query := `
	INSERT INTO users (username, email, password, auth_provider, is_email_verified, email_verification_token, email_verification_token_expires_at, password_reset_token, password_reset_token_expires_at, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	var emailTokenExpiresArg interface{}
	if u.EmailVerificationTokenExpiresAt.IsZero() {
		emailTokenExpiresArg = nil
	} else {
		emailTokenExpiresArg = u.EmailVerificationTokenExpiresAt
	}

	res, err := stmt.Exec(
		u.Username,
		u.Email,
		u.Password,
		u.AuthProvider,
		u.IsEmailVerified,
		u.EmailVerificationToken,
		emailTokenExpiresArg,
		u.CreatedAt,
		u.UpdatedAt,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	u.ID = id
	return nil
}

func GetUserByID(db *sql.DB, id int64) (*User, error) {
	query := `
	SELECT id, username, email, password, auth_provider, upload_count, total_upload_count,
	       login_count, last_login_at, last_login_ip, portfolio_value_eur, top_5_holdings,
	       is_email_verified, email_verification_token, email_verification_token_expires_at,
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at, mfa_secret, mfa_enabled
	FROM users
	WHERE id = ?`
	row := db.QueryRow(query, id)
	var user User
	var authProvider, lastLoginIP, topHoldings, emailVerificationToken, passwordResetToken, mfaSecret sql.NullString
	var lastLoginAt, emailVerificationTokenExpiresAt, passwordResetTokenExpiresAt sql.NullTime

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password, &authProvider,
		&user.UploadCount, &user.TotalUploadCount, &user.LoginCount, &lastLoginAt,
		&lastLoginIP, &user.PortfolioValueEUR, &topHoldings, &user.IsEmailVerified,
		&emailVerificationToken, &emailVerificationTokenExpiresAt,
		&passwordResetToken, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
		&mfaSecret, &user.MfaEnabled,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, err
	}

	user.AuthProvider = authProvider.String
	user.LastLoginAt = NullTime(lastLoginAt)
	user.LastLoginIP = lastLoginIP.String
	user.Top5Holdings = topHoldings.String
	user.EmailVerificationToken = emailVerificationToken.String
	user.EmailVerificationTokenExpiresAt = emailVerificationTokenExpiresAt.Time
	user.PasswordResetToken = passwordResetToken.String
	user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt.Time
	user.MfaSecret = mfaSecret.String

	return &user, nil
}

type Session struct {
	ID           int       `json:"id"`
	UserID       int64     `json:"user_id"`
	Token        string    `json:"token"`
	RefreshToken string    `json:"refresh_token"`
	UserAgent    string    `json:"user_agent"`
	ClientIP     string    `json:"client_ip"`
	IsBlocked    bool      `json:"is_blocked"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
}

func GetUserByUsername(db *sql.DB, username string) (*User, error) {
	query := `
	SELECT id, username, email, password, auth_provider, upload_count, is_email_verified, 
	       email_verification_token, email_verification_token_expires_at,
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at, mfa_secret, mfa_enabled
	FROM users 
	WHERE username = ?`

	row := db.QueryRow(query, username)

	var user User
	var authProvider sql.NullString
	var emailVerificationToken sql.NullString
	var emailVerificationTokenExpiresAt sql.NullTime
	var passwordResetToken sql.NullString
	var passwordResetTokenExpiresAt sql.NullTime
	var mfaSecret sql.NullString // <--- Novo

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&authProvider,
		&user.UploadCount,
		&user.IsEmailVerified,
		&emailVerificationToken, &emailVerificationTokenExpiresAt,
		&passwordResetToken, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
		&mfaSecret, &user.MfaEnabled, // <--- Novo
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, err
	}

	// Mapeamento dos NullStrings
	if authProvider.Valid {
		user.AuthProvider = authProvider.String
	}
	if emailVerificationToken.Valid {
		user.EmailVerificationToken = emailVerificationToken.String
	}
	if emailVerificationTokenExpiresAt.Valid {
		user.EmailVerificationTokenExpiresAt = emailVerificationTokenExpiresAt.Time
	}
	if passwordResetToken.Valid {
		user.PasswordResetToken = passwordResetToken.String
	}
	if passwordResetTokenExpiresAt.Valid {
		user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt.Time
	}

	user.MfaSecret = mfaSecret.String // <--- Novo

	return &user, nil
}

func GetUserByEmail(db *sql.DB, email string) (*User, error) {
	// 1. Adicionei mfa_secret e mfa_enabled à query SELECT
	query := `
	SELECT id, username, email, password, auth_provider, upload_count, is_email_verified, 
	       email_verification_token, email_verification_token_expires_at,
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at, mfa_secret, mfa_enabled
	FROM users
	WHERE email = ?`

	row := db.QueryRow(query, email)

	var user User
	var authProvider sql.NullString
	var emailVerificationToken sql.NullString
	var emailVerificationTokenExpiresAt sql.NullTime
	var passwordResetToken sql.NullString
	var passwordResetTokenExpiresAt sql.NullTime
	var mfaSecret sql.NullString

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&authProvider,
		&user.UploadCount,
		&user.IsEmailVerified,
		&emailVerificationToken, &emailVerificationTokenExpiresAt,
		&passwordResetToken, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
		&mfaSecret, &user.MfaEnabled,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, err
	}

	if authProvider.Valid {
		user.AuthProvider = authProvider.String
	}
	if emailVerificationToken.Valid {
		user.EmailVerificationToken = emailVerificationToken.String
	}
	if emailVerificationTokenExpiresAt.Valid {
		user.EmailVerificationTokenExpiresAt = emailVerificationTokenExpiresAt.Time
	}
	if passwordResetToken.Valid {
		user.PasswordResetToken = passwordResetToken.String
	}
	if passwordResetTokenExpiresAt.Valid {
		user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt.Time
	}

	// 3. Atribuir o valor lido ao objeto User
	user.MfaSecret = mfaSecret.String

	return &user, nil
}

func GetUserByVerificationToken(db *sql.DB, token string) (*User, error) {
	query := `
	SELECT id, username, email, password, auth_provider, is_email_verified, 
	       email_verification_token, email_verification_token_expires_at, 
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at, mfa_secret, mfa_enabled
	FROM users
	WHERE email_verification_token = ?`

	row := db.QueryRow(query, token)

	var user User
	var authProvider sql.NullString
	var emailVerificationTokenFromDB sql.NullString
	var emailVerificationTokenExpiresAt sql.NullTime
	var passwordResetToken sql.NullString
	var passwordResetTokenExpiresAt sql.NullTime
	var mfaSecret sql.NullString // <--- Novo

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&authProvider,
		&user.IsEmailVerified,
		&emailVerificationTokenFromDB, &emailVerificationTokenExpiresAt,
		&passwordResetToken, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
		&mfaSecret, &user.MfaEnabled, // <--- Novo
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("invalid or expired verification token")
		}
		return nil, err
	}

	if authProvider.Valid {
		user.AuthProvider = authProvider.String
	}
	user.EmailVerificationToken = token
	if emailVerificationTokenExpiresAt.Valid {
		user.EmailVerificationTokenExpiresAt = emailVerificationTokenExpiresAt.Time
	}
	if passwordResetToken.Valid {
		user.PasswordResetToken = passwordResetToken.String
	}
	if passwordResetTokenExpiresAt.Valid {
		user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt.Time
	}

	user.MfaSecret = mfaSecret.String // <--- Novo

	return &user, nil
}

func (u *User) UpdateUserVerificationStatus(db *sql.DB, isVerified bool) error {
	u.IsEmailVerified = isVerified
	u.EmailVerificationToken = ""
	u.EmailVerificationTokenExpiresAt = time.Time{}
	u.UpdatedAt = time.Now()

	query := `
	UPDATE users
	SET is_email_verified = ?, email_verification_token = NULL, email_verification_token_expires_at = NULL, updated_at = ?
	WHERE id = ?`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(u.IsEmailVerified, u.UpdatedAt, u.ID)
	return err
}

func (u *User) SetPasswordResetToken(db *sql.DB, token string, expiresAt time.Time) error {
	u.PasswordResetToken = token
	u.PasswordResetTokenExpiresAt = expiresAt
	u.UpdatedAt = time.Now()

	var query string
	var args []interface{}

	if token == "" {
		query = `
		UPDATE users
		SET password_reset_token = NULL, password_reset_token_expires_at = NULL, updated_at = ?
		WHERE id = ?`
		args = []interface{}{u.UpdatedAt, u.ID}
	} else {
		query = `
		UPDATE users
		SET password_reset_token = ?, password_reset_token_expires_at = ?, updated_at = ?
		WHERE id = ?`
		args = []interface{}{u.PasswordResetToken, u.PasswordResetTokenExpiresAt, u.UpdatedAt, u.ID}
	}

	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(args...)
	return err
}

func (u *User) UpdateUserVerificationToken(db *sql.DB, token string, expiresAt time.Time) error {
	u.EmailVerificationToken = token
	u.EmailVerificationTokenExpiresAt = expiresAt
	u.UpdatedAt = time.Now()

	query := `
	UPDATE users
	SET email_verification_token = ?, email_verification_token_expires_at = ?, updated_at = ?
	WHERE id = ?`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(u.EmailVerificationToken, u.EmailVerificationTokenExpiresAt, u.UpdatedAt, u.ID)
	return err
}

func GetUserByPasswordResetToken(db *sql.DB, token string) (*User, error) {
	query := `
	SELECT id, username, email, password, auth_provider, is_email_verified, 
	       email_verification_token, email_verification_token_expires_at,
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at, mfa_secret, mfa_enabled
	FROM users
	WHERE password_reset_token = ? AND password_reset_token_expires_at > ?`

	row := db.QueryRow(query, token, time.Now())

	var user User
	var authProvider sql.NullString
	var emailVerificationToken sql.NullString
	var emailVerificationTokenExpiresAt sql.NullTime
	var passwordResetTokenFromDB sql.NullString
	var passwordResetTokenExpiresAt sql.NullTime
	var mfaSecret sql.NullString // <--- Novo

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&authProvider,
		&user.IsEmailVerified,
		&emailVerificationToken, &emailVerificationTokenExpiresAt,
		&passwordResetTokenFromDB, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
		&mfaSecret, &user.MfaEnabled, // <--- Novo
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("invalid or expired password reset token")
		}
		return nil, err
	}

	if authProvider.Valid {
		user.AuthProvider = authProvider.String
	}
	if emailVerificationToken.Valid {
		user.EmailVerificationToken = emailVerificationToken.String
	}
	if emailVerificationTokenExpiresAt.Valid {
		user.EmailVerificationTokenExpiresAt = emailVerificationTokenExpiresAt.Time
	}
	user.PasswordResetToken = token
	if passwordResetTokenExpiresAt.Valid {
		user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt.Time
	}

	user.MfaSecret = mfaSecret.String // <--- Novo

	return &user, nil
}

func (u *User) UpdatePassword(db *sql.DB, newPasswordHash string) error {
	u.Password = newPasswordHash
	u.PasswordResetToken = ""
	u.PasswordResetTokenExpiresAt = time.Time{}
	u.UpdatedAt = time.Now()

	query := `
	UPDATE users
	SET password = ?, password_reset_token = NULL, password_reset_token_expires_at = NULL, updated_at = ?
	WHERE id = ?`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(u.Password, u.UpdatedAt, u.ID)
	if err == nil {
		log.Printf("DEBUG: Password updated and reset token cleared for user ID %d.\n", u.ID)
	}
	return err
}

func CreateSession(db *sql.DB, session *Session) error {
	query := `
	INSERT INTO sessions (user_id, token, refresh_token, user_agent, client_ip, is_blocked, expires_at, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	session.CreatedAt = time.Now()
	_, err = stmt.Exec(
		session.UserID,
		session.Token,
		session.RefreshToken,
		session.UserAgent,
		session.ClientIP,
		session.IsBlocked,
		session.ExpiresAt,
		session.CreatedAt,
	)
	return err
}

func GetSessionByToken(db *sql.DB, token string) (*Session, error) {
	query := `
	SELECT id, user_id, token, refresh_token, user_agent, client_ip, is_blocked, expires_at, created_at
	FROM sessions
	WHERE token = ? AND is_blocked = FALSE AND expires_at > ?`

	row := db.QueryRow(query, token, time.Now())
	var session Session
	err := row.Scan(
		&session.ID,
		&session.UserID,
		&session.Token,
		&session.RefreshToken,
		&session.UserAgent,
		&session.ClientIP,
		&session.IsBlocked,
		&session.ExpiresAt,
		&session.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("session not found, expired, or blocked")
		}
		return nil, err
	}
	return &session, nil
}

func GetSessionByRefreshToken(db *sql.DB, refreshToken string) (*Session, error) {
	query := `
    SELECT id, user_id, token, refresh_token, user_agent, client_ip, is_blocked, expires_at, created_at
    FROM sessions
    WHERE refresh_token = ? AND is_blocked = FALSE AND expires_at > ?`

	row := db.QueryRow(query, refreshToken, time.Now())
	var session Session
	err := row.Scan(
		&session.ID,
		&session.UserID,
		&session.Token,
		&session.RefreshToken,
		&session.UserAgent,
		&session.ClientIP,
		&session.IsBlocked,
		&session.ExpiresAt,
		&session.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("refresh session not found, expired, or blocked")
		}
		return nil, err
	}
	return &session, nil
}

func DeleteSessionByToken(db *sql.DB, token string) error {
	query := `DELETE FROM sessions WHERE token = ?`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()
	_, err = stmt.Exec(token)
	return err
}

func DeleteSessionByRefreshToken(db *sql.DB, refreshToken string) error {
	query := `DELETE FROM sessions WHERE refresh_token = ?`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()
	result, err := stmt.Exec(refreshToken)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Error getting rows affected after deleting refresh token: %v (Rows: %d)", err, rowsAffected)
	}
	if rowsAffected == 0 {
		// Not necessarily an error
	}
	return nil
}

// UpdateMfaSecret guarda o segredo TOTP temporariamente (ou permanentemente)
func (u *User) UpdateMfaSecret(db *sql.DB, secret string) error {
	u.MfaSecret = secret
	u.UpdatedAt = time.Now()

	query := `
	UPDATE users
	SET mfa_secret = ?, updated_at = ?
	WHERE id = ?`

	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(u.MfaSecret, u.UpdatedAt, u.ID)
	return err
}

// UpdateMfaEnabled ativa ou desativa o MFA
func (u *User) UpdateMfaEnabled(db *sql.DB, enabled bool) error {
	u.MfaEnabled = enabled
	u.UpdatedAt = time.Now()

	query := `
	UPDATE users
	SET mfa_enabled = ?, updated_at = ?
	WHERE id = ?`

	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(u.MfaEnabled, u.UpdatedAt, u.ID)
	return err
}
