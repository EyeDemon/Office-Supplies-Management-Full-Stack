# QLVPP — Quản Lý Văn Phòng Phẩm

> **Phiên bản N29** | Node.js + Express + MySQL 8 · React 18 + Vite + Bootstrap 5

Hệ thống quản lý kho văn phòng phẩm toàn diện: nhập/xuất/điều chuyển, kiểm kê, cấp phát, mua hàng, báo cáo, phân quyền đa cấp.

---

## Khởi động nhanh

```bash
# 1. Copy env
cp .env.example .env
# Bắt buộc: sửa SESSION_SECRET (≥32 ký tự)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. Docker (khuyến nghị)
docker compose up -d --build

# Truy cập: http://localhost
# Admin mặc định: admin / password
```

Xem [`docs/SETUP.md`](docs/SETUP.md) để cài dev mode (không Docker).

---

## Tài khoản mẫu

| Username     | Password   | Role      |
|--------------|------------|-----------|
| `admin`      | `password` | ADMIN     |
| `manager1`   | `password` | MANAGER   |
| `warehouse1` | `password` | WAREHOUSE |
| `user1`      | `password` | USER      |

---

## Cấu trúc dự án

```
qlvpp/
├── README.md                        ← File này
├── .env.example                     ← Mẫu biến môi trường
├── docker-compose.yml
├── launch.js                        ← Khởi động dev (backend + frontend)
│
├── docs/
│   ├── CLAUDE.md                    ← Hướng dẫn kỹ thuật cho AI / dev mới
│   ├── SETUP.md                     ← Cài đặt chi tiết (Docker & manual)
│   ├── ARCHITECTURE.md              ← Kiến trúc hệ thống & design decisions
│   ├── API.md                       ← API reference đầy đủ
│   ├── CHANGELOG.md                 ← Lịch sử thay đổi tổng hợp
│   └── BUGFIX_N14.md                ← Fix log phiên N14 (15 bugs)
│
├── database/
│   └── init.sql                     ← Schema MySQL đầy đủ + seed data (standalone)
│
├── backend/
│   ├── server.js                    ← Entry point, mount routes, middleware
│   ├── package.json
│   └── src/
│       ├── config/db.js             ← MySQL connection pool (mysql2/promise)
│       ├── middleware/
│       │   ├── auth.js              ← requireLogin / requireAdmin / requireManagerOrAdmin / requireWarehouseOrAdmin
│       │   └── rate-limiter.js      ← Rate limit (login/register)
│       ├── routes/                  ← 1 file = 1 domain
│       │   ├── auth.js              ← Login / logout / register / reset password
│       │   ├── users.js             ← CRUD user + RBAC
│       │   ├── products.js          ← CRUD + nhập/xuất/điều chỉnh + import Excel
│       │   ├── categories.js        ← CRUD danh mục
│       │   ├── suppliers.js         ← CRUD nhà cung cấp
│       │   ├── warehouses.js        ← CRUD kho + tồn theo kho
│       │   ├── warehouse-locations.js ← CRUD vị trí trong kho (Spec I.3) [NEW N14]
│       │   ├── orders.js            ← Phiếu nhập kho (PN-)
│       │   ├── export-orders.js     ← Phiếu xuất kho (XK-)
│       │   ├── transfers.js         ← Điều chuyển kho (DC-)
│       │   ├── requisitions.js      ← Yêu cầu cấp phát (YC-)
│       │   ├── purchases.js         ← PR (PR-) + PO (PO-)
│       │   ├── returns.js           ← Trả hàng (RTN-)
│       │   ├── stocktaking.js       ← Kiểm kê kho (KK-)
│       │   ├── lots.js              ← Quản lý lô hàng
│       │   ├── units.js             ← Đơn vị tính + quy đổi
│       │   ├── adjustments.js       ← Lịch sử điều chỉnh (read-only)
│       │   ├── notifications.js     ← CRUD + notify helpers
│       │   ├── audit.js             ← Tra cứu audit log
│       │   ├── dashboard.js         ← Stats + Reports
│       │   └── user-warehouses.js   ← RBAC kho theo user
│       ├── utils/
│       │   ├── auditLogger.js       ← writeAuditLog / writeAuditLogSafe
│       │   └── stockHelper.js       ← adjustWarehouseStock / setWarehouseStock
│       └── services/
│           └── emailService.js      ← Nodemailer (dev=log, prod=smtp)
│
└── frontend/
    └── src/
        ├── main.jsx
        ├── App.jsx                  ← Routes + ProtectedRoute guards
        ├── contexts/
        │   └── AuthContext.jsx      ← Global auth state + role helpers
        ├── services/
        │   └── api.js               ← Tất cả axios calls (grouped by feature)
        ├── hooks/
        │   └── useAutoAlert.js
        ├── components/
        │   ├── auth/ProtectedRoute.jsx
        │   └── common/
        │       ├── ConfirmModal.jsx  ← useConfirm hook (thay window.confirm) [NEW N14]
        │       ├── Sidebar.jsx
        │       ├── TopBar.jsx
        │       ├── Modal.jsx
        │       ├── Icons.jsx
        │       ├── AlertMessage.jsx
        │       ├── LoadingSpinner.jsx
        │       └── NotificationBell.jsx
        └── pages/                   ← 26 trang (PascalCase.jsx)
            ├── Dashboard.jsx
            ├── Products.jsx
            ├── Categories.jsx
            ├── Suppliers.jsx
            ├── Warehouses.jsx
            ├── WarehouseLocations.jsx ← [NEW N14]
            ├── Orders.jsx
            ├── ExportOrders.jsx
            ├── StockTransfer.jsx
            ├── Requisitions.jsx
            ├── RequisitionApproval.jsx
            ├── Purchases.jsx
            ├── Returns.jsx
            ├── Stocktaking.jsx
            ├── LotManagement.jsx
            ├── UnitManagement.jsx
            ├── Reports.jsx
            ├── UserManagement.jsx
            ├── UserProfile.jsx
            ├── Notifications.jsx
            ├── AuditLog.jsx
            └── ...
```

---

## Phân quyền

| Role      | Khả năng |
|-----------|----------|
| ADMIN     | Toàn quyền · audit log · điều chỉnh tồn · quản lý user |
| MANAGER   | Duyệt tất cả phiếu · báo cáo · quản lý PR/PO · xem kho |
| WAREHOUSE | Nhập/xuất/kiểm kê/điều chuyển · vị trí kho · báo cáo |
| USER      | Tạo/xem yêu cầu cấp phát của chính mình |

---

## Tài liệu thêm

| File | Nội dung |
|------|----------|
| [`docs/SETUP.md`](docs/SETUP.md) | Cài đặt Docker & manual, troubleshooting |
| [`docs/CLAUDE.md`](docs/CLAUDE.md) | Kỹ thuật nhanh cho AI / dev mới vào dự án |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Kiến trúc, design decisions, data flow |
| [`docs/API.md`](docs/API.md) | API reference: routes, params, response |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Lịch sử version — **N29 hiện tại** |
| [`docs/BUGFIX_N14.md`](docs/BUGFIX_N14.md) | Fix log N14 — 15 bugs |

---

## 🧪 Test Suite

```bash
cd backend
node node_modules/jest/bin/jest.js --no-coverage
# Test Suites: 3 passed
# Tests:       164 passed  ← 67 mới từ N29
# Time:        ~2.5s (không cần DB)
```

| File | Tests | Bao phủ |
|---|---|---|
| `stockHelper.test.js` | 57 | Moving avg, reservation, ledger, unit conversion |
| `concurrency.test.js` | 40 | Idempotency, Auto-PR dedup, validation, pagination, RBAC |
| `businessFlow.test.js` | 67 | State machines, anti-oversell, race condition, stocktaking |

---

## Tính năng Dashboard (N29)

### Manager / Admin
- **Row 1:** Tổng sản phẩm · Giá trị tồn · Sắp hết · Hết hàng
- **Row 2:** Tổng user · Nhập hôm nay · Xuất hôm nay · Thông báo chưa đọc
- **Row 3:** Phiếu cấp phát · Điều chuyển · PR mua hàng · Trả hàng nháp
- **Row 4 (N29):** Phiếu nhập chờ nhận · Phiếu xuất cần xử lý · PR chờ duyệt · PO chờ nhận

### Warehouse
- Scanner nhanh + Nhập/Xuất hôm nay + Điều chuyển chờ
- **N29:** Phiếu nhập chờ xác nhận · Phiếu xuất chưa xử lý (với ActionAlertCard)

---

## Báo cáo (N29)

| Tab | Mô tả | Roles |
|---|---|---|
| Hoạt động kho | Giao dịch theo ngày/tuần | W/M/A |
| Phân tích danh mục | Nhập/Xuất theo category | W/M/A |
| Nhân viên | Tiêu thụ theo user/phòng ban | M/A |
| Giá trị tồn kho | Cost report theo kho | M/A |
| Burn Rate | Dự báo hết hàng | W/M/A |
| Dead Stock | Hàng không luân chuyển | W/M/A |
| Lịch sử tồn kho | Snapshot hàng ngày | W/M/A |
| **Chi phí (N29)** | **Nhập/Xuất theo danh mục hoặc phòng ban** | **M/A** |



---

## ⚠️ Known Limitations & Design Decisions

### Rate Limiter (BE-06)
Hệ thống dùng **in-memory rate limiting** (`backend/src/middleware/rate-limiter.js`). Phù hợp cho single-instance deployment (Docker Compose đơn node).

**Giới hạn:** Nếu chạy multi-instance với PM2 cluster hoặc nhiều Docker replica, mỗi worker có counter riêng → user có thể bypass rate limit bằng cách gửi request luân phiên đến nhiều instance.

**Khi cần scale:** Chuyển sang Redis-based limiter:
```bash
npm install rate-limiter-flexible ioredis
# Xem comment trong rate-limiter.js: "Production multi-instance → nâng lên Redis"
```

### InventoryTransaction Header-Item (ARCH-02)
`stock_transactions` hiện là bảng đơn (header-only). Spec đầy đủ yêu cầu Header + Items riêng (InventoryTransactionItem). Breaking change — defer đến major version khi cần multi-item traceability per transaction.

### Form Validation (UX-04)
Form validation dùng hook `useFormValidation` (`frontend/src/hooks/useFormValidation.js`) — lightweight, không cần Yup/Zod. Phù hợp personal project theo nguyên lý YAGNI. Adopt dần khi refactor từng form.
