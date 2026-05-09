# ARCHITECTURE.md — Kiến trúc hệ thống QLVPP

---

## 1. Tổng quan kiến trúc

```
Browser (React 18 + Vite)
        │  HTTP/REST  │  JSON
        ▼             ▼
   Nginx (port 80)          ← Serve React build + reverse proxy /api
        │
        ▼
   Express.js (port 8080)   ← Business logic, session, RBAC
        │
        ▼
   MySQL 8.0 (port 3306)    ← Source of truth
```

**Kiến trúc:** Modular Monolith + Clean Architecture (4 lớp) + Internal Notification Events

```
Layer 1 — Interface Adapters (Controller / Router)
     src/controllers/*.controller.js     ← Clean Architecture: parse req → UseCase → res
     src/routes/*.js                     ← Fat routes: GET listings + legacy read endpoints

Layer 2 — Application Logic (Use Cases)
     src/use-cases/inventory/*.js        ← 14 UseCase classes (stateless, no HTTP)
     src/use-cases/auth/*.js

Layer 3 — Domain (Business Rules & Entities)
     src/domain/entities/               ← Stock, InventoryTransaction, StockLedger
     src/domain/rules/index.js          ← StateMachine, computeMovingAverage, guardSufficientStock
     src/domain/errors/index.js         ← InsufficientStockError, InvalidStateTransitionError, ...

Layer 4 — Infrastructure (Repositories)
     src/infrastructure/repositories/  ← StockRepository, OrderRepository, LedgerRepository, ...
     src/shared/config/db.js            ← mysql2/promise pool
```

**Mount strategy (server.js):** Controller mount **TRƯỚC** fat route cho cùng prefix.
Controller xử lý tất cả write operations (POST/PUT/DELETE).
Fat route xử lý GET listings và các legacy read endpoints.

| Prefix | Controller (write) | Fat Route (read) |
|--------|--------------------|-----------------|
| `/api/orders` | `POST /:id/complete` (InboundUC) | GET /, GET /:id |
| `/api/export-orders` | `POST /:id/complete` (OutboundUC) | GET /, GET /:id, submit/approve/reject |
| `/api/transfers` | `POST /:id/complete` (TransferUC) | GET /, GET /:id, submit/approve/dispatch |
| `/api/adjustments` | `POST /` (AdjustmentUC) | GET /, GET /:id |
| `/api/stocktaking` | `POST /:id/complete` (StocktakingUC) | GET /, GET /:id, PUT /:id/items |
| `/api/requisitions` | `POST /`, approve, reject, cancel, warehouse-confirm | GET listings |
| `/api/purchases` | `POST /requests`, `/orders`, receive, confirm | GET listings |
| `/api/reports` | GET in-out-balance, inventory-value, consumption, etc. | GET dead-stock, activity |


## 2. Stock Tracking — Nguồn dữ liệu tồn kho

### Hai bảng chính:
| Bảng | Ý nghĩa |
|------|---------|
| `products.stock_qty` | Tổng tồn toàn hệ thống |
| `warehouse_stock.stock_qty` | Tồn theo từng kho |

### Quy tắc mutation:

| Hành động | products.stock_qty | warehouse_stock |
|-----------|-------------------|--------------------|
| Nhập kho hoàn tất | + qty | kho đích + qty |
| Xuất kho hoàn tất | − qty | kho nguồn − qty |
| Điều chuyển hoàn tất | **không đổi** | nguồn − qty, đích + qty |
| Kiểm kê hoàn tất | = actual_qty | = actual_qty |
| Điều chỉnh tồn | = new_qty (tuyệt đối) | đồng bộ theo delta |

### Công thức Available:
```
available_qty = stock_qty − reserved_quantity
```
`reserved_quantity` tăng khi duyệt requisition, giảm khi xuất hoặc cancel.

---

## 3. Moving Average Cost (Spec IV)

Khi nhập kho:
```
new_avg = (old_qty × old_avg + in_qty × in_price) / (old_qty + in_qty)
```

Khi xuất kho:
```
unit_cost = stock.avg_unit_price  (snapshot tại thời điểm xuất)
```

Edge case: `qty = 0` → `avg_price = in_price` (reset về giá nhập mới nhất).

Thực thi tại: `backend/src/routes/products.js` (stock-in handler, line ~380).

---

## 4. Concurrency Strategy

| Tình huống | Chiến lược |
|-----------|------------|
| Xuất kho / nhập kho | `SELECT ... FOR UPDATE` trong transaction |
| Tạo mã phiếu (DC-, PN-) | `GET_LOCK(name, 10)` + `FOR UPDATE` — serialize |
| API double submit | `Idempotency-Key` header (UUID) lưu vào `idempotency_keys` |
| Update nhẹ (profile) | Optimistic — last write wins |

Hàm tiện ích: `adjustWarehouseStock(conn, whId, prodId, delta, allowNegative=false)`
→ ném lỗi khi tồn âm và `allowNegative=false`.

---

## 5. RBAC — Phân quyền

### Roles (DB ENUM):
```
ADMIN > MANAGER > WAREHOUSE > USER
```

### Middleware helpers:
```js
requireAdmin          // chỉ ADMIN
requireManagerOrAdmin // ADMIN + MANAGER
requireWarehouseOrAdmin // ADMIN + MANAGER + WAREHOUSE
requireLogin          // bất kỳ role đã đăng nhập
```

### Data-level authorization:
- **MANAGER**: `WHERE department_id IN (:user_departments)` (concept — chưa enforce DB level)
- **WAREHOUSE**: chỉ thấy kho được gán trong `user_warehouses`
- **ADMIN**: thấy tất cả

### Frontend helpers (AuthContext):
```js
const { isAdmin, isManager, isWarehouse, isManagerOrAdmin, isWarehouseOrAdmin } = useAuth();
```

---

## 6. Status Machine (Spec XVIII)

```
DRAFT ──→ PENDING ──→ APPROVED ──→ COMPLETED
                   ↘ REJECTED
DRAFT ──→ CANCELLED (trước COMPLETED)
```

**Bất biến:**
- Không sửa sau `COMPLETED`
- Không huỷ sau `COMPLETED`
- `reserved_quantity` tăng khi `APPROVED`, giảm khi `CANCELLED`/`REJECTED`/`COMPLETED`

---

## 7. Notification System

**Trigger events:**
| Event | Khi nào | Gửi cho |
|-------|---------|---------|
| `REQUISITION_CREATED` | Tạo phiếu YC mới | MANAGER + ADMIN |
| `REQUISITION_APPROVED` | Duyệt/từ chối | Người tạo |
| `STOCK_LOW` | Tồn ≤ min_stock_qty | MANAGER + ADMIN |
| `APPROVAL_REQUIRED` | Phiếu nhập cần duyệt | MANAGER + ADMIN |

**Helpers (notifications.js exports):**
```js
syncLowStockNotifications()   // gọi sau mỗi stock mutation
notifyRequisitionCreated(code, id, requesterName)
notifyRequisitionStatus(code, id, requesterId, status, actorName)
```

---

## 8. API Conventions

**Response format:**
```json
{ "success": true,  "message": "OK", "data": {...} }
{ "success": false, "message": "Mô tả lỗi rõ ràng" }
```

**Pagination — 2 conventions (legacy, FE↔BE đã đồng bộ):**
- 0-based: `products`, `orders`, `requisitions` → `?page=0&size=20`
- 1-based: `export-orders`, `transfers`, `purchases`, `stocktaking`, `returns` → `?page=1&limit=20`

**Idempotency:**
```
POST requests → header: Idempotency-Key: <UUID>
```

**Dual mount note:**
`/api/reports` và `/api/dashboard` cùng mount `dashRoutes` (Express hợp lệ, WAREHOUSE cần /reports).

---

## 9. Database Schema — Các bảng chính

```
users
 ├── password_reset_tokens
 ├── login_audit_log
 ├── general_audit_log
 └── user_warehouses ──→ warehouses
                              └── warehouse_locations [N14]
                              └── warehouse_stock ──→ products
                                                        ├── lots [N14]
                                                        └── price_history [N14]

products ──→ categories
         ──→ units [N14] ──→ unit_conversions [N14]

import_orders ──→ import_order_items ──→ products, lots
export_orders ──→ export_order_items ──→ products, lots
stock_transfers ──→ stock_transfer_items ──→ products, lots
requisitions ──→ requisition_items ──→ products
purchase_requests ──→ purchase_orders
return_orders ──→ return_items
stocktaking_sessions ──→ stocktaking_items

notifications
idempotency_keys [N14]
sessions
```

---

## 10. Key Design Decisions

| Decision | Lý do |
|----------|-------|
| **Monolith, không Microservices** | Dự án cá nhân — tránh over-engineering |
| **Không dùng ORM** | mysql2 trực tiếp → dễ debug SQL, tránh N+1 hidden |
| **Session-based auth** | Đơn giản hơn JWT cho single-domain deployment |
| **reserved_quantity** | Tránh race condition oversell mà không cần distributed lock |
| **Moving Average Cost** | Chuẩn ERP, đơn giản hơn FIFO/LIFO |
| **GET_LOCK() cho code gen** | MySQL built-in, không cần Redis |
| **useConfirm hook** | Non-blocking UX, styleable, testable — thay window.confirm |
| **IF NOT EXISTS** | init.sql idempotent — chạy nhiều lần không crash |
| **TypeScript Migration** | **CANCELLED** — Duy trì JavaScript để tối ưu tốc độ phát triển và sự đơn giản. |

---

## 11. TypeScript Migration (Decision Record)

Tính đến phiên bản 4.0.0, kế hoạch chuyển đổi sang TypeScript đã bị **hủy bỏ chính thức**. 

**Lý do:**
1. **Tốc độ phát triển**: Team ưu tiên sự linh hoạt và vòng lặp phát triển nhanh của JavaScript thuần.
2. **Quy mô dự án**: Độ phức tạp hiện tại chưa đủ lớn để đánh đổi lấy chi phí thiết lập và bảo trì build pipeline của TS.
3. **Tập trung ổn định**: Ưu tiên cao nhất hiện nay là tính toàn vẹn dữ liệu, độ chính xác của các thuật toán tài chính (Moving Average Cost) và hiệu năng hệ thống.

**Giải pháp thay thế**: Sử dụng JSDoc và Zod (validate DTO) để cung cấp sự an toàn về kiểu dữ liệu ở mức độ cần thiết mà không làm phức tạp hóa kiến trúc.