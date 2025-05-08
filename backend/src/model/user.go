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
	// Assuming your users table has username and password. Add email, created_at, updated_at if they exist.
	// For now, using a simplified query.
	query := `
	INSERT INTO users (username, password) 
	VALUES (?, ?)`
	// If you add created_at, updated_at to the table:
	// query := `INSERT INTO users (username, password, created_at, updated_at) VALUES (?, ?, ?, ?)`
	// u.CreatedAt = time.Now()
	// u.UpdatedAt = time.Now()
	// _, err := db.Exec(query, u.Username, u.Password, u.CreatedAt, u.UpdatedAt)

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
		// Not all drivers support LastInsertId, or it might not be relevant if ID is not auto-incrementing.
		// If your ID is not auto-incrementing, you'd handle it differently.
		// For sqlite, it should work.
		return err
	}
	u.ID = int(id) // Set the ID of the user object
	return nil
}

// GetUserByUsername retrieves a user from the database by their username.
func GetUserByUsername(db *sql.DB, username string) (*User, error) {
	query := `
	SELECT id, username, password 
	FROM users 
	WHERE username = ?`
	// If you have email, created_at, updated_at in DB:
	// query := `SELECT id, username, password, email, created_at, updated_at FROM users WHERE username = ?`

	row := db.QueryRow(query, username)
	var user User
	// Adjust Scan based on the fields selected
	err := row.Scan(&user.ID, &user.Username, &user.Password)
	// err := row.Scan(&user.ID, &user.Username, &user.Password, &user.Email, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	// If email, created_at, updated_at are not in DB or not selected, set defaults if necessary
	if user.Email == "" {
		user.Email = ""
	} // Or some default
	if user.CreatedAt.IsZero() {
		user.CreatedAt = time.Now()
	} // Or handle if it should always come from DB
	if user.UpdatedAt.IsZero() {
		user.UpdatedAt = time.Now()
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

	session.CreatedAt = time.Now() // Ensure CreatedAt is set
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
	WHERE token = ? AND is_blocked = FALSE AND expires_at > ?` // Check against current time for expiry

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

// DeleteSessionByToken removes a session from the database based on the access token.
func DeleteSessionByToken(db *sql.DB, token string) error {
	query := `DELETE FROM sessions WHERE token = ?`
	stmt, err := db.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	result, err := stmt.Exec(token)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		// This is not necessarily an error for logout. The session might have already expired
		// or been deleted. Log it but don't return an error that breaks the logout flow.
		// return errors.New("no session found to delete for the given token")
	}
	return nil
}
