package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/security"
)

const testPassword = "Correct-horse-1"

// setupAuthTest uses the real migrations and a user with a password, or a Google user if provider says so.
func setupAuthTest(t *testing.T, provider string) (*UserHandler, *models.User) {
	t.Helper()
	logger.InitLogger("error")

	previousCfg := config.Cfg
	config.Cfg = &config.AppConfig{
		AccessTokenExpiry:  time.Hour,
		RefreshTokenExpiry: 24 * time.Hour,
		FrontendBaseURL:    "http://localhost:3000",
		MaxUploadSizeBytes: 1024,
	}
	t.Cleanup(func() { config.Cfg = previousCfg })

	workingDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}
	if err := os.Chdir(filepath.Join(workingDir, "..", "..")); err != nil {
		t.Fatalf("failed to change directory: %v", err)
	}
	t.Cleanup(func() { os.Chdir(workingDir) })

	previousDB := database.DB
	path := filepath.Join(t.TempDir(), "test.db")
	database.InitDB(path)
	database.RunMigrations(path)
	t.Cleanup(func() {
		database.DB.Close()
		database.DB = previousDB
	})

	auth := security.NewAuthService(strings.Repeat("k", 32))
	hash, err := auth.HashPassword(testPassword)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}
	if provider != "local" {
		hash = ""
	}
	_, err = database.DB.Exec(`INSERT INTO users (id, username, email, password, auth_provider, is_email_verified, created_at, updated_at)
		VALUES (1, 'user', 'user@example.com', ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, hash, provider)
	if err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}
	user, err := models.GetUserByID(database.DB, 1)
	if err != nil {
		t.Fatalf("failed to read user: %v", err)
	}
	return NewUserHandler(auth, nil, nil, nil), user
}

// newSession creates a session with distinct tokens, as logins in the same second would otherwise share a JWT.
func newSession(t *testing.T, handler *UserHandler, name string) (accessToken, refreshToken string) {
	t.Helper()
	accessToken, err := handler.authService.GenerateToken("1")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}
	session := &models.Session{
		UserID: 1, Token: accessToken + name, RefreshToken: "refresh-" + name,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := models.CreateSession(database.DB, session); err != nil {
		t.Fatalf("failed to create session: %v", err)
	}
	return session.Token, session.RefreshToken
}

func sessionExists(t *testing.T, token string) bool {
	t.Helper()
	_, err := models.GetSessionByToken(database.DB, token)
	return err == nil
}

func jsonRequest(t *testing.T, path string, body interface{}) *http.Request {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("invalid test data: %v", err)
	}
	return httptest.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
}

func TestChangePassword_EndsOtherSessionsOnly(t *testing.T) {
	handler, _ := setupAuthTest(t, "local")
	current, _ := newSession(t, handler, "current")
	other, _ := newSession(t, handler, "other")

	request := jsonRequest(t, "/api/user/change-password", ChangePasswordRequest{
		CurrentPassword: testPassword, NewPassword: "New-Password-2", ConfirmNewPassword: "New-Password-2",
	})
	request.Header.Set("Authorization", "Bearer "+current)
	request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, int64(1)))
	recorder := httptest.NewRecorder()
	handler.ChangePasswordHandler(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if !sessionExists(t, current) {
		t.Error("the session that changed the password should continue")
	}
	if sessionExists(t, other) {
		t.Error("other sessions should end")
	}
}

func TestChangePassword_RejectsWeakPassword(t *testing.T) {
	handler, _ := setupAuthTest(t, "local")

	request := jsonRequest(t, "/api/user/change-password", ChangePasswordRequest{
		CurrentPassword: testPassword, NewPassword: "abcdef", ConfirmNewPassword: "abcdef",
	})
	request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, int64(1)))
	recorder := httptest.NewRecorder()
	handler.ChangePasswordHandler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", recorder.Code)
	}
}

func TestResetPassword_EndsAllSessions(t *testing.T) {
	handler, user := setupAuthTest(t, "local")
	session, _ := newSession(t, handler, "stolen")
	if err := user.SetPasswordResetToken(database.DB, "reset-token", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("failed to set reset token: %v", err)
	}

	request := jsonRequest(t, "/api/auth/reset-password", map[string]string{
		"token": "reset-token", "password": "New-Password-2", "confirm_password": "New-Password-2",
	})
	recorder := httptest.NewRecorder()
	handler.ResetPasswordHandler(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if sessionExists(t, session) {
		t.Error("a password reset should end every session")
	}
}

func TestResetPassword_RejectsWeakPassword(t *testing.T) {
	handler, user := setupAuthTest(t, "local")
	if err := user.SetPasswordResetToken(database.DB, "reset-token", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("failed to set reset token: %v", err)
	}

	request := jsonRequest(t, "/api/auth/reset-password", map[string]string{
		"token": "reset-token", "password": "abcdef", "confirm_password": "abcdef",
	})
	recorder := httptest.NewRecorder()
	handler.ResetPasswordHandler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", recorder.Code)
	}
}

// A Google user's session used to survive logout, because a token without a session was accepted.
func TestAuthMiddleware_RejectsTokenWithoutSession(t *testing.T) {
	for _, provider := range []string{"local", "google"} {
		t.Run(provider, func(t *testing.T) {
			handler, _ := setupAuthTest(t, provider)
			token, err := handler.authService.GenerateToken("1")
			if err != nil {
				t.Fatalf("failed to generate token: %v", err)
			}

			reached := false
			protected := handler.AuthMiddleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true }))
			send := func() int {
				request := httptest.NewRequest(http.MethodGet, "/api/portfolios", nil)
				request.Header.Set("Authorization", "Bearer "+token)
				recorder := httptest.NewRecorder()
				protected.ServeHTTP(recorder, request)
				return recorder.Code
			}

			if code := send(); code != http.StatusUnauthorized || reached {
				t.Errorf("expected 401 without a session, got %d (reached: %v)", code, reached)
			}

			session := &models.Session{UserID: 1, Token: token, RefreshToken: "refresh", ExpiresAt: time.Now().Add(time.Hour)}
			if err := models.CreateSession(database.DB, session); err != nil {
				t.Fatalf("failed to create session: %v", err)
			}
			if send(); !reached {
				t.Error("expected a token with a session to be accepted")
			}
		})
	}
}

func refresh(handler *UserHandler, refreshToken string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
	request.AddCookie(&http.Cookie{Name: "refresh_token", Value: refreshToken})
	recorder := httptest.NewRecorder()
	handler.RefreshTokenHandler(recorder, request)
	return recorder
}

// Two tabs can refresh at once with the same cookie. The second one must not log the user out.
func TestRefresh_OldTokenWorksBrieflyForOtherTabs(t *testing.T) {
	handler, _ := setupAuthTest(t, "local")
	_, refreshToken := newSession(t, handler, "tabs")

	if recorder := refresh(handler, refreshToken); recorder.Code != http.StatusOK {
		t.Fatalf("first refresh: expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if recorder := refresh(handler, refreshToken); recorder.Code != http.StatusOK {
		t.Fatalf("second refresh: expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestRefresh_OldTokenStopsWorkingAfterTheWindow(t *testing.T) {
	handler, _ := setupAuthTest(t, "local")
	_, refreshToken := newSession(t, handler, "old")

	if recorder := refresh(handler, refreshToken); recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	old, err := models.GetSessionByRefreshToken(database.DB, refreshToken)
	if err != nil {
		t.Fatalf("expected the old session to last for the window: %v", err)
	}
	if remaining := time.Until(old.ExpiresAt); remaining > refreshReuseWindow {
		t.Errorf("expected the old session to end within the window, it has %v left", remaining)
	}

	// Reusing the old token inside the window must not extend it.
	if err := models.SetSessionExpiry(database.DB, old.ID, time.Now().Add(5*time.Second)); err != nil {
		t.Fatalf("failed to set expiry: %v", err)
	}
	if recorder := refresh(handler, refreshToken); recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 inside the window, got %d", recorder.Code)
	}
	old, err = models.GetSessionByRefreshToken(database.DB, refreshToken)
	if err != nil {
		t.Fatalf("failed to read old session: %v", err)
	}
	if remaining := time.Until(old.ExpiresAt); remaining > 5*time.Second {
		t.Errorf("reusing the old token extended it to %v", remaining)
	}

	if err := models.SetSessionExpiry(database.DB, old.ID, time.Now().Add(-time.Second)); err != nil {
		t.Fatalf("failed to set expiry: %v", err)
	}
	if recorder := refresh(handler, refreshToken); recorder.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 after the window, got %d", recorder.Code)
	}
}

func TestDeleteExpiredSessions_KeepsActiveOnes(t *testing.T) {
	handler, _ := setupAuthTest(t, "local")
	active, _ := newSession(t, handler, "active")
	expired := &models.Session{UserID: 1, Token: "expired", RefreshToken: "expired", ExpiresAt: time.Now().Add(-time.Hour)}
	if err := models.CreateSession(database.DB, expired); err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	if err := models.DeleteExpiredSessions(database.DB, 1); err != nil {
		t.Fatalf("DeleteExpiredSessions returned error: %v", err)
	}

	var count int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM sessions`).Scan(&count); err != nil {
		t.Fatalf("failed to count sessions: %v", err)
	}
	if count != 1 || !sessionExists(t, active) {
		t.Errorf("expected only the active session to remain, got %d sessions", count)
	}
}

func TestSecureCookies_FollowsTheSiteAddress(t *testing.T) {
	handler, _ := setupAuthTest(t, "local")
	_ = handler

	config.Cfg.Port = "8080" // Production also listens on this port, behind the proxy.
	config.Cfg.FrontendBaseURL = "https://visorfinanceiro.pt"
	recorder := httptest.NewRecorder()
	setRefreshTokenCookie(recorder, "token", time.Hour)
	if cookie := recorder.Result().Cookies()[0]; !cookie.Secure {
		t.Error("expected a secure cookie on an HTTPS site")
	}

	config.Cfg.FrontendBaseURL = "http://localhost:3000"
	recorder = httptest.NewRecorder()
	setRefreshTokenCookie(recorder, "token", time.Hour)
	if cookie := recorder.Result().Cookies()[0]; cookie.Secure {
		t.Error("a secure cookie wouldn't work on a local HTTP site")
	}
}

func TestGoogleLogin_GivesEachLoginItsOwnState(t *testing.T) {
	handler, _ := setupAuthTest(t, "local")
	InitializeGoogleOAuthConfig()

	login := func() (string, string) {
		recorder := httptest.NewRecorder()
		handler.HandleGoogleLogin(recorder, httptest.NewRequest(http.MethodGet, "/api/auth/google/login", nil))
		location, err := recorder.Result().Location()
		if err != nil {
			t.Fatalf("expected a redirect: %v", err)
		}
		return recorder.Result().Cookies()[0].Value, location.Query().Get("state")
	}

	cookie, state := login()
	if cookie == "" || cookie != state {
		t.Errorf("expected the cookie %q to match the state %q", cookie, state)
	}
	if another, _ := login(); another == cookie {
		t.Error("expected a different state for each login")
	}
}

func TestGoogleCallback_RejectsWrongState(t *testing.T) {
	tests := []struct {
		name   string
		cookie string
		state  string
	}{
		{"no cookie", "", "abc"},
		{"different state", "abc", "xyz"},
		{"both empty", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := setupAuthTest(t, "local")
			request := httptest.NewRequest(http.MethodGet, "/api/auth/google/callback?code=c&state="+tt.state, nil)
			if tt.cookie != "" {
				request.AddCookie(&http.Cookie{Name: oauthStateCookie, Value: tt.cookie})
			}
			recorder := httptest.NewRecorder()
			handler.HandleGoogleCallback(recorder, request)

			location, err := recorder.Result().Location()
			if err != nil {
				t.Fatalf("expected a redirect: %v", err)
			}
			if !strings.Contains(location.String(), "invalid_state") {
				t.Errorf("expected invalid_state, got %s", location)
			}
		})
	}
}

func TestValidOAuthState_AcceptsMatchingState(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/auth/google/callback?state=abc", nil)
	request.AddCookie(&http.Cookie{Name: oauthStateCookie, Value: "abc"})
	if !validOAuthState(request) {
		t.Error("expected the state to be valid")
	}
}

func TestSetupMFA_DoesNotReplaceActiveSecret(t *testing.T) {
	handler, user := setupAuthTest(t, "local")
	if err := user.UpdateMfaSecret(database.DB, "ORIGINAL"); err != nil {
		t.Fatalf("failed to set secret: %v", err)
	}
	if err := user.UpdateMfaEnabled(database.DB, true); err != nil {
		t.Fatalf("failed to enable MFA: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/admin/mfa/setup", nil)
	request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, int64(1)))
	recorder := httptest.NewRecorder()
	handler.HandleSetupMFA(recorder, request)

	if recorder.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", recorder.Code)
	}
	stored, err := models.GetUserByID(database.DB, 1)
	if err != nil {
		t.Fatalf("failed to read user: %v", err)
	}
	if stored.MfaSecret != "ORIGINAL" {
		t.Errorf("the secret was replaced with %q", stored.MfaSecret)
	}
}

func TestSetupMFA_WorksWhenNotActive(t *testing.T) {
	handler, _ := setupAuthTest(t, "local")

	request := httptest.NewRequest(http.MethodPost, "/api/admin/mfa/setup", nil)
	request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, int64(1)))
	recorder := httptest.NewRecorder()
	handler.HandleSetupMFA(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestUpload_RejectsFileOverTheLimit(t *testing.T) {
	setupAuthTest(t, "local")
	config.Cfg.MaxUploadSizeBytes = 1024
	if _, err := database.DB.Exec(`INSERT INTO portfolios (id, user_id, name) VALUES (1, 1, 'Portfolio')`); err != nil {
		t.Fatalf("failed to create portfolio: %v", err)
	}

	send := func(size int) *httptest.ResponseRecorder {
		var body bytes.Buffer
		form := multipart.NewWriter(&body)
		part, err := form.CreateFormFile("file", "report.csv")
		if err != nil {
			t.Fatalf("failed to create form: %v", err)
		}
		part.Write(bytes.Repeat([]byte("a"), size))
		form.WriteField("source", "degiro")
		form.WriteField("portfolio_id", "1")
		form.Close()

		request := httptest.NewRequest(http.MethodPost, "/api/upload", &body)
		request.Header.Set("Content-Type", form.FormDataContentType())
		request = request.WithContext(context.WithValue(request.Context(), userIDContextKey, int64(1)))
		recorder := httptest.NewRecorder()
		NewUploadHandler(nil).HandleUpload(recorder, request)
		return recorder
	}

	if recorder := send(2048); recorder.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("file just over the limit: unexpected status %d", recorder.Code)
	}
	if recorder := send(3 * 1024 * 1024); recorder.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("request over the limit: expected 413, got %d: %s", recorder.Code, recorder.Body.String())
	}
}
