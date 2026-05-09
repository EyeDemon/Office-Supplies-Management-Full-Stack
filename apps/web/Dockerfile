# ── Stage 1: Build React app ──────────────────────────────────────
# [FIX] Build context là root repo (docker-compose context: .)
# Cần thiết vì vite.config.js alias @contracts → ../../packages/contracts
FROM node:20-alpine AS builder

WORKDIR /app

# Copy packages/contracts trước (shared dependency)
COPY packages/contracts ./packages/contracts

# Copy web app
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci

# Copy source & build
COPY apps/web/ .
RUN npm run build

# ── Stage 2: Serve với Nginx ──────────────────────────────────────
FROM nginx:1.27-alpine

# Xóa default config
RUN rm -rf /usr/share/nginx/html/*

# Copy build output từ stage 1
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]