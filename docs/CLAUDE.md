# CLAUDE.md — Hướng dẫn kỹ thuật cho AI / dev mới
> Đọc file này đầu tiên khi vào dự án. Version: 4.1.0 (04/05/2026) — Production Stabilization

## Stack
```
Backend:   Node.js 20 + Express 4 + mysql2/promise + express-session + BullMQ (Redis)
Frontend:  React 18 + Vite 5 + Bootstrap 5 + React-Bootstrap
Database:  MySQL 8.0 (39 tables, v4.1.0 Optimized Schema)
Deploy:    Docker Compose (apps/api + apps/web + MySQL + Redis)
Architecture: Monorepo (Clean Architecture + DDD patterns)
```

## Tài khoản test
| username     | password   | role      |
|--------------|------------|-----------|
| `admin`      | `admin123` | ADMIN     |
| `manager1`   | `manager123`| MANAGER   |
| `warehouse1` | `wh123`    | WAREHOUSE |

## Cấu trúc thư mục (v4.1.0 Monorepo)
```
apps/
  api/                  ← Backend entry: server.js
    src/
      controllers/      ← Interface Adapters (HTTP handling)
      use-cases/        ← Business logic (application layer)
      shared/
        config/db.js    ← MySQL pool
        middleware/     ← auth, rbac, idempotency, csrf, validate
        dto/            ← Zod validation schemas (product, order, purchase, ...)
      domain/           ← Core business rules (errors, entities, rules/state-machine)
      infrastructure/   ← Repositories (Persistence), Services (Email, Unit)
  web/                  ← Frontend
    tests/e2e/          ← Playwright specs (auth, inventory, purchase, stocktaking, transfer, reports)
packages/
  db/schema.sql         ← v4.1.0 Optimized Schema (Single Source of Truth)
  contracts/            ← Shared API contracts (ErrorCodes, HTTP mapping)
```

## Biến môi trường (.env) quan trọng
- `ADJUSTMENT_THRESHOLD`: Số lượng chênh lệch tối đa cho phép điều chỉnh kho tự động (mặc định: 100). Vượt ngưỡng này yêu cầu phê duyệt của Admin.
- `SESSION_SECRET`: Key mã hóa session (tối thiểu 32 ký tự).
- `REDIS_HOST/PORT`: Cấu hình cho BullMQ và Dashboard Cache.

## Quy tắc nghiệp vụ Core (v4.1.0)
1. **Stocktaking Lock**: Khi một kho đang trong phiên kiểm kê (`OPEN`), mọi hoạt động nhập/xuất/điều chuyển lẻ đều bị chặn (`WAREHOUSE_LOCKED`).
2. **Idempotency**: Mọi API mutation (POST/PUT/DELETE) bắt buộc qua `idempotencyCheck` middleware để tránh double-spending/duplicate records.
3. **Unit Conversion**: `UnitService` sử dụng thuật toán BFS để hỗ trợ chuyển đổi đa cấp (VD: Thùng -> Hộp -> Cái) và tra cứu ngược.
4. **Moving Average**: Giá vốn được tính theo phương pháp Bình quân gia quyền di động ngay tại thời điểm nhập kho.
5. **Partial Fulfillment**: Hỗ trợ xuất kho từng phần (`PARTIAL`) cho đơn hàng lớn.

## Testing
- **Integration**: `npx jest src/__tests__/integration/system_v4`
- **E2E**: `npx playwright test` (Yêu cầu server đang chạy)

## Shim Layer (Legacy Compatibility)
Các file tại `src/config/`, `src/middleware/`, `src/utils/` là shim trỏ về `src/shared/`. KHÔNG sửa trực tiếp các file shim.
