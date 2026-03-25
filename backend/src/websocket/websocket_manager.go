// backend/src/websocket/websocket_manager.go
package websocket

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/username/taxfolio/backend/src/logger"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow connections from any origin for development
	},
}

// WebSocketMessage represents a message sent over WebSocket
type WebSocketMessage struct {
	Type      string      `json:"type"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// UploadProgress represents upload progress information
type UploadProgress struct {
	Current     int     `json:"current"`
	Total       int     `json:"total"`
	Progress    float64 `json:"progress"`
	Status      string  `json:"status"`
	Message     string  `json:"message"`
	UserID      int64   `json:"user_id"`
	PortfolioID int64   `json:"portfolio_id"`
}

// DashboardUpdate represents dashboard update information
type DashboardUpdate struct {
	Type        string      `json:"type"`
	UserID      int64       `json:"user_id"`
	PortfolioID int64       `json:"portfolio_id"`
	Data        interface{} `json:"data"`
}

// Client represents a WebSocket client
type Client struct {
	ID          string
	Conn        *websocket.Conn
	Send        chan []byte
	UserID      int64
	PortfolioID int64
}

// Hub manages WebSocket clients and message broadcasting
type Hub struct {
	clients    map[string]*Client
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// Global hub instance
var hub *Hub

// InitializeHub initializes the WebSocket hub
func InitializeHub() {
	hub = &Hub{
		clients:    make(map[string]*Client),
		broadcast:  make(chan []byte, 100),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
	go hub.run()
}

// run manages the hub's main loop
func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			logger.L.Info("Client registered", "client_id", client.ID, "user_id", client.UserID, "portfolio_id", client.PortfolioID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				close(client.Send)
				delete(h.clients, client.ID)
			}
			h.mu.Unlock()
			logger.L.Info("Client unregistered", "client_id", client.ID)

		case message := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client.ID)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// WebSocketHandler handles WebSocket connections
func WebSocketHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.L.Error("WebSocket upgrade failed", "error", err)
		return
	}

	// Extract user and portfolio info from context or query params
	userID := int64(0)
	portfolioID := int64(0)

	// For now, we'll use a simple client ID
	clientID := fmt.Sprintf("client_%d", time.Now().UnixNano())

	client := &Client{
		ID:          clientID,
		Conn:        conn,
		Send:        make(chan []byte, 256),
		UserID:      userID,
		PortfolioID: portfolioID,
	}

	hub.register <- client

	// Start write pump in a separate goroutine
	go client.writePump()

	// Handle incoming messages
	client.readPump()
}

// readPump handles incoming WebSocket messages
func (c *Client) readPump() {
	defer func() {
		hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.L.Error("WebSocket read error", "client_id", c.ID, "error", err)
			}
			break
		}

		// Handle incoming messages (if needed)
		var msg WebSocketMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			logger.L.Error("Failed to unmarshal WebSocket message", "error", err)
			continue
		}

		logger.L.Debug("Received WebSocket message", "client_id", c.ID, "type", msg.Type)
	}
}

// writePump handles outgoing WebSocket messages
func (c *Client) writePump() {
	ticker := time.NewTicker(5 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// Channel closed
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}

			w.Write(message)

			// Send any buffered messages
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte("\n"))
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			// Send ping to keep connection alive
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// BroadcastUploadProgress broadcasts upload progress to relevant clients
func BroadcastUploadProgress(userID, portfolioID int64, current, total int, status, message string) {
	// Check if hub is initialized
	if hub == nil {
		logger.L.Warn("WebSocket hub not initialized, skipping broadcast")
		return
	}

	progress := 0.0
	if total > 0 {
		progress = float64(current) / float64(total) * 100
	}

	uploadProgress := UploadProgress{
		Current:     current,
		Total:       total,
		Progress:    progress,
		Status:      status,
		Message:     message,
		UserID:      userID,
		PortfolioID: portfolioID,
	}

	uploadMessage := WebSocketMessage{
		Type:      "upload_progress",
		Timestamp: time.Now(),
		Data:      uploadProgress,
	}

	jsonMessage, err := json.Marshal(uploadMessage)
	if err != nil {
		logger.L.Error("Failed to marshal upload progress message", "error", err)
		return
	}

	hub.broadcast <- jsonMessage
	logger.L.Debug("Broadcasted upload progress", "user_id", userID, "portfolio_id", portfolioID, "progress", progress)
}

// BroadcastDashboardUpdate broadcasts dashboard updates to relevant clients
func BroadcastDashboardUpdate(userID, portfolioID int64, updateType string, data interface{}) {
	dashboardUpdate := DashboardUpdate{
		Type:        updateType,
		UserID:      userID,
		PortfolioID: portfolioID,
		Data:        data,
	}

	dashboardMessage := WebSocketMessage{
		Type:      "dashboard_update",
		Timestamp: time.Now(),
		Data:      dashboardUpdate,
	}

	jsonMessage, err := json.Marshal(dashboardMessage)
	if err != nil {
		logger.L.Error("Failed to marshal dashboard update message", "error", err)
		return
	}

	hub.broadcast <- jsonMessage
	logger.L.Debug("Broadcasted dashboard update", "user_id", userID, "portfolio_id", portfolioID, "type", updateType)
}

// GetHub returns the global hub instance
func GetHub() *Hub {
	return hub
}
