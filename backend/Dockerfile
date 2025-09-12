# Stage 1: The build environment
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o visorfinanceiro-backend .

# ---

# Stage 2: The production environment
FROM alpine:latest

ENV GO_ENV=PRO

# Install root certificates, which are necessary for making HTTPS requests.
# The --no-cache flag prevents the package index from being stored, keeping the image small.
RUN apk update && apk add --no-cache ca-certificates

# Create a non-root user and group for enhanced security.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set the working directory for the application.
WORKDIR /app

# Create all necessary directories upfront. This is more explicit and robust.
RUN mkdir -p /app/data && \
    mkdir -p /app/db/migrations

# Copy static assets from the local build context into their respective directories.
COPY data ./data
COPY db/migrations ./db/migrations

# Copy the pre-built binary from the "builder" stage.
COPY --from=builder /app/visorfinanceiro-backend .

# Change ownership of the entire app directory to the non-root user.
# This ensures read access to migrations and write access to the db volume mount point.
RUN chown -R appuser:appgroup /app

# Switch to the non-root user before running the application.
USER appuser

# Expose the application's port.
EXPOSE 8080

# The command to run when the container starts.
CMD ["./visorfinanceiro-backend"]