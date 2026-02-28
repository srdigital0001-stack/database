# Use Node.js LTS as base image
FROM node:20-slim

# Install python and build tools for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build the frontend
RUN npm run build

# Expose the port (Cloud Run uses 8080 by default, but our app uses 3000)
# We will set the PORT environment variable in Cloud Run
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
