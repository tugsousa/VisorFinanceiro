# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build argument for the API URL
ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

# Run the build (now uses Vite)
RUN npm run build

# ---

# Stage 2: Serve the app using Nginx
FROM nginx:stable-alpine

# Copy build output (Vite config set outDir to 'build', so this path remains valid)
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom Nginx config (Ensure you have this file)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]