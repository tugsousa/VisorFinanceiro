package model

import (
	"database/sql"
	"errors"
	"time"

	"log"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        int64     `json:"id"` // Changed to int64 to match GetUserIDFromContext
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	IsEmailVerified                 bool      `json:"is_email_verified"`
	EmailVerificationToken          string    `json:"-"`
	EmailVerificationTokenExpiresAt time.Time `json:"-"`

	PasswordResetToken          string    `json:"-"`
	PasswordResetTokenExpiresAt time.Time `json:"-"`
}

type Session struct {
	ID           int       `json:"id"`
	UserID       int64     `json:"user_id"` // Changed to int64
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
	u.ID = id // Assign LastInsertId (which is int64)
	return nil
}

func GetUserByID(db *sql.DB, id int64) (*User, error) {
	query := `
	SELECT id, username, email, password, is_email_verified,
	       email_verification_token, email_verification_token_expires_at,
	       password_reset_token, password_reset_token_expires_at,
	       created_at, updated_at
	FROM users
	WHERE id = ?`
	row := db.QueryRow(query, id)
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
		// Log error getting rows affected, but don't necessarily return it as critical
		log.Printf("Error getting rows affected after deleting refresh token: %v (Rows: %d)", err, rowsAffected)
	}
	if rowsAffected == 0 {
		// Not necessarily an error, token might have already been removed or never existed
	}
	return nil // Return nil if exec was successful
}
