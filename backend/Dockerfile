# Stage 1: The build environment
# Use the official Golang image that matches your project's version. Alpine is smaller.
FROM golang:1.23-alpine AS builder

# Set the Current Working Directory inside the container
WORKDIR /app

# Copy go.mod and go.sum files to download dependencies
COPY go.mod go.sum ./

# Download all dependencies. Dependencies will be cached if the go.mod and go.sum files are not changed
RUN go mod download

# Copy the source code into the container
COPY . .

# Build the Go app. 
# CGO_ENABLED=0 is important for creating a statically linked binary that can run in a minimal image like Alpine.
# -o taxfolio-backend creates an executable with a specific name.
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o taxfolio-backend .

# ---

# Stage 2: The production environment
# Use a minimal, non-root base image for security and size.
FROM alpine:latest

# It's a good practice to run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy the static assets (country and exchange rate data) from the source context
COPY data ./data

# Copy the pre-built binary from the "builder" stage
COPY --from=builder /app/taxfolio-backend .

# The database will be stored in a volume, but if you want to initialize it
# in a specific directory inside the container, you can create it here.
# For example, if DATABASE_PATH will be /app/data/taxfolio.db
RUN mkdir -p /app/data

# --- Important Change: Change ownership of the app directory ---
# Change the ownership of the entire /app directory to the non-root user.
# This ensures the app can write to the /app/data sub-directory where the volume is mounted.
RUN chown -R appuser:appgroup /app

# Now, switch to the non-root user
USER appuser

# Expose port 8080 to the outside world
EXPOSE 8080

# Command to run the executable
CMD ["./taxfolio-backend"]