package model

import (
	"database/sql"
	"log"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func (u *User) HashPassword(password string) error {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	if err != nil {
		return err
	}
	u.Password = string(bytes)
	return nil
}

func (u *User) CheckPassword(providedPassword string) error {
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(providedPassword))
	if err != nil {
		log.Println("password did not match:", err)
		return err
	}
	return nil
}

func (u *User) CreateUser(db *sql.DB) (int64, error) {
	statement := `
	INSERT INTO users (username, password)
	VALUES (?, ?)
	`
	result, err := db.Exec(statement, u.Username, u.Password)
	if err != nil {
		return 0, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	return id, nil
}

func GetUserByUsername(db *sql.DB, username string) (*User, error) {
	statement := `
	SELECT id, username, password
	FROM users
	WHERE username = ?
	`
	row := db.QueryRow(statement, username)

	var user User
	err := row.Scan(&user.ID, &user.Username, &user.Password)
	if err != nil {
		return nil, err
	}
	return &user, nil
}
