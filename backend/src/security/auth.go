package security

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/username/taxfolio/backend/src/config" // Import config
	"golang.org/x/crypto/bcrypt"
)

const (
	bcryptCost = 12
	// TokenExpiry and RefreshTokenExpiry constants are now removed from here
	// and will be read from config.Cfg
)

type AuthService struct {
	JWTSecret string
}

func NewAuthService(secret string) *AuthService {
	return &AuthService{
		JWTSecret: secret,
	}
}

func (a *AuthService) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func (a *AuthService) CompareHashAndPassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

func (a *AuthService) GenerateToken(userID string) (string, error) {
	if config.Cfg == nil {
		// This should ideally not happen if LoadConfig is called at startup
		// But as a safeguard:
		return "", errors.New("configuration not loaded, cannot determine token expiry")
	}
	claims := jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(config.Cfg.AccessTokenExpiry).Unix(), // Use configured expiry
		"iat": time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(a.JWTSecret))
}

func (a *AuthService) GenerateRefreshToken() (string, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func (a *AuthService) ValidateToken(tokenString string) (string, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(a.JWTSecret), nil
	})

	if err != nil {
		return "", err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		// Ensure 'sub' claim exists and is a string
		sub, ok := claims["sub"].(string)
		if !ok {
			return "", errors.New("invalid token: 'sub' claim missing or not a string")
		}
		return sub, nil
	}

	return "", errors.New("invalid token")
}
