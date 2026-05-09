FROM node:20-alpine

# Install dumb-init for proper signal handling (PID 1 problem)
RUN apk add --no-cache dumb-init wget

WORKDIR /app

# Install dependencies (production only)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY . .

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8080

# dumb-init ensures SIGTERM propagates correctly → graceful shutdown
CMD ["dumb-init", "node", "server.js"]
