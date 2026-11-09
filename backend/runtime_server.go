//go:build !desktop

package main

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"

	"github.com/username/taxfolio/backend/src/database"
	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/security"
)

// The normal server has nothing to prepare: it's configured by its environment. The desktop build
// replaces these functions, see runtime_desktop.go.
func prepareRuntime() {}

func runServer(server *http.Server, _ *security.AuthService) error {
	return server.ListenAndServe()
}

// prepareMCPRuntime leaves standard output to the MCP protocol, so the logs go to standard error.
func prepareMCPRuntime() {
	os.Stdout = os.Stderr
}

// mcpUserID returns the account whose data the MCP mode shows. This build has many accounts, so it's
// chosen with MCP_USER_EMAIL. It's meant for trying the MCP mode against a development database.
func mcpUserID(_ *security.AuthService) (int64, error) {
	email := os.Getenv("MCP_USER_EMAIL")
	if email == "" {
		return 0, errors.New("set MCP_USER_EMAIL to the email of the account to use")
	}
	user, err := models.GetUserByEmail(database.DB, email)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("there is no account with the email %s", email)
	}
	if err != nil {
		return 0, err
	}
	return user.ID, nil
}
