# Stage 1: Build the app
FROM node:22-alpine AS builder

WORKDIR /app

# Only copy package files first (better cache)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the app
RUN npm run build

# Stage 2: Create a lightweight final image
FROM node:22-alpine

WORKDIR /app

# Only copy the built dist folder and node_modules if needed
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# If you need some runtime dependencies (like if your app uses some runtime-only npm libs):
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

# Run the bot
CMD ["node", "dist/main.js"]
