# Stage 1: Build the React application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the React app for production
RUN npm run build

# ---

# Stage 2: Serve the app using Nginx
FROM nginx:stable-alpine

# Copy the built assets from the builder stage to Nginx's web root directory
COPY --from=builder /app/build /usr/share/nginx/html

# Copy the custom Nginx configuration file
# This file will define how to serve the React app and proxy API requests
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]