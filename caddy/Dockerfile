FROM node:20.15.1-alpine3.19 AS builder
WORKDIR /app
ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .

# This will now run 'vite build' instead of 'react-scripts build'
RUN npm run build

FROM caddy:2.8.4-alpine
COPY caddy/Caddyfile /etc/caddy/Caddyfile
WORKDIR /usr/share/caddy
# Ensure this matches the output dir in vite.config.js (outDir: 'build')
COPY --from=builder /app/build .