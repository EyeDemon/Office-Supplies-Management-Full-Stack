# QLVPP N29 — Hướng Dẫn Cài Đặt & Vận Hành

> Stack: **React 18 + Vite · Node.js 20 + Express · MySQL 8 · Docker + Nginx**  
> Thời gian setup: ~5 phút (Docker) hoặc ~15 phút (manual)

---

## Mục lục

1. [Tài khoản mẫu](#1-tài-khoản-mẫu)
2. [Phương án A — Docker Compose (khuyến nghị)](#2-phương-án-a--docker-compose)
3. [Phương án B — Dev Mode không Docker](#3-phương-án-b--dev-mode-không-docker)
4. [Biến môi trường](#4-biến-môi-trường)
5. [Cấu hình Email](#5-cấu-hình-email)
6. [Chạy Test Suite](#6-chạy-test-suite)
7. [Quản lý Database](#7-quản-lý-database)
8. [Deploy lên Production](#8-deploy-lên-production)
9. [Xử lý sự cố](#9-xử-lý-sự-cố)
10. [Checklist deploy](#10-checklist-deploy)

---

## 1. Tài khoản mẫu (Môi trường Dev hiện tại)

| Username     | Password    | Role      | Quyền hạn                                         |
|--------------|-------------|-----------|---------------------------------------------------|
| `admin`      | `qlvpp_pw`  | ADMIN     | Toàn quyền · quản lý user · audit log · chỉnh tồn |
| `manager1`   | `qlvpp_pw`  | MANAGER   | Duyệt mọi phiếu · báo cáo · PR/PO · xem kho      |
| `warehouse1` | `qlvpp_pw`  | WAREHOUSE | Nhập/xuất/kiểm kê · điều chuyển · vị trí kho      |
| `user1`      | `qlvpp_pw`  | USER      | Tạo/xem phiếu cấp phát của chính mình             |

> ⚠️ **Lưu ý:** Hệ thống đã được đồng bộ hóa với **Golden Schema v4.0.0**. Mật khẩu mặc định đã được reset thành `qlvpp_pw`.

---

## 2. Phương án A — Docker Compose

### Yêu cầu

- Docker Desktop ≥ 24 **hoặc** Docker Engine ≥ 24 + Docker Compose v2
- Port **80** và **3306** chưa bị chiếm
- Không cần cài Node.js hay MySQL trên máy host

### Bước 1 — Giải nén

```bash
unzip workspace_N29_final.zip
cd workspace_gap06_final
```

### Bước 2 — Tạo `.env`

```bash
cp .env.example .env

# Sinh SESSION_SECRET ngẫu nhiên (bắt buộc)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Mở `.env` và điền **3 giá trị bắt buộc**:

```env
MYSQL_ROOT_PASSWORD=qlvpp_root_abc123    # Đổi thành mật khẩu mạnh
MYSQL_PASSWORD=qlvpp_app_xyz789          # Đổi thành mật khẩu mạnh
SESSION_SECRET=<96 ký tự hex vừa sinh>  # BẮT BUỘC
CORS_ORIGIN=http://localhost
FRONTEND_URL=http://localhost
EMAIL_MODE=dev
```

### Bước 3 — Build và khởi động

```bash
docker compose up -d --build
# Lần đầu: 3–8 phút | Lần sau: ~30 giây
```

### Bước 4 — Kiểm tra

```bash
docker compose ps
# Mong đợi:
# qlvpp-db        healthy   3306/tcp
# qlvpp-api   healthy   8080/tcp
# qlvpp-web  running   0.0.0.0:80->80/tcp

docker compose logs -f   # Ctrl+C để thoát
```

### Bước 5 — Truy cập

| URL | Mô tả |
|-----|-------|
| `http://localhost` | Ứng dụng web |
| `http://localhost/api/health` | Health check (`{"status":"UP"}`) |

### Lệnh Docker hữu ích

```bash
docker compose down                  # Dừng, giữ data
docker compose down -v               # Dừng + XÓA TOÀN BỘ DATA
docker compose restart api       # Restart backend
docker compose up -d --build api # Cập nhật code backend
docker exec -it qlvpp-api sh     # Vào shell container
docker exec -it qlvpp-db mysql -u qlvpp_user -p qlvpp  # MySQL CLI
```

---

## 3. Phương án B — Dev Mode không Docker

### Yêu cầu

| Phần mềm | Phiên bản |
|----------|-----------|
| Node.js  | ≥ 20.0.0  |
| MySQL    | 8.0.x     |
| npm      | ≥ 9       |

### Bước 1 — Chuẩn bị MySQL

```sql
mysql -u root -p0918102005PHIVAN

CREATE DATABASE IF NOT EXISTS qlvpp
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'qlvpp_user'@'localhost'
  IDENTIFIED BY 'qlvpp_pw';
GRANT ALL PRIVILEGES ON qlvpp.* TO 'qlvpp_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

```bash
# Nạp schema + seed data
mysql -u qlvpp_user -p qlvpp < database/schema.sql
```

> **Chỉ cần `database/schema.sql`** — file này chứa 39 bảng + triggers + views + seed data.  
> Không cần chạy `migration_p*.sql`.

### Bước 2 — Backend

```bash
cd apps/api
cp .env.example .env   # Sửa DB_PASSWORD và SESSION_SECRET
npm install
npm run dev            # nodemon — auto-reload khi sửa code
# → http://localhost:8080
```

### Bước 3 — Frontend (terminal mới)

```bash
cd apps/web
npm install
npm run dev   # Vite HMR
# → http://localhost:5173
```

> Vite tự proxy `/api/*` → `http://localhost:8080` — không cần cấu hình thêm.

### Shortcut — Khởi động cả hai

```bash
# Từ thư mục root
node launch.js
```

---

## 4. Biến môi trường

### Root `.env` (Docker Compose)

| Biến | Bắt buộc | Mô tả |
|------|:--------:|-------|
| `MYSQL_ROOT_PASSWORD` | ✅ | Mật khẩu MySQL root |
| `MYSQL_PASSWORD` | ✅ | Mật khẩu app user |
| `SESSION_SECRET` | ✅ | ≥ 32 ký tự ngẫu nhiên — server từ chối khởi động nếu thiếu/ngắn |
| `CORS_ORIGIN` | — | URL frontend. Dev: `http://localhost:5173`. Docker: `http://localhost` |
| `FRONTEND_URL` | — | Dùng trong link email reset password |
| `EMAIL_MODE` | — | `dev` (log console) hoặc `smtp` (gửi thật) |

### Backend `.env` (dev mode)

| Biến | Bắt buộc | Mô tả |
|------|:--------:|-------|
| `DB_HOST` | ✅ | `localhost` (dev) hoặc `db` (Docker internal) |
| `DB_PORT` | — | `3306` |
| `DB_NAME` | ✅ | `qlvpp` |
| `DB_USER` | ✅ | MySQL username |
| `DB_PASSWORD` | ✅ | MySQL password |
| `PORT` | — | `8080` |
| `NODE_ENV` | — | `development` / `production` |
| `SESSION_SECRET` | ✅ | ≥ 32 ký tự |
| `CORS_ORIGIN` | — | `http://localhost:5173` (Vite) |
| `SMTP_*` | nếu smtp | Xem phần Email bên dưới |

---

## 5. Cấu hình Email

### Chế độ `dev` (mặc định)

Link reset password ghi vào console và file `/tmp/qlvpp_reset_emails.log`.  
Không cần cấu hình thêm — dùng cho local và demo.

### Gmail (chế độ `smtp`)

```bash
# 1. Bật 2FA: https://myaccount.google.com/security
# 2. Tạo App Password: https://myaccount.google.com/apppasswords
#    → Mail → Other "QLVPP" → Copy 16 ký tự
```

```env
EMAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM=QLVPP <your@gmail.com>
```

### Resend (dễ hơn Gmail)

```env
EMAIL_MODE=smtp
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx
SMTP_FROM=QLVPP <onboarding@resend.dev>
```

---

## 6. Chạy Test Suite

```bash
cd apps/api

# Toàn bộ suite (164 tests, ~2.5s, không cần DB)
node node_modules/jest/bin/jest.js --no-coverage

# Với coverage report
node node_modules/jest/bin/jest.js --coverage

# Một file cụ thể
node node_modules/jest/bin/jest.js --testPathPattern="businessFlow" --verbose --no-coverage

# Một suite cụ thể
node node_modules/jest/bin/jest.js --testNamePattern="Reservation Lifecycle" --no-coverage
```

Kết quả mong đợi:
```
Test Suites: 3 passed, 3 total
Tests:       164 passed, 164 total
Time:        ~2.5s
```

| File | Tests | Nội dung |
|------|------:|---------|
| `unit/stockHelper.test.js` | 57 | Moving avg · reservation · ledger · unit conversion |
| `integration/concurrency.test.js` | 40 | Idempotency · Auto-PR dedup · RBAC · pagination |
| `unit/businessFlow.test.js` | 67 | State machines · anti-oversell · race condition · stocktaking |

---

## 7. Quản lý Database

### Backup

```bash
# Docker
docker exec qlvpp-db mysqldump \
  -u qlvpp_user -p'YOUR_PW' qlvpp \
  > backup_$(date +%Y%m%d_%H%M).sql

# Local dev
mysqldump -u qlvpp_user -p qlvpp > backup_$(date +%Y%m%d_%H%M).sql
```

### Restore

```bash
# Docker
docker exec -i qlvpp-db mysql \
  -u qlvpp_user -p'YOUR_PW' qlvpp \
  < backup_20260428.sql

# Local dev
mysql -u qlvpp_user -p qlvpp < backup_20260428.sql
```

### Reset về dữ liệu gốc

```bash
# Docker
docker compose down -v
docker compose up -d --build

# Local dev
mysql -u qlvpp_user -p -e "DROP DATABASE qlvpp; CREATE DATABASE qlvpp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u qlvpp_user -p qlvpp < database/schema.sql
```

### Query kiểm tra nhanh

```sql
-- Vào MySQL CLI
docker exec -it qlvpp-db mysql -u qlvpp_user -p qlvpp

-- Kiểm tra users
SELECT id, username, role, active FROM users;

-- Tồn kho hiện tại
SELECT p.name, p.stock_qty, p.reserved_quantity,
       (p.stock_qty - p.reserved_quantity) AS available,
       p.avg_unit_price
FROM products p WHERE p.deleted = 0
ORDER BY available ASC LIMIT 20;

-- 10 giao dịch gần nhất
SELECT * FROM stock_transactions ORDER BY created_at DESC LIMIT 10;

-- Sổ cái gần nhất
SELECT * FROM stock_ledger ORDER BY created_at DESC LIMIT 10;
```

---

## 8. Deploy lên Production

### Checklist bảo mật

- [ ] `SESSION_SECRET` ≥ 64 ký tự hex ngẫu nhiên
- [ ] `MYSQL_PASSWORD` mạnh ≥ 16 ký tự
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN` = domain chính xác của frontend
- [ ] `EMAIL_MODE=smtp` (nếu cần reset password)
- [ ] Đổi mật khẩu tài khoản `admin` mặc định sau deploy

### VPS với Docker (self-hosted)

```bash
# Trên VPS Ubuntu 22+
curl -fsSL https://get.docker.com | sh

# Copy project lên server
scp workspace_N29_final.zip user@vps-ip:~/
ssh user@vps-ip
unzip workspace_N29_final.zip && cd workspace_gap06_final

# Cấu hình .env production
cp .env.example .env
# Sửa: MYSQL_*, SESSION_SECRET, NODE_ENV=production, CORS_ORIGIN=https://domain.com

docker compose up -d --build
```

### Railway (PaaS đơn giản nhất)

```bash
git init && git add . && git commit -m "N29"
git remote add origin https://github.com/you/qlvpp.git
git push -u origin main
# Railway.app → New Project → Deploy from GitHub
# Thêm MySQL service → set env vars → deploy
```

### Biến môi trường production

```env
NODE_ENV=production
SESSION_SECRET=<64+ ký tự ngẫu nhiên>
MYSQL_PASSWORD=<mật khẩu mạnh>
CORS_ORIGIN=https://qlvpp.yourdomain.com
FRONTEND_URL=https://qlvpp.yourdomain.com
EMAIL_MODE=smtp
# + SMTP_* vars
```

---

## 9. Xử lý sự cố

### Container `qlvpp-api` không `healthy`

```bash
docker compose logs api | tail -30
```

| Log message | Nguyên nhân | Fix |
|---|---|---|
| `SESSION_SECRET must be set` | Thiếu hoặc ngắn < 32 ký tự | Sinh lại SESSION_SECRET |
| `ER_ACCESS_DENIED_ERROR` | Sai DB credentials | Kiểm tra `.env` khớp `docker-compose.yml` |
| `ECONNREFUSED :3306` | DB chưa sẵn sàng | Chờ 30s — DB healthcheck cần ~20s |
| `Cannot find module` | node_modules lỗi trong image | `docker compose build --no-cache api` |

### Port 80 bị chiếm

```bash
# Tìm process
sudo lsof -i :80

# Đổi port trong docker-compose.yml
ports:
  - "8090:80"   # Truy cập http://localhost:8090
```

### CORS error / Network Error trong frontend

Kiểm tra `CORS_ORIGIN` trong `.env`:
- Dev (Vite): `http://localhost:5173`
- Docker: `http://localhost`
- Production: `https://yourdomain.com` (không có `/` cuối)

### Login thành công nhưng redirect loop

Session cookie cũ không hợp lệ sau khi `SESSION_SECRET` thay đổi.

```bash
# Xóa cookies trình duyệt cho localhost, hoặc:
docker compose restart api
```

### `npm run dev` lỗi Cannot find module

```bash
cd apps/web  # hoặc cd apps/api
rm -rf node_modules package-lock.json
npm install
```

### MySQL Error 1062 Duplicate entry khi restart

`schema.sql` đã được nạp vào volume, nhưng Docker cố chạy lại.  
Docker **chỉ** chạy `initdb.d` khi volume **trống**.

```bash
docker volume ls  # Kiểm tra volume tồn tại
docker compose down -v && docker compose up -d --build  # Reset
```

### Test fail — `jest: Permission denied`

```bash
# Không dùng npm test trực tiếp — dùng node
node node_modules/jest/bin/jest.js --no-coverage
```

### Backend log spam `[LOW_STOCK]`

Đây là cron job hợp lệ — không phải lỗi. Tắt trong `.env`:
```env
DISABLE_STOCK_CRON=true
```

---

## 10. Checklist deploy

### Trước khi deploy

- [ ] `SESSION_SECRET` sinh ngẫu nhiên, ≥ 64 ký tự
- [ ] `MYSQL_ROOT_PASSWORD` và `MYSQL_PASSWORD` đã đổi khỏi mặc định
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN` = URL chính xác của frontend (không `/` cuối)
- [ ] Email được cấu hình nếu cần reset password
- [ ] Backup DB nếu upgrade từ version cũ

### Sau khi deploy

- [ ] `docker compose ps` → 3 container `healthy`/`running`
- [ ] `GET /api/health` → `{"status":"UP","database":"connected"}`
- [ ] Đăng nhập `admin/password` → Dashboard đầy đủ 4 row stat cards
- [ ] Tab Reports → Chi phí → load không lỗi
- [ ] Dashboard Warehouse → hiển thị `approvedImportOrders` + `draftExportOrders`
- [ ] Tạo phiếu nhập → duyệt → tồn kho tăng đúng
- [ ] Tạo phiếu cấp phát (USER) → duyệt (MANAGER) → tồn kho giảm đúng
- [ ] **Đổi mật khẩu admin mặc định**
- [ ] Test suite: `164 passed` (chạy từ `apps/api/`)

---

*Cập nhật lần cuối: Golden Schema v4.0.0 — 2026-05-02*  
*Kỹ thuật nâng cao → [`ARCHITECTURE.md`](ARCHITECTURE.md) · Lịch sử → [`CHANGELOG.md`](CHANGELOG.md)*