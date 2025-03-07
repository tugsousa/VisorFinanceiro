package main

import (
	"TAXFOLIO/handlers"
	"log"
	"net/http"
)

func main() {
	// Initialize the upload handler
	uploadHandler := handlers.NewUploadHandler()

	// Set up routes
	http.HandleFunc("/upload", uploadHandler.HandleUpload)

	// Start the server
	log.Println("Server running at http://localhost:8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
