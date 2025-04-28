# Use Node.js base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy project files
COPY . .

# Install dependencies
RUN npm ci

# Build the NestJS app
RUN npm run build

EXPOSE 3000

# Run the bot
CMD ["node", "dist/main.js"]