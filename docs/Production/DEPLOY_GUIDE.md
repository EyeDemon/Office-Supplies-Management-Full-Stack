# QLVPP v4.1.0 — Hướng dẫn Triển khai & Vận hành (Production)

Tài liệu này hướng dẫn chi tiết cách triển khai hệ thống QLVPP trên môi trường thực tế (Production) bằng Docker Compose, đảm bảo tính bảo mật và hiệu năng.

---

## 1. Yêu cầu Hệ thống
- **OS**: Linux (Ubuntu 22.04 LTS khuyến nghị) hoặc Windows Server có Docker.
- **Tài nguyên tối thiểu**: 2 vCPU, 4GB RAM, 20GB SSD.
- **Công cụ**: Docker Engine 24+, Docker Compose v2.20+.

---

## 2. Các bước triển khai Nhanh

### Bước 1: Chuẩn bị mã nguồn
```bash
git clone <repository_url>
cd project_v39_fixed
```

### Bước 2: Cấu hình Môi trường
Sao chép file mẫu và chỉnh sửa các thông tin quan trọng:
```bash
cp .env.example .env
```
**Các biến BẮT BUỘC phải thay đổi trong `.env`:**
- `MYSQL_ROOT_PASSWORD`: Mật khẩu root DB.
- `MYSQL_PASSWORD`: Mật khẩu cho user `qlvpp_user`.
- `REDIS_PASSWORD`: Mật khẩu bảo mật cho Redis.
- `SESSION_SECRET`: Chạy lệnh sau để tạo key 96 ký tự:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `CORS_ORIGIN`: Domain hoặc IP của bạn (ví dụ: `https://qlvpp.com`).

### Bước 3: Khởi động hệ thống
```bash
docker compose up -d --build
```
Hệ thống sẽ tự động khởi tạo database, nạp schema và dữ liệu mẫu (seed data) trong lần đầu tiên chạy.

---

## 3. Quản lý & Giám sát

### Kiểm tra Trạng thái
- Truy cập trực tiếp qua web: `/system-status` (Yêu cầu quyền Admin).
- Kiểm tra qua lệnh: `docker compose ps`

### Xem Logs
Hệ thống sử dụng **Pino Structured Logging**. Để xem logs mà không bị spam bởi health checks:
```bash
# Xem log API
docker compose logs -f api | grep -v "GET /health"

# Xem log Database
docker compose logs -f db
```

### Sao lưu Dữ liệu (Backup)
Khuyến nghị chạy script backup hàng ngày qua cronjob:
```bash
docker exec qlvpp-db mysqldump -u root -p'PASSWORD' qlvpp > backup_$(date +%F).sql
```

---

## 4. Bảo mật & Hardening (Đã thực hiện)

Dưới đây là các biện pháp bảo mật đã được tích hợp sẵn:
1. **CSP Headers**: Chống tấn công XSS thông qua Nginx và Helmet.
2. **Resource Limits**: Giới hạn RAM/CPU cho từng container tránh treo server.
3. **Log Rotation**: Tự động xoay vòng log, tối đa 10MB x 3 file để bảo vệ ổ cứng.
4. **Rate Limiting**: Giới hạn tần suất request theo IP (dùng Redis).
5. **No-Root Container**: API và Web chạy dưới user không có quyền root.
6. **SQL Security**: Sử dụng user `qlvpp_user` với quyền hạn hạn chế thay vì root.

---

## 5. Xử lý Sự cố (Troubleshooting)

- **Lỗi 502 Bad Gateway**: Thường do container `api` chưa khởi động xong hoặc bị crash. Kiểm tra `docker compose logs api`.
- **Lỗi CSRF Token**: Đảm bảo domain truy cập khớp với `CORS_ORIGIN` trong `.env`.
- **Hết bộ nhớ**: Nếu server yếu, hãy điều chỉnh `limits` trong `docker-compose.yml`.

---
*Tài liệu được cập nhật ngày: 09/05/2026 bởi Đội ngũ Phát triển QLVPP.*
