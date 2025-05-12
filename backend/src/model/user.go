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
	Email     string    `json:"email"`      // Assuming you might want this later
	Password  string    `json:"-"`          // "-" means do not include in JSON output
	CreatedAt time.Time `json:"created_at"` // Timestamps for user creation/update
	UpdatedAt time.Time `json:"updated_at"`
}

type Session struct {
	ID           int       `json:"id"`
	UserID       int       `json:"user_id"`
	Token        string    `json:"token"`         // Access Token
	RefreshToken string    `json:"refresh_token"` // Refresh Token
	UserAgent    string    `json:"user_agent"`
	ClientIP     string    `json:"client_ip"`
	IsBlocked    bool      `json:"is_blocked"`
	ExpiresAt    time.Time `json:"expires_at"` // Expiry of the refresh token or session
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
	query := `
	INSERT INTO users (username, password) 
	VALUES (?, ?)`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	res, err := stmt.Exec(u.Username, u.Password)
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
	SELECT id, username, password 
	FROM users 
	WHERE username = ?`
	row := db.QueryRow(query, username)
	var user User
	err := row.Scan(&user.ID, &user.Username, &user.Password)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &user, nil
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
		if err == sql.ErrNoRows {
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
		if err == sql.ErrNoRows {
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
		// Not necessarily an error, could have been deleted by another process or already expired and cleaned up.
		// Log if needed: log.Printf("No session found to delete for refresh token: %s", refreshToken)
	}
	return nil
}
