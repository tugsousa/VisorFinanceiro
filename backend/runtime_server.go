//go:build !desktop

package main

import (
	"net/http"

	"github.com/username/taxfolio/backend/src/security"
)

// The normal server has nothing to prepare: it's configured by its environment. The desktop build
// replaces these two functions, see runtime_desktop.go.
func prepareRuntime() {}

func runServer(server *http.Server, _ *security.AuthService) error {
	return server.ListenAndServe()
}
