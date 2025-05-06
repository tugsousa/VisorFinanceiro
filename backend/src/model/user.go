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
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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
	query := `
	INSERT INTO users (username, email, password, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?)
	`
	u.CreatedAt = time.Now()
	u.UpdatedAt = time.Now()

	_, err := db.Exec(query, u.Username, u.Email, u.Password, u.CreatedAt, u.UpdatedAt)
	return err
}

func GetUserByUsername(db *sql.DB, username string) (*User, error) {
	query := `
	SELECT id, username, email, password, created_at, updated_at
	FROM users
	WHERE username = ?
	`
	row := db.QueryRow(query, username)

	var user User
	err := row.Scan(&user.ID, &user.Username, &user.Email, &user.Password, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &user, nil
}

func GetUserByEmail(db *sql.DB, email string) (*User, error) {
	query := `
	SELECT id, username, email, password, created_at, updated_at
	FROM users
	WHERE email = ?
	`
	row := db.QueryRow(query, email)

	var user User
	err := row.Scan(&user.ID, &user.Username, &user.Email, &user.Password, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &user, nil
}

func CreateSession(db *sql.DB, session *Session) error {
	query := `
	INSERT INTO sessions (user_id, token, refresh_token, user_agent, client_ip, is_blocked, expires_at, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := db.Exec(
		query,
		session.UserID,
		session.Token,
		session.RefreshToken,
		session.UserAgent,
		session.ClientIP,
		session.IsBlocked,
		session.ExpiresAt,
		time.Now(),
	)
	return err
}

func GetSessionByToken(db *sql.DB, token string) (*Session, error) {
	query := `
	SELECT id, user_id, token, refresh_token, user_agent, client_ip, is_blocked, expires_at, created_at
	FROM sessions
	WHERE token = ?
	`
	row := db.QueryRow(query, token)

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
		return nil, err
	}
	return &session, nil
}
