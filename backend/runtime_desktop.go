//go:build desktop

// The desktop build (see build-desktop.bat) is a single executable for using the app on this PC. It
// embeds the frontend, serves it next to the API, only accepts connections from this PC, and signs
// the browser in to a local account, so there's nothing to install, configure or log in to.
package main

import (
	"bufio"
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	stdlog "log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/security"
)

//go:embed all:desktop_web
var embeddedWeb embed.FS

//go:embed db/migrations
var embeddedMigrations embed.FS

//go:embed data/*.json
var embeddedData embed.FS

const (
	desktopPort = "38471"
	// 127.0.0.1 rather than localhost: cookies aren't separated by port, so on localhost they would
	// collide with those of a development server running on the same PC.
	desktopURL  = "http://127.0.0.1:" + desktopPort
	healthPath  = "/__visorfinanceiro"
	healthReply = "VisorFinanceiro"

	localUserEmail = "local@visorfinanceiro.local"
	localUserName  = "Local"
)

var (
	desktopListener net.Listener
	desktopConsole  = os.Stdout
	desktopLogPath  string
	mcpMode         bool
)

// prepareRuntime runs before anything else, so that the configuration, the logs and any relative path
// all use the data folder, and never a .env file that happens to be near the executable.
func prepareRuntime() {
	listener, err := net.Listen("tcp", "127.0.0.1:"+desktopPort)
	if err != nil {
		if isAlreadyRunning() {
			openBrowser(desktopURL)
			os.Exit(0)
		}
		desktopFail(fmt.Errorf("port %s is being used by another program: %w", desktopPort, err))
	}
	desktopListener = listener

	dataDir := enterDataDir()

	// The app only logs to these, so the window stays readable. Failures to start are in this file.
	desktopLogPath = filepath.Join(dataDir, "visorfinanceiro.log")
	logFile, err := os.Create(desktopLogPath)
	if err != nil {
		desktopFail(err)
	}
	os.Stdout = logFile
	os.Stderr = logFile
	stdlog.SetOutput(logFile)

	configureDesktop(dataDir)
}

// prepareMCPRuntime is prepareRuntime for the MCP mode, which Claude Desktop starts in the background:
// it uses the same data, but doesn't open the port, and leaves standard output to the MCP protocol.
func prepareMCPRuntime() {
	mcpMode = true
	// Claude Desktop keeps what's written to standard error in its own log of this server.
	os.Stdout = os.Stderr
	configureDesktop(enterDataDir())
}

// mcpUserID returns the account whose data the MCP mode shows: the local account of this PC.
func mcpUserID(auth *security.AuthService) (int64, error) {
	return ensureLocalUser(auth)
}

// enterDataDir creates the data folder if needed and makes it the working directory.
func enterDataDir() string {
	dataDir, err := desktopDataDir()
	if err != nil {
		desktopFail(err)
	}
	if err := os.Chdir(dataDir); err != nil {
		desktopFail(err)
	}
	return dataDir
}

// configureDesktop sets the configuration that the desktop build uses instead of a .env file.
func configureDesktop(dataDir string) {
	dataFiles, err := extractDataFiles(dataDir)
	if err != nil {
		desktopFail(err)
	}

	migrations, err := fs.Sub(embeddedMigrations, "db/migrations")
	if err != nil {
		desktopFail(err)
	}
	database.MigrationsFS = migrations

	// These secrets only protect the local session, which is created again on each start, so they
	// don't have to be kept on disk.
	settings := map[string]string{
		"GO_ENV":                         "desktop",
		"PORT":                           desktopPort,
		"LOG_LEVEL":                      "warn",
		"APP_BASE_URL":                   desktopURL,
		"REACT_APP_API_BASE_URL":         desktopURL,
		"DATABASE_PATH":                  filepath.Join(dataDir, "visorfinanceiro.db"),
		"COUNTRY_DATA_PATH":              dataFiles["country.json"],
		"DIVIDEND_SOURCE_OVERRIDES_PATH": dataFiles["dividend_source_overrides.json"],
		"AFORRO_RATES_PATH":              dataFiles["aforro_rates.json"],
		"JWT_SECRET":                     randomHex(),
		"CSRF_AUTH_KEY":                  randomHex(),
		// An app left open must not end up signed out: there's no sign-in page to go back to.
		"ACCESS_TOKEN_EXPIRY":  "8760h",
		"REFRESH_TOKEN_EXPIRY": "8760h",
		"ADMIN_EMAILS":         "",
		"SMTP_SERVER":          "",
		"SMTP_USER":            "",
		"SMTP_PASSWORD":        "",
		"GOOGLE_CLIENT_ID":     "",
		"GOOGLE_CLIENT_SECRET": "",
	}
	for key, value := range settings {
		if err := os.Setenv(key, value); err != nil {
			desktopFail(err)
		}
	}
}

// runServer replaces the normal server: it serves the frontend and the API from the listener opened
// in prepareRuntime, then opens the browser.
func runServer(server *http.Server, authService *security.AuthService) error {
	session := &localSession{auth: authService}
	if _, err := session.current(); err != nil {
		desktopFail(err)
	}

	web, err := fs.Sub(embeddedWeb, "desktop_web")
	if err != nil {
		desktopFail(err)
	}
	indexHTML, err := fs.ReadFile(web, "index.html")
	if err != nil {
		desktopFail(err)
	}

	server.Handler = onlyThisPC(desktopHandler(server.Handler, web, string(indexHTML), session))

	fmt.Fprintf(desktopConsole, "VisorFinanceiro is running at %s\n\n", desktopURL)
	fmt.Fprintf(desktopConsole, "Close this window to stop it.\n")
	fmt.Fprintf(desktopConsole, "Your data and the log are in %s\n", filepath.Dir(desktopLogPath))
	openBrowser(desktopURL)

	return server.Serve(desktopListener)
}

// onlyThisPC rejects requests addressed to any other name. Listening on 127.0.0.1 already stops other
// computers, but a website could still reach this server by pointing its own domain at 127.0.0.1.
// Its requests would then count as same-origin, and could read the session from the page.
func onlyThisPC(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != "127.0.0.1:"+desktopPort && r.Host != "localhost:"+desktopPort {
			http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func desktopHandler(api http.Handler, web fs.FS, indexHTML string, session *localSession) http.Handler {
	files := http.FileServerFS(web)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")

		switch {
		case r.URL.Path == healthPath:
			io.WriteString(w, healthReply)
		case strings.HasPrefix(r.URL.Path, "/api/"):
			api.ServeHTTP(w, r)
		case path != "" && path != "index.html" && fileExists(web, path):
			files.ServeHTTP(w, r)
		default:
			// Every other address is a page of the frontend, which handles its own routes.
			serveSignedInPage(w, indexHTML, session)
		}
	})
}

// serveSignedInPage serves the frontend with the session it would otherwise get from the sign-in
// page, already stored. This runs on each page load, so reloading always brings back a working
// session, even after using "log out" in the app.
func serveSignedInPage(w http.ResponseWriter, indexHTML string, session *localSession) {
	credentials, err := session.current()
	if err != nil {
		stdlog.Printf("Failed to prepare the local session: %v", err)
		http.Error(w, "Failed to prepare the local session, see visorfinanceiro.log", http.StatusInternalServerError)
		return
	}

	script, err := signInScript(credentials)
	if err != nil {
		stdlog.Printf("Failed to prepare the sign-in script: %v", err)
		http.Error(w, "Failed to prepare the local session, see visorfinanceiro.log", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    credentials.refreshToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(config.Cfg.RefreshTokenExpiry.Seconds()),
	})
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	io.WriteString(w, strings.Replace(indexHTML, "<head>", "<head>"+script, 1))
}

func signInScript(credentials localCredentials) (string, error) {
	user, err := json.Marshal(map[string]interface{}{
		"id":            credentials.userID,
		"username":      localUserName,
		"email":         localUserEmail,
		"auth_provider": "local",
		"is_admin":      false,
		"mfa_enabled":   false,
	})
	if err != nil {
		return "", err
	}
	// The values are stored as strings. json.Marshal also escapes "<", so they can't end the script.
	token, err := json.Marshal(credentials.token)
	if err != nil {
		return "", err
	}
	userText, err := json.Marshal(string(user))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(`<script>localStorage.setItem("auth_token",%s);localStorage.setItem("user",%s);</script>`, token, userText), nil
}

type localCredentials struct {
	userID       int64
	token        string
	refreshToken string
}

// localSession keeps the one session of this PC's account.
type localSession struct {
	auth        *security.AuthService
	mu          sync.Mutex
	credentials localCredentials
}

// current returns a working session, creating the account and the session if they don't exist (yet,
// or anymore, since both can be removed from within the app).
func (s *localSession) current() (localCredentials, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID, err := ensureLocalUser(s.auth)
	if err != nil {
		return localCredentials{}, err
	}

	if s.credentials.token != "" && s.credentials.userID == userID {
		if _, err := models.GetSessionByToken(database.DB, s.credentials.token); err == nil {
			return s.credentials, nil
		}
	}

	if err := models.DeleteUserSessions(database.DB, userID, ""); err != nil {
		return localCredentials{}, err
	}
	token, err := s.auth.GenerateToken(fmt.Sprintf("%d", userID))
	if err != nil {
		return localCredentials{}, err
	}
	refreshToken, err := s.auth.GenerateRefreshToken()
	if err != nil {
		return localCredentials{}, err
	}
	err = models.CreateSession(database.DB, &models.Session{
		UserID:       userID,
		Token:        token,
		RefreshToken: refreshToken,
		UserAgent:    "desktop",
		ClientIP:     "127.0.0.1",
		ExpiresAt:    time.Now().Add(config.Cfg.RefreshTokenExpiry),
	})
	if err != nil {
		return localCredentials{}, err
	}

	s.credentials = localCredentials{userID: userID, token: token, refreshToken: refreshToken}
	return s.credentials, nil
}

func ensureLocalUser(auth *security.AuthService) (int64, error) {
	user, err := models.GetUserByEmail(database.DB, localUserEmail)
	if err == nil {
		return user.ID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}

	// Nobody signs in with this password, it just can't be left empty.
	password, err := auth.HashPassword(randomHex())
	if err != nil {
		return 0, err
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	now := time.Now()
	result, err := tx.Exec(`
		INSERT INTO users (username, email, password, auth_provider, is_email_verified, created_at, updated_at)
		VALUES (?, ?, ?, 'local', TRUE, ?, ?)`,
		localUserName, localUserEmail, password, now, now,
	)
	if err != nil {
		return 0, err
	}
	userID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	_, err = tx.Exec(
		"INSERT INTO portfolios (user_id, name, description, is_default) VALUES (?, ?, ?, ?)",
		userID, "Portfolio Principal", "Default Portfolio", true,
	)
	if err != nil {
		return 0, err
	}
	return userID, tx.Commit()
}

func fileExists(fsys fs.FS, path string) bool {
	info, err := fs.Stat(fsys, path)
	return err == nil && !info.IsDir()
}

func isAlreadyRunning() bool {
	client := http.Client{Timeout: 2 * time.Second}
	response, err := client.Get(desktopURL + healthPath)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 64))
	return err == nil && string(body) == healthReply
}

func desktopDataDir() (string, error) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		var err error
		if base, err = os.UserConfigDir(); err != nil {
			return "", err
		}
	}
	dir := filepath.Join(base, "VisorFinanceiro")
	return dir, os.MkdirAll(dir, 0o700)
}

// extractDataFiles writes the embedded data files to disk, where the app reads them from. They're
// replaced on each start, so that a new version of the executable brings its own.
func extractDataFiles(dataDir string) (map[string]string, error) {
	entries, err := embeddedData.ReadDir("data")
	if err != nil {
		return nil, err
	}
	targetDir := filepath.Join(dataDir, "data")
	if err := os.MkdirAll(targetDir, 0o700); err != nil {
		return nil, err
	}
	paths := make(map[string]string, len(entries))
	for _, entry := range entries {
		content, err := embeddedData.ReadFile("data/" + entry.Name())
		if err != nil {
			return nil, err
		}
		target := filepath.Join(targetDir, entry.Name())
		if err := os.WriteFile(target, content, 0o600); err != nil {
			return nil, err
		}
		paths[entry.Name()] = target
	}
	return paths, nil
}

func randomHex() string {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		desktopFail(err)
	}
	return hex.EncodeToString(bytes)
}

func openBrowser(url string) {
	if os.Getenv("VISORFINANCEIRO_NO_BROWSER") != "" {
		return
	}
	if err := exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start(); err != nil {
		fmt.Fprintf(desktopConsole, "Couldn't open the browser, please go to %s\n", url)
	}
}

// desktopFail shows why the app can't start, and waits, because the window closes when the app exits.
// In the MCP mode there's no window, and standard input belongs to the protocol, so it just exits.
func desktopFail(err error) {
	if mcpMode {
		fmt.Fprintf(os.Stderr, "VisorFinanceiro could not start: %v\n", err)
		os.Exit(1)
	}
	fmt.Fprintf(desktopConsole, "VisorFinanceiro could not start: %v\n\nPress Enter to close this window.\n", err)
	bufio.NewReader(os.Stdin).ReadString('\n')
	os.Exit(1)
}
