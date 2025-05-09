# Taxfolio - Backend

This is the backend server for Taxfolio, a portfolio tracker and tax helper application. It handles data processing, storage, user authentication, and provides an API for the frontend.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [Environment Variables](#environment-variables)
  - [Database](#database)
  - [Dependencies](#dependencies)
- [Running the Backend](#running-the-backend)
- [API Endpoint Overview](#api-endpoint-overview)

## Prerequisites

- [Go](https://golang.org/dl/) version 1.23.0 or higher.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-url>/backend
    ```

2.  **Environment Variables:**
    Create a `.env` file in the `backend` directory or set the following environment variables directly in your shell:

    *   `JWT_SECRET` (Required): A secure secret key for signing JWTs. It must be at least 32 characters long for HS256 encryption.
        ```
        JWT_SECRET="your-very-secure-and-long-jwt-secret-key-for-hs256-minimum-32-bytes"
        ```
        **Note:** For production, use a strong, randomly generated secret. The default in `main.go` is for development convenience only and is insecure.
    *   `PORT` (Optional): The port on which the server will listen. Defaults to `8080`.
        ```
        PORT=8080
        ```

3.  **Database:**
    The application uses SQLite. The database file (`taxfolio.db`) will be automatically created in the `backend` directory when the server starts for the first time, if it doesn't already exist. The schema is also initialized automatically.

4.  **Dependencies:**
    Fetch the Go module dependencies:
    ```bash
    go mod tidy
    # or
    go mod download
    ```

## Running the Backend

1.  **Ensure Environment Variables are Set:** Make sure `JWT_SECRET` is configured.
2.  **Start the server:**
    From the `backend` directory, run:
    ```bash
    go run main.go
    ```
    The server will start, typically on `http://localhost:8080` (or the port specified by `PORT`).

## API Endpoint Overview

All API endpoints are prefixed with `/api`.

### Authentication (`/api/auth/`)

*   `GET /csrf`: Provides a CSRF token.
*   `POST /login`: Authenticates a user and returns JWT access and refresh tokens.
*   `POST /register`: Registers a new user.
*   `POST /logout`: Invalidates the user's current session.
*   `POST /refresh`: Refreshes an expired access token using a valid refresh token.

### Data Management (Authenticated & CSRF Protected)

*   `POST /upload`: Uploads a CSV file for transaction processing.
*   `GET /dashboard-data`: Retrieves consolidated data for the user's dashboard.
*   `GET /transactions/processed`: Retrieves all processed transactions for the authenticated user.
*   `GET /holdings/stocks`: Retrieves current stock holdings.
*   `GET /holdings/options`: Retrieves current option holdings.
*   `GET /stock-sales`: Retrieves details of all stock sales.
*   `GET /option-sales`: Retrieves details of all option sales.
*   `GET /dividend-tax-summary`: Retrieves a summary of dividends and taxes paid.
*   `GET /dividend-transactions`: Retrieves individual dividend and dividend tax transactions.

---