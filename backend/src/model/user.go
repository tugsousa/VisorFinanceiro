package model

import (
	"database/sql"
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        int       `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"` // Added
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"created_at"` // Added
	UpdatedAt time.Time `json:"updated_at"` // Added

	// New fields for email verification
	IsEmailVerified                 bool      `json:"is_email_verified"` // Added
	EmailVerificationToken          string    `json:"-"`                 // Added
	EmailVerificationTokenExpiresAt time.Time `json:"-"`                 // Added
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

// HashPassword hashes the user's password using bcrypt.
func (u *User) HashPassword(password string) error {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.Password = string(hashedPassword)
	return nil
}

// CheckPassword compares a given password with the user's hashed password.
func (u *User) CheckPassword(password string) error {
	return bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
}

// CreateUser inserts a new user into the database.
func (u *User) CreateUser(db *sql.DB) error {
	now := time.Now()
	u.CreatedAt = now // Ensure CreatedAt is set
	u.UpdatedAt = now // Ensure UpdatedAt is set

	query := `
	INSERT INTO users (username, email, password, is_email_verified, email_verification_token, email_verification_token_expires_at, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	res, err := stmt.Exec(
		u.Username,
		u.Email,
		u.Password,
		u.IsEmailVerified,
		u.EmailVerificationToken,
		u.EmailVerificationTokenExpiresAt,
		u.CreatedAt, // Pass CreatedAt
		u.UpdatedAt, // Pass UpdatedAt
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

// GetUserByUsername retrieves a user from the database by their username.
func GetUserByUsername(db *sql.DB, username string) (*User, error) {
	query := `
	SELECT id, username, email, password, is_email_verified, created_at, updated_at
	FROM users 
	WHERE username = ?`
	row := db.QueryRow(query, username)
	var user User
	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.IsEmailVerified, &user.CreatedAt, &user.UpdatedAt, // Scan new fields
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) { // Use errors.Is for sql.ErrNoRows
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &user, nil
}

// GetUserByEmail retrieves a user by their email.
func GetUserByEmail(db *sql.DB, email string) (*User, error) {
	query := `
	SELECT id, username, email, password, is_email_verified, created_at, updated_at
	FROM users
	WHERE email = ?`
	row := db.QueryRow(query, email)
	var user User
	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.IsEmailVerified, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) { // Use errors.Is for sql.ErrNoRows
			return nil, errors.New("user with this email not found")
		}
		return nil, err
	}
	return &user, nil
}

// GetUserByVerificationToken retrieves a user by their email verification token.
func GetUserByVerificationToken(db *sql.DB, token string) (*User, error) {
	query := `
	SELECT id, username, email, password, is_email_verified, email_verification_token, email_verification_token_expires_at, created_at, updated_at
	FROM users
	WHERE email_verification_token = ?`
	row := db.QueryRow(query, token)
	var user User
	err := row.Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.IsEmailVerified, &user.EmailVerificationToken, &user.EmailVerificationTokenExpiresAt,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) { // Use errors.Is for sql.ErrNoRows
			return nil, errors.New("invalid or expired verification token")
		}
		return nil, err
	}
	return &user, nil
}

// UpdateUserVerificationStatus updates the user's email verification status and clears the token.
func (u *User) UpdateUserVerificationStatus(db *sql.DB, isVerified bool) error {
	u.IsEmailVerified = isVerified
	u.EmailVerificationToken = ""                   // Clear token in struct
	u.EmailVerificationTokenExpiresAt = time.Time{} // Zero out expiry in struct
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

// CreateSession inserts a new session into the database.
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

// GetSessionByToken retrieves an active, non-blocked session by its access token.
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

// GetSessionByRefreshToken retrieves an active, non-blocked session by its refresh token.
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

// DeleteSessionByToken removes a session from the database based on the access token.
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

// DeleteSessionByRefreshToken removes a session from the database based on the refresh token.
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
