# QLVPP — Hướng dẫn Khởi chạy Nhanh

## 📋 Yêu cầu hệ thống
| Công cụ | Phiên bản tối thiểu |
|---|---|
| Docker | 24+ |
| Docker Compose | v2+ |
| Node.js (dev local) | 20+ |
| MySQL | 8.0+ |

---

## 🚀 Cách 1: Chạy bằng Docker (Khuyến nghị)

```bash
# 1. Sao chép file môi trường
cp .env.example .env

# 2. Điền SESSION_SECRET (bắt buộc, tối thiểu 32 ký tự)
# Ví dụ: openssl rand -hex 32
nano .env

# 3. Build và khởi chạy toàn bộ stack
docker-compose up --build

# Truy cập: http://localhost
```

### Tài khoản mặc định (password: `password`)
| Tài khoản | Vai trò |
|---|---|
| `admin` | Admin — toàn quyền |
| `manager1` | Manager — duyệt phiếu |
| `warehouse1` | Warehouse — xuất nhập kho |
| `user1` | Employee — tạo yêu cầu |

---

## 🛠 Cách 2: Chạy local (Development)

### Backend
```bash
cd apps/api
npm install
# Đảm bảo MySQL đang chạy và schema đã import
# mysql -u root -p qlvpp < ../../packages/db/schema.sql
npm run dev        # http://localhost:8081
```

### Frontend
```bash
cd apps/web
npm install
npm run dev        # http://localhost:5173
```

> **Lưu ý**: Redis là optional khi chạy local. API sẽ log warning nhưng không crash.

---

## 📁 Cấu trúc thư mục chính

```
apps/
  api/              — Node.js 20 + Express (Backend)
    src/
      controllers/  — Express routes + DTO validation
      use-cases/    — Application business logic
      domain/       — Core business rules & errors
      infrastructure/ — Repositories (MySQL)
      shared/       — Config, middleware, utils
  web/              — React 18 + Vite (Frontend)
    src/
      features/     — Feature-based modules
      components/   — Shared UI components
      services/     — API client (axios)
packages/
  db/               — MySQL schema + seed data
  contracts/        — Shared types giữa FE và BE
```

---

## 🔑 Biến môi trường quan trọng

| Biến | Mô tả | Bắt buộc |
|---|---|---|
| `SESSION_SECRET` | JWT/Session secret (min 32 chars) | ✅ |
| `MYSQL_ROOT_PASSWORD` | MySQL root password | ✅ |
| `MYSQL_PASSWORD` | MySQL app user password | ✅ |
| `REDIS_PASSWORD` | Redis password | Khuyến nghị |
| `CORS_ORIGIN` | URL frontend (production) | Production |

---

## 🧪 Chạy tests

```bash
# Unit tests
cd apps/api && npm run test:unit

# Integration tests (cần MySQL)
cd apps/api && npm test
```

---

## 🐛 Troubleshooting

| Vấn đề | Nguyên nhân | Giải pháp |
|---|---|---|
| API crash ngay khi start | Redis ECONNREFUSED | Bình thường khi local — API vẫn chạy |
| `SESSION_SECRET` too short | Config thiếu | Thêm min 32 chars vào `.env` |
| Docker web container không start | API chưa healthy | Đợi 30s sau `docker-compose up` |
| 400 VALIDATION_ERROR mọi POST | CSRF token thiếu | Frontend tự động fetch, reload trang |