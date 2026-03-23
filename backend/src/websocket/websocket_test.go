package websocket

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/username/taxfolio/backend/src/logger"
)

func TestWebSocketManager(t *testing.T) {
	// Initialize logger first
	logger.InitLogger("info")

	// Initialize the hub
	InitializeHub()

	// Create a test HTTP server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		WebSocketHandler(w, r)
	}))
	defer server.Close()

	// Upgrade to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/ws", nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	// Test broadcasting a message
	// Send message to hub
	hub.broadcast <- []byte(`{"type": "test", "timestamp": "2023-01-01T00:00:00Z", "data": {"message": "Hello WebSocket"}}`)

	// Read message from client
	var receivedMessage map[string]interface{}
	err = conn.ReadJSON(&receivedMessage)
	if err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	// Verify message
	if receivedMessage["type"] != "test" {
		t.Errorf("Expected type 'test', got %v", receivedMessage["type"])
	}

	if data, ok := receivedMessage["data"].(map[string]interface{}); ok {
		if data["message"] != "Hello WebSocket" {
			t.Errorf("Expected message 'Hello WebSocket', got %v", data["message"])
		}
	}

	// Test upload progress broadcast
	BroadcastUploadProgress(1, 1, 50, 100, "processing", "Test message")

	// Read progress message
	var progressMessage map[string]interface{}
	err = conn.ReadJSON(&progressMessage)
	if err != nil {
		t.Fatalf("Failed to read progress message: %v", err)
	}

	if progressMessage["type"] != "upload_progress" {
		t.Errorf("Expected type 'upload_progress', got %v", progressMessage["type"])
	}

	// Clean up
	time.Sleep(100 * time.Millisecond) // Give time for cleanup
}

func TestBroadcastUploadProgress(t *testing.T) {
	// Initialize logger first
	logger.InitLogger("info")

	// Initialize the hub
	InitializeHub()

	// Create a test client
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		WebSocketHandler(w, r)
	}))
	defer server.Close()

	// Connect client
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/ws", nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Broadcast progress
	BroadcastUploadProgress(1, 1, 75, 100, "completed", "Upload finished")

	// Read message
	var message map[string]interface{}
	err = conn.ReadJSON(&message)
	if err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	if message["type"] != "upload_progress" {
		t.Errorf("Expected 'upload_progress', got %v", message["type"])
	}

	data := message["data"].(map[string]interface{})
	if data["progress"] != 75.0 {
		t.Errorf("Expected progress 75, got %v", data["progress"])
	}
	if data["status"] != "completed" {
		t.Errorf("Expected status 'completed', got %v", data["status"])
	}
}
