# Stage 1: Build the React application (same as your frontend Dockerfile)
FROM node:20-alpine AS builder
WORKDIR /app
# 1. Declare the build argument
ARG REACT_APP_API_BASE_URL
# 2. Set it as an environment variable for the build script
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Serve the app using Caddy
FROM caddy:2-alpine

# Copy the Caddyfile configuration into the container
COPY caddy/Caddyfile /etc/caddy/Caddyfile

# Create a directory to serve files from
WORKDIR /usr/share/caddy

# Copy the built React app from the builder stage
COPY --from=builder /app/build .