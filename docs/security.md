# Tài liệu Bảo mật (Security) — QLVPP

Hệ thống QLVPP áp dụng cơ chế bảo mật nhiều lớp để bảo vệ toàn vẹn dữ liệu và ngăn chặn truy cập trái phép.

## 1. CSRF Protection — Spec VII.3
Hệ thống sử dụng Double Submit Cookie pattern để ngăn chặn tấn công CSRF.
- **Backend**: Middleware `csrf.js` kiểm tra token trong header `X-CSRF-Token` so với token trong session.
- **Frontend**: `api.js` tự động lấy token từ cookie/meta và đính kèm vào mọi request mutation (POST/PUT/DELETE).
- **Retry Logic**: Nếu CSRF token hết hạn (403 CSRF_INVALID), Frontend sẽ tự động xóa token cũ, lấy token mới và retry request một lần duy nhất.

## 2. RBAC (Role-Based Access Control) — Spec XV
Phân quyền dựa trên vai trò người dùng:
- **ADMIN**: Toàn quyền hệ thống.
- **MANAGER**: Quản lý bộ phận, duyệt yêu cầu, xem báo cáo tổng hợp.
- **WAREHOUSE**: Thực hiện nhập/xuất kho, kiểm kê, quản lý kho được gán.
- **USER**: Tạo yêu cầu cấp phát, xem lịch sử cá nhân.

Cơ chế thực thi:
- **Middleware**: `requireAdmin`, `requireManagerOrAdmin`, v.v.
- **Data Filter**: `buildWarehouseFilter` đảm bảo thủ kho chỉ thấy dữ liệu của kho mình quản lý.

## 3. Rate Limiting — Spec XVI
Bảo vệ hệ thống khỏi brute-force và spam request bằng Redis-based sliding window.
- **Login**: Giới hạn 5 lần thử sai / 15 phút.
- **Global API**: Giới hạn 100 requests / 1 phút / IP hoặc User.
- **Forgot Password**: Giới hạn 3 lần / giờ.

## 4. Idempotency — Spec XX
Đảm bảo các thao tác ghi dữ liệu (Write operations) không bị lặp lại khi người dùng double-click hoặc network bị chập chờn.
- Client gửi `Idempotency-Key` (UUID) trong header.
- Backend lưu kết quả xử lý vào bảng `idempotency_keys`.
- Nếu gặp lại key cũ trong vòng 24h, Backend trả về kết quả đã cache thay vì xử lý lại.

## 5. Audit Logging — Spec X.3
Mọi hành động nhạy cảm đều được ghi lại vào bảng `general_audit_log` bao gồm:
- `changed_by` (UserId)
- `action` (CREATE/UPDATE/DELETE/APPROVE)
- `before_data` và `after_data` (JSON)
- `ip_address`
