# 🚀 QLVPP — Hướng dẫn Setup & Deploy Fullstack

> **Phiên bản:** N25 (27/04/2026) | Stack: React 18 + Vite · Node.js 20/Express · MySQL 8 · Nginx · Docker

---

## Mục lục

1. [Tài khoản mặc định](#1-tài-khoản-mặc-định)
2. [Cách 1 — Docker Compose (Khuyến nghị)](#2-cách-1--docker-compose-khuyến-nghị)
3. [Cách 2 — Local Dev (không Docker)](#3-cách-2--local-dev-không-docker)
4. [Cách 3 — VPS / Cloud Server (Production)](#4-cách-3--vps--cloud-server-production)
5. [Biến môi trường (Environment Variables)](#5-biến-môi-trường)
6. [Cấu hình Email](#6-cấu-hình-email)
7. [Health Check & Monitoring](#7-health-check--monitoring)
8. [Troubleshooting](#8-troubleshooting)
9. [Lệnh nhanh](#9-lệnh-nhanh)

---

## 1. Tài khoản mặc định

Sau khi khởi động, `database/init.sql` tạo sẵn 4 tài khoản test:

| Username     | Password   | Role      | Quyền hạn                              |
|--------------|------------|-----------|----------------------------------------|
| `admin`      | `password` | ADMIN     | Toàn quyền + quản lý người dùng        |
| `manager1`   | `password` | MANAGER   | Duyệt phiếu, master data, báo cáo      |
| `warehouse1` | `password` | WAREHOUSE | Vận hành kho: nhập/xuất/kiểm kê        |
| `user1`      | `password` | USER      | Tạo & xem phiếu yêu cầu cấp phát      |

> ⚠️ **Production:** Đổi mật khẩu ngay sau lần đầu đăng nhập hoặc tạo account mới qua giao diện Admin.

---

## 2. Cách 1 — Docker Compose (Khuyến nghị)

**Yêu cầu:** Docker ≥ 24 + Docker Compose v2 | Port 80 và 3306 chưa bị chiếm

### Bước 1 — Chuẩn bị file `.env`

```bash
cd qlvpp_n25           # vào thư mục project
cp .env.example .env   # tạo file env từ template
```

Mở `.env` và điền các giá trị **bắt buộc**:

```env
# ── Mật khẩu MySQL (Docker tự tạo DB với credentials này) ──────
MYSQL_ROOT_PASSWORD=your_strong_root_password_here
MYSQL_PASSWORD=your_strong_app_password_here

# ── Session secret: TẠO BẰNG LỆNH BÊN DƯỚI, KHÔNG DÙNG GIÁ TRỊ MẪU ──
SESSION_SECRET=paste_generated_secret_here

# ── URL (đổi thành IP/domain thật nếu deploy lên server) ───────
CORS_ORIGIN=http://localhost
FRONTEND_URL=http://localhost
```

Sinh SESSION_SECRET an toàn:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# hoặc:
openssl rand -hex 48
```

### Bước 2 — Khởi động

```bash
docker compose up -d --build
```

> Lần đầu: tải images + build React mất **3–8 phút**. Các lần sau nhanh hơn nhiều.

### Bước 3 — Kiểm tra

```bash
# Xem trạng thái 3 container
docker compose ps

# Kết quả mong đợi:
# NAME               STATUS          PORTS
# qlvpp-db           healthy         3306/tcp
# qlvpp-backend      healthy         8080/tcp
# qlvpp-frontend     running         0.0.0.0:80->80/tcp

# Test API
curl http://localhost/api/health
# → {"status":"UP","database":"connected",...}
```

### Bước 4 — Truy cập

| Service      | URL                          |
|--------------|------------------------------|
| Ứng dụng web | http://localhost              |
| API health   | http://localhost/api/health  |

### Lệnh quản lý Docker

```bash
docker compose logs -f               # Xem logs realtime
docker compose logs -f backend       # Chỉ backend
docker compose restart backend       # Restart 1 service
docker compose down                  # Dừng, giữ data DB
docker compose down -v               # Dừng + XÓA TOÀN BỘ DATA (reset sạch)
docker compose up -d --build         # Rebuild sau khi sửa code
docker stats qlvpp-backend qlvpp-db  # Monitor resource usage
```

---

## 3. Cách 2 — Local Dev (không Docker)

**Yêu cầu:** Node.js ≥ 18 · npm ≥ 9 · MySQL 8

### Bước 1 — Chuẩn bị MySQL

```bash
# Đăng nhập MySQL với quyền root
mysql -u root -p

# Trong MySQL shell:
CREATE DATABASE IF NOT EXISTS qlvpp
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON qlvpp.* TO 'root'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Chạy schema + seed data (1 file duy nhất)
mysql -u root -p qlvpp < database/init.sql
```

> `init.sql` đã bao gồm toàn bộ schema + migrations + seed data.
> **Không cần** chạy thêm migration_p*.sql (dành cho Docker auto-run).

### Bước 2 — Backend

```bash
cd backend
cp ../.env.example .env

# Chỉnh .env cho local (DB_USER=root, DB_PASSWORD=<password của bạn>):
nano .env

# Cài dependencies
npm install

# Chạy dev (auto-reload khi sửa code)
npm run dev
# → 🚀 QLVPP Backend → http://localhost:8080
```

**Kiểm tra backend:**
```bash
curl http://localhost:8080/api/health
```

### Bước 3 — Frontend (terminal mới)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

> Vite tự proxy `/api/*` → `http://localhost:8080` (cấu hình trong `vite.config.js`).
> Không cần thay đổi gì thêm.

### Bước 4 — Truy cập

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8080/api/health

---

## 4. Cách 3 — VPS / Cloud Server (Production)

### 4.1 Cài Docker trên Ubuntu 22.04

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Đăng xuất và đăng nhập lại
docker --version && docker compose version   # kiểm tra
sudo systemctl enable docker                 # tự khởi động khi reboot
```

### 4.2 Upload code và cấu hình

```bash
# Upload (từ máy local)
scp -r ./qlvpp_n25 user@your-server-ip:/home/user/qlvpp

# SSH vào server
ssh user@your-server-ip
cd /home/user/qlvpp

# Cấu hình env production
cp .env.example .env
nano .env
```

**Env production bắt buộc:**
```env
MYSQL_ROOT_PASSWORD=<mật khẩu mạnh>
MYSQL_PASSWORD=<mật khẩu mạnh>
SESSION_SECRET=<96 ký tự hex ngẫu nhiên>
CORS_ORIGIN=http://your-server-ip      # hoặc https://your-domain.com
FRONTEND_URL=http://your-server-ip     # hoặc https://your-domain.com
NODE_ENV=production
```

```bash
# Khởi động
docker compose up -d --build

# Kiểm tra
curl http://your-server-ip/api/health
```

### 4.3 Thêm HTTPS với Nginx + Certbot (nếu có domain)

```bash
sudo apt install nginx certbot python3-certbot-nginx -y

# Tạo nginx config
sudo tee /etc/nginx/sites-available/qlvpp << 'NGINX'
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass         http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_pass_header  Set-Cookie;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/qlvpp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Cấp SSL certificate (miễn phí)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Sau khi có HTTPS, cập nhật `.env`:
```env
CORS_ORIGIN=https://your-domain.com
FRONTEND_URL=https://your-domain.com
```

```bash
docker compose up -d --build backend   # apply env mới
```

### 4.4 Các cloud platform phổ biến

**Railway (đơn giản nhất, có free tier):**
1. Push code lên GitHub
2. Railway.app → New Project → Deploy from GitHub repo
3. Add MySQL plugin → Railway tự cấp credentials
4. Set environment variables trong Railway Dashboard

**Render + PlanetScale:**
- Backend: Render → Web Service → Docker
- Database: PlanetScale (MySQL-compatible, free tier 5GB)
- Frontend: Render → Static Site hoặc Vercel

---

## 5. Biến Môi Trường

### Root `.env` (dùng cho Docker Compose)

| Biến | Mô tả | Bắt buộc | Default |
|------|-------|----------|---------|
| `MYSQL_ROOT_PASSWORD` | MySQL root password (Docker) | ✅ | — |
| `MYSQL_PASSWORD` | App user password (Docker) | ✅ | — |
| `SESSION_SECRET` | Session secret ≥ 32 ký tự | ✅ | — |
| `CORS_ORIGIN` | URL frontend (trình duyệt gọi backend từ đây) | ✅ | `http://localhost:5173` |
| `FRONTEND_URL` | Frontend base URL (cho reset password link) | ✅ | `http://localhost:5173` |
| `NODE_ENV` | `development` hoặc `production` | ❌ | `development` |
| `EMAIL_MODE` | `dev` (log) hoặc `smtp` (gửi thật) | ❌ | `dev` |
| `SMTP_HOST` | SMTP server | ❌ | — |
| `SMTP_PORT` | SMTP port | ❌ | `587` |
| `SMTP_USER` | SMTP username / email | ❌ | — |
| `SMTP_PASS` | SMTP app password | ❌ | — |
| `SMTP_FROM` | Sender display name + email | ❌ | — |

### `backend/.env` (dùng cho local dev)

| Biến | Mô tả | Default |
|------|-------|---------|
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_NAME` | Database name | `qlvpp` |
| `DB_USER` | MySQL user | `root` |
| `DB_PASSWORD` | MySQL password | `` |
| `PORT` | Backend port | `8080` |
| `NODE_ENV` | `development` / `production` | `development` |
| `SESSION_SECRET` | Session secret ≥ 32 ký tự | **phải set** |
| `CORS_ORIGIN` | Frontend origin | `http://localhost:5173` |
| `FRONTEND_URL` | Frontend base URL | `http://localhost:5173` |

---

## 6. Cấu hình Email

Mặc định `EMAIL_MODE=dev`: link reset password được ghi vào console (chỉ dev) — **không gửi email thật**.

**Để gửi email thật qua Gmail:**

1. Bật 2-Step Verification: https://myaccount.google.com/security

2. Tạo App Password: https://myaccount.google.com/apppasswords
   - App: "Mail" | Device: "Other" → đặt tên "QLVPP"
   - Copy 16 ký tự được tạo ra

3. Thêm vào `.env`:
```env
EMAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop     # 16 ký tự App Password (không phải password Gmail)
SMTP_FROM=QLVPP <your-email@gmail.com>
```

---

## 7. Health Check & Monitoring

### API Endpoints

```bash
# Backend: database status + uptime + memory
GET /api/health

# Response:
{
  "status": "UP",
  "database": "connected",
  "uptime": 3600,
  "memory": "45MB",
  "timestamp": "2026-04-27T09:00:00.000Z",
  "version": "1.0.0",
  "env": "production"
}

# Frontend Nginx:
GET /health   → "OK"
```

### Logs thực tế

```bash
# Xem logs realtime (bỏ qua health check spam)
docker compose logs -f backend | grep -v "GET /api/health"

# Chỉ error
docker compose logs backend 2>&1 | grep -E "ERROR|error|Error"

# DB slow query
docker compose exec db mysql -u root -p -e "SHOW PROCESSLIST;"
```

---

## 8. Troubleshooting

### ❌ Container `qlvpp-backend` not healthy

```bash
docker compose logs backend | tail -30
```

**Nguyên nhân phổ biến:**
- `SESSION_SECRET` quá ngắn (< 32 ký tự) → server `process.exit(1)` trong production
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  # Dán output vào SESSION_SECRET trong .env
  docker compose restart backend
  ```
- DB chưa healthy khi backend start → tự retry theo `depends_on: condition: service_healthy`
  ```bash
  docker compose restart backend  # đợi db healthy rồi restart
  ```

### ❌ CORS Error ở trình duyệt

Đảm bảo `CORS_ORIGIN` khớp chính xác URL bạn truy cập (bao gồm cả port nếu có):
```env
# Truy cập qua IP LAN
CORS_ORIGIN=http://192.168.1.100

# Truy cập qua domain có HTTPS
CORS_ORIGIN=https://your-domain.com
```
```bash
docker compose up -d --build backend
```

### ❌ Port 80 bị chiếm

```bash
sudo lsof -i :80   # xem process nào đang dùng

# Hoặc đổi port trong docker-compose.yml:
# ports:
#   - "8090:80"   ← đổi 80 sang 8090
```

### ❌ Frontend build lỗi

```bash
cd frontend
npm install
npm run build   # xem lỗi cụ thể
```

### ❌ Muốn reset database (XÓA TOÀN BỘ DATA)

```bash
docker compose down -v        # xóa volume qlvpp_db_data
docker compose up -d --build  # init.sql chạy lại tự động → fresh install
```

### ❌ Cần truy cập MySQL trực tiếp

```bash
# Docker
docker compose exec db mysql -u qlvpp_user -p qlvpp

# Local
mysql -u root -p qlvpp
```

### ❌ Code đã sửa, cần rebuild

```bash
# Rebuild 1 service (nhanh hơn)
docker compose up -d --build backend

# Rebuild tất cả
docker compose up -d --build
```

---

## 9. Lệnh Nhanh

```bash
# ── DOCKER COMPOSE ──────────────────────────────────────────
cp .env.example .env && nano .env     # 1. Cấu hình env
docker compose up -d --build          # 2. Build và start
docker compose ps                     # 3. Kiểm tra status
curl http://localhost/api/health      # 4. Test API

# ── LOCAL DEV (không Docker) ─────────────────────────────────
mysql -u root -p qlvpp < database/init.sql  # Khởi tạo DB
cd backend && cp ../.env.example .env && npm install && npm run dev
cd frontend && npm install && npm run dev

# ── QUẢN LÝ ─────────────────────────────────────────────────
docker compose logs -f                # Xem logs realtime
docker compose restart backend        # Restart backend
docker compose down                   # Dừng, giữ data
docker compose down -v                # Dừng + xóa data (reset)
```

---

## Cấu trúc thư mục

```
qlvpp_n25/
├── .env.example              ← Template env cho Docker Compose
├── .gitignore
├── docker-compose.yml        ← 3 services: db + backend + frontend(nginx)
├── launch.js                 ← Script khởi động local (không Docker)
│
├── backend/
│   ├── server.js             ← Express entry point
│   ├── Dockerfile            ← Node 20 Alpine
│   ├── .env.example          ← Template env cho local dev
│   └── src/
│       ├── config/db.js      ← MySQL pool (mysql2)
│       ├── middleware/
│       │   ├── auth.js       ← requireLogin, requireAdmin, parsePage
│       │   ├── rbac.js       ← attachUserWarehouses, buildWarehouseFilter
│       │   ├── csrf.js       ← CSRF Synchronizer Token Pattern
│       │   ├── idempotency.js ← Chống double-submit
│       │   └── rate-limiter.js ← Rate limit + account lockout
│       ├── routes/           ← 20 route modules (one per domain)
│       ├── services/
│       │   └── emailService.js ← Dev log / SMTP nodemailer
│       └── utils/
│           ├── auditLogger.js ← writeAuditLog()
│           └── stockHelper.js ← adjustWarehouseStock, Moving Average Cost
│
├── frontend/
│   ├── Dockerfile            ← Multi-stage: Node build → Nginx serve
│   ├── nginx.conf            ← SPA routing + /api proxy → backend:8080
│   ├── vite.config.js        ← Dev proxy + manual chunk splitting
│   └── src/
│       ├── App.jsx           ← Router + AppShell layout
│       ├── contexts/AuthContext.jsx
│       ├── services/api.js   ← Axios + CSRF + Idempotency interceptors
│       ├── hooks/            ← useAutoAlert, useFormValidation
│       ├── components/       ← Sidebar, TopBar, NotificationBell, Modal, ...
│       └── pages/            ← 25+ page components
│
├── database/
│   ├── init.sql              ← Schema đầy đủ + seed data (fresh install)
│   └── migration_p*.sql      ← Migrations cho Docker auto-run
│
└── docs/
    ├── DEPLOY.md             ← File này — Setup & Deploy guide
    ├── ARCHITECTURE.md       ← Kiến trúc hệ thống
    ├── API.md                ← API reference
    ├── BUGFIX_LOG.md         ← Lịch sử toàn bộ bug fixes (N12-N25)
    ├── BUG_TRACK.md          ← Bug tracker chi tiết
    ├── CHANGELOG.md          ← Changelog theo phiên bản
    ├── CLAUDE.md             ← Context cho AI assistant
    └── SETUP.md              ← Hướng dẫn cài đặt mở rộng
```
