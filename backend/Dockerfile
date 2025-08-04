# Stage 1: The build environment
# Use the official Golang Alpine image for a small build environment.
FROM golang:1.23-alpine AS builder

# Install necessary build tools
RUN apk update && apk upgrade

# Set the Current Working Directory inside the container
WORKDIR /app

# Copy go.mod and go.sum files to download dependencies first.
# This leverages Docker's layer caching.
COPY go.mod go.sum ./
RUN go mod download

# Copy the entire source code into the container
COPY . .

# Build the Go application into a statically linked binary.
# CGO_ENABLED=0 is crucial for running in a minimal image like Alpine.
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o rumoclaro-backend .

# ---

# Stage 2: The production environment
# Use a minimal base image for security and a small footprint.
FROM alpine:latest

# Install root certificates for making HTTPS requests (e.g., to Google or ECB).
RUN apk update && apk add --no-cache ca-certificates

# Create a non-root user and group for security.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set the working directory for the application.
WORKDIR /app

# Copy the static assets (like country.json) from the source context.
# This data is part of the image itself and will be located at /app/data.
COPY data ./data

# *** ADD THIS LINE ***
# Copy the migrations from the builder stage so the app can find them on startup.
COPY --from=builder /app/db/migrations ./db/migrations

# Create the directory where the persistent database volume will be mounted.
# This separates persistent data from the static data above.
RUN mkdir -p /app/db

# Copy the pre-built binary from the "builder" stage.
COPY --from=builder /app/rumoclaro-backend .

# Change ownership of the directory the application needs to write to.
# The 'appuser' only needs to own the database directory, not the executable.
RUN chown -R appuser:appgroup /app/db

# Switch to the non-root user to run the application.
USER appuser

# Expose the application's port.
EXPOSE 8080

# The command to run when the container starts.
CMD ["./rumoclaro-backend"]