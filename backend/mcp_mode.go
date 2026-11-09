package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/patrickmn/go-cache"
	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/mcpserver"
	"github.com/username/taxfolio/backend/src/security"
	"github.com/username/taxfolio/backend/src/services"
)

const mcpServerVersion = "1.0.0"

// runMCP runs the app as an MCP server ("VisorFinanceiro.exe mcp"), so that Claude Desktop can read
// the portfolio. Claude Desktop starts it and talks to it over standard input and output, so nothing
// else may write to standard output.
func runMCP() {
	protocolOut := os.Stdout
	prepareMCPRuntime()
	initCore()

	userID, err := mcpUserID(security.NewAuthService(config.Cfg.JWTSecret))
	if err != nil {
		fmt.Fprintf(os.Stderr, "VisorFinanceiro could not find the account to use: %v\n", err)
		os.Exit(1)
	}

	reportCache := cache.New(services.DefaultCacheExpiration, services.CacheCleanupInterval)
	uploads := newUploadService(services.NewPriceService(), reportCache)
	server := mcpserver.New(uploads, userID, mcpServerVersion)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	logger.L.Info("MCP server starting", "userID", userID)
	if err := server.Run(ctx, &mcp.IOTransport{Reader: os.Stdin, Writer: protocolOut}); err != nil && ctx.Err() == nil {
		fmt.Fprintf(os.Stderr, "VisorFinanceiro MCP server stopped: %v\n", err)
		os.Exit(1)
	}
}
