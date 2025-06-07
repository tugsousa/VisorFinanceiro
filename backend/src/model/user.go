package model

import (
	"database/sql"
	"errors"
	"time"

	// Import logger if you want to use it directly in the model for this specific log
	// "github.com/username/taxfolio/backend/src/logger" // Example
	"log" // Or use standard log for simplicity if logger is not passed around

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        int       `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Password  string    `json:"-"` // Internal use
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	IsEmailVerified                 bool      `json:"is_email_verified"`
	EmailVerificationToken          string    `json:"-"` // Internal use
	EmailVerificationTokenExpiresAt time.Time `json:"-"` // Internal use

	PasswordResetToken          string    `json:"-"` // Internal use
	PasswordResetTokenExpiresAt time.Time `json:"-"` // Internal use
}

type Session struct {
	ID           int       `json:"id"`
	UserID       int       `json:"user_id"`
	Token        string    `json:"token"`
	RefreshToken string    `json:"refresh_token"`
	UserAgent    string    `json:"user_agent"`
	ClientIP     string    `json:"client_ip"`
	IsBlocked    bool      `json:"is_blocked"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
}

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

	query := `
	INSERT INTO users (username, email, password, is_email_verified, email_verification_token, email_verification_token_expires_at, password_reset_token, password_reset_token_expires_at, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	// For EmailVerificationTokenExpiresAt, if it's a zero time, it should be inserted as NULL or a default SQL timestamp.
	// SQLite handles zero time.Time values fine for TIMESTAMP columns by default (stores as '0001-01-01 00:00:00+00:00').
	// If you specifically need NULL, you'd use sql.NullTime for the u.EmailVerificationTokenExpiresAt field in the struct
	// and pass it directly, or conditional logic here. For now, zero time is acceptable for SQLite.
	var emailTokenExpiresArg interface{}
	if u.EmailVerificationTokenExpiresAt.IsZero() {
		emailTokenExpiresArg = nil // This will insert NULL if the column allows it
	} else {
		emailTokenExpiresArg = u.EmailVerificationTokenExpiresAt
	}

	res, err := stmt.Exec(
		u.Username,
		u.Email,
		u.Password,
		u.IsEmailVerified,
		u.EmailVerificationToken,
		emailTokenExpiresArg, // Use the argument that can be nil
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
	u.ID = int(id)
	return nil
}

func GetUserByUsername(db *sql.DB, username string) (*User, error) {
	query := `
	SELECT id, username, email, password, is_email_verified, 
	       email_verification_token, email_verification_token_expires_at,
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at
	FROM users 
	WHERE username = ?`
	row := db.QueryRow(query, username)
	var user User
	var emailVerificationToken sql.NullString
	var emailVerificationTokenExpiresAt sql.NullTime
	var passwordResetToken sql.NullString
	var passwordResetTokenExpiresAt sql.NullTime

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.IsEmailVerified,
		&emailVerificationToken, &emailVerificationTokenExpiresAt,
		&passwordResetToken, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, err
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
	return &user, nil
}

func GetUserByEmail(db *sql.DB, email string) (*User, error) {
	query := `
	SELECT id, username, email, password, is_email_verified, 
	       email_verification_token, email_verification_token_expires_at,
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at
	FROM users
	WHERE email = ?`
	row := db.QueryRow(query, email)
	var user User
	var emailVerificationToken sql.NullString
	var emailVerificationTokenExpiresAt sql.NullTime
	var passwordResetToken sql.NullString
	var passwordResetTokenExpiresAt sql.NullTime

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.IsEmailVerified,
		&emailVerificationToken, &emailVerificationTokenExpiresAt,
		&passwordResetToken, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("user with this email not found")
		}
		return nil, err
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
	return &user, nil
}

func GetUserByVerificationToken(db *sql.DB, token string) (*User, error) {
	query := `
	SELECT id, username, email, password, is_email_verified, 
	       email_verification_token, email_verification_token_expires_at, 
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at
	FROM users
	WHERE email_verification_token = ?`
	row := db.QueryRow(query, token)
	var user User
	var emailVerificationTokenFromDB sql.NullString
	var emailVerificationTokenExpiresAt sql.NullTime
	var passwordResetToken sql.NullString
	var passwordResetTokenExpiresAt sql.NullTime

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.IsEmailVerified,
		&emailVerificationTokenFromDB, &emailVerificationTokenExpiresAt,
		&passwordResetToken, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("invalid or expired verification token")
		}
		return nil, err
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

func GetUserByPasswordResetToken(db *sql.DB, token string) (*User, error) {
	query := `
	SELECT id, username, email, password, is_email_verified, 
	       email_verification_token, email_verification_token_expires_at,
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at
	FROM users
	WHERE password_reset_token = ? AND password_reset_token_expires_at > ?`
	row := db.QueryRow(query, token, time.Now())
	var user User
	var emailVerificationToken sql.NullString
	var emailVerificationTokenExpiresAt sql.NullTime
	var passwordResetTokenFromDB sql.NullString
	var passwordResetTokenExpiresAt sql.NullTime

	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.IsEmailVerified,
		&emailVerificationToken, &emailVerificationTokenExpiresAt,
		&passwordResetTokenFromDB, &passwordResetTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("invalid or expired password reset token")
		}
		return nil, err
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
	return &user, nil
}

func (u *User) UpdatePassword(db *sql.DB, newPasswordHash string) error {
	u.Password = newPasswordHash
	// Store the token before clearing, if you need to log it
	// oldResetToken := u.PasswordResetToken // <--- This was the unused variable
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
		// Example of using it if you had a logger instance here or passed it:
		// logger.L.Debug("Password updated and reset token cleared for user", "userID", u.ID, "oldTokenUsed", oldResetToken)
		// Or using standard log for simplicity:
		log.Printf("DEBUG: Password updated and reset token cleared for user ID %d.\n", u.ID)
	}
	return err
}

// --- Session Methods ---
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
		return err
	}
	if rowsAffected == 0 {
		// Not necessarily an error
	}
	return nil
}
