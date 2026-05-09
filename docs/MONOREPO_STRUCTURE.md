# QLVPP — Monorepo Structure (Clean Architecture)
# Version: 4.0.0 | Strategy: Clean Break (Option B)
# =====================================================================
# Chiến lược: KHÔNG giữ cấu trúc cũ. Viết lại theo Clean Architecture.
# Mọi business logic tách khỏi HTTP layer.
# =====================================================================

```
qlvpp/                                        ← Monorepo root
│
├── apps/
│   │
│   ├── api/                                  ← Backend (Node.js 20 + Express)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── .env.example
│   │   ├── server.js                         ← Entry point: Express app setup, middleware, routes
│   │   └── src/
│   │       │
│   │       ├── controllers/                  ← Layer 1: HTTP adapter only
│   │       │   │   Trách nhiệm: parse req → gọi UseCase → format res
│   │       │   │   KHÔNG chứa business logic, KHÔNG gọi DB trực tiếp
│   │       │   ├── auth.controller.js
│   │       │   ├── product.controller.js
│   │       │   ├── category.controller.js
│   │       │   ├── warehouse.controller.js
│   │       │   ├── supplier.controller.js
│   │       │   ├── unit.controller.js
│   │       │   ├── lot.controller.js
│   │       │   ├── import-order.controller.js
│   │       │   ├── export-order.controller.js
│   │       │   ├── transfer.controller.js
│   │       │   ├── adjustment.controller.js
│   │       │   ├── requisition.controller.js
│   │       │   ├── purchase.controller.js
│   │       │   ├── return.controller.js
│   │       │   ├── stocktaking.controller.js
│   │       │   ├── report.controller.js
│   │       │   ├── notification.controller.js
│   │       │   ├── user.controller.js
│   │       │   ├── user-warehouse.controller.js
│   │       │   ├── warehouse-location.controller.js
│   │       │   ├── dashboard.controller.js
│   │       │   └── audit.controller.js
│   │       │
│   │       ├── use-cases/                    ← Layer 2: Application logic (một UseCase = một nghiệp vụ)
│   │       │   │   Trách nhiệm: orchestrate domain rules + repos
│   │       │   │   KHÔNG biết Express, KHÔNG biết MySQL trực tiếp
│   │       │   │
│   │       │   ├── auth/
│   │       │   │   ├── LoginUseCase.js
│   │       │   │   ├── LogoutUseCase.js
│   │       │   │   ├── RegisterUseCase.js
│   │       │   │   ├── ForgotPasswordUseCase.js
│   │       │   │   └── ResetPasswordUseCase.js
│   │       │   │
│   │       │   ├── inventory/
│   │       │   │   ├── ProcessInbound.js        ← Nhập kho (Import Order → Completed)
│   │       │   │   ├── ProcessOutbound.js       ← Xuất kho (Export Order → Completed)
│   │       │   │   ├── ProcessTransfer.js       ← Điều chuyển (kho A out → kho B in)
│   │       │   │   ├── ProcessAdjustment.js     ← Điều chỉnh kho (có reason + audit)
│   │       │   │   ├── ConfirmStocktaking.js    ← Xác nhận kiểm kê → tạo ADJUST transaction
│   │       │   │   └── ReserveStock.js          ← Giữ chỗ khi approve requisition
│   │       │   │
│   │       │   ├── purchase/
│   │       │   │   ├── CreatePurchaseRequest.js
│   │       │   │   ├── ApprovePurchaseRequest.js
│   │       │   │   ├── CreatePurchaseOrder.js
│   │       │   │   └── ApprovePurchaseOrder.js  ← PO approved → trigger Inbound
│   │       │   │
│   │       │   ├── requisition/
│   │       │   │   ├── CreateRequisition.js
│   │       │   │   ├── ApproveRequisition.js    ← Approve → reserved_quantity += qty
│   │       │   │   ├── RejectRequisition.js
│   │       │   │   └── CancelRequisition.js     ← Cancel → reserved_quantity -= qty
│   │       │   │
│   │       │   └── reporting/
│   │       │       ├── GetStockReport.js
│   │       │       ├── GetTransactionHistory.js
│   │       │       ├── GetCostReport.js
│   │       │       └── RunDailySnapshot.js      ← Cron: tạo stock_snapshot_daily
│   │       │
│   │       ├── domain/                         ← Layer 3: Core business rules (KHÔNG phụ thuộc bất kỳ lib)
│   │       │   │
│   │       │   ├── entities/
│   │       │   │   ├── Stock.js                ← available = stock_qty - reserved_quantity
│   │       │   │   ├── InventoryTransaction.js ← Validate type, quantity > 0
│   │       │   │   └── StockLedger.js          ← running_balance calculation
│   │       │   │
│   │       │   ├── rules/
│   │       │   │   ├── CostingEngine.js        ← Moving Average: (old_qty*old_price + in_qty*in_price) / (old_qty+in_qty)
│   │       │   │   ├── StockGuard.js           ← Anti-oversell: available >= qty check
│   │       │   │   └── StateMachine.js         ← DRAFT→PENDING→APPROVED→COMPLETED transitions
│   │       │   │
│   │       │   └── errors/
│   │       │       ├── InsufficientStockError.js
│   │       │       ├── InvalidStateTransitionError.js
│   │       │       ├── DuplicateTransactionError.js
│   │       │       ├── NotFoundError.js
│   │       │       ├── ValidationError.js
│   │       │       └── UnauthorizedError.js
│   │       │
│   │       ├── infrastructure/                 ← Layer 4: DB access, External services
│   │       │   │   Trách nhiệm: triển khai Repository interfaces
│   │       │   │   Chỉ layer này được import mysql2/promise
│   │       │   │
│   │       │   ├── repositories/
│   │       │   │   ├── StockRepository.js           ← warehouse_stock CRUD + locking
│   │       │   │   ├── TransactionRepository.js     ← stock_transactions INSERT + query
│   │       │   │   ├── LedgerRepository.js          ← stock_ledger INSERT + query  [MỚI]
│   │       │   │   ├── SnapshotRepository.js        ← stock_snapshot_daily  [MỚI]
│   │       │   │   ├── ProductRepository.js
│   │       │   │   ├── WarehouseRepository.js
│   │       │   │   ├── UserRepository.js
│   │       │   │   ├── RequisitionRepository.js
│   │       │   │   ├── PurchaseRepository.js
│   │       │   │   ├── ImportOrderRepository.js
│   │       │   │   ├── ExportOrderRepository.js
│   │       │   │   ├── TransferRepository.js
│   │       │   │   ├── ReturnRepository.js
│   │       │   │   ├── StocktakingRepository.js
│   │       │   │   └── NotificationRepository.js
│   │       │   │
│   │       │   └── services/
│   │       │       └── EmailService.js              ← nodemailer wrapper
│   │       │
│   │       └── shared/
│   │           ├── config/
│   │           │   └── db.js                        ← mysql2 pool (giữ nguyên, cải thiện)
│   │           │
│   │           ├── middleware/
│   │           │   ├── authenticate.js              ← Đổi tên từ auth.js (rõ nghĩa hơn)
│   │           │   ├── authorize.js                 ← RBAC: roles + warehouse access check
│   │           │   ├── idempotency.js               ← Chống double submit
│   │           │   ├── csrf.js
│   │           │   ├── rateLimiter.js
│   │           │   └── globalErrorHandler.js        ← [MỚI] Map domain errors → API Error Contract
│   │           │
│   │           ├── dto/                             ← [MỚI] Zod validation schemas
│   │           │   ├── auth.dto.js
│   │           │   ├── product.dto.js
│   │           │   ├── inventory.dto.js
│   │           │   ├── purchase.dto.js
│   │           │   └── requisition.dto.js
│   │           │
│   │           └── utils/
│   │               ├── stockHelper.js               ← Moving Average (đã có, giữ nguyên)
│   │               ├── auditLogger.js               ← (đã có, giữ nguyên)
│   │               └── paginate.js                  ← [MỚI] Unified pagination helper (fix GAP-06)
│   │
│   └── web/                                  ← Frontend (React 18 + Vite)
│       ├── Dockerfile
│       ├── nginx.conf
│       ├── index.html
│       ├── vite.config.js
│       ├── package.json
│       └── src/
│           ├── main.jsx
│           ├── App.jsx
│           ├── App.css
│           ├── index.css
│           │
│           ├── app/
│           │   └── routes.jsx                       ← Route definitions (tách từ App.jsx)
│           │
│           ├── features/                            ← Nhóm theo nghiệp vụ
│           │   ├── auth/
│           │   │   ├── pages/
│           │   │   │   ├── Login.jsx
│           │   │   │   ├── Register.jsx
│           │   │   │   ├── ForgotPassword.jsx
│           │   │   │   └── ResetPassword.jsx
│           │   │   └── hooks/
│           │   │       └── useAuth.js
│           │   │
│           │   ├── inventory/
│           │   │   └── pages/
│           │   │       ├── ImportOrders.jsx
│           │   │       ├── ExportOrders.jsx
│           │   │       ├── StockTransfer.jsx
│           │   │       ├── StockAdjustment.jsx
│           │   │       └── Stocktaking.jsx
│           │   │
│           │   ├── products/
│           │   │   └── pages/
│           │   │       ├── Products.jsx
│           │   │       ├── Categories.jsx
│           │   │       ├── UnitManagement.jsx
│           │   │       └── LotManagement.jsx
│           │   │
│           │   ├── procurement/
│           │   │   └── pages/
│           │   │       ├── Purchases.jsx
│           │   │       ├── Requisitions.jsx
│           │   │       └── RequisitionApproval.jsx
│           │   │
│           │   ├── suppliers/
│           │   │   └── pages/
│           │   │       ├── Suppliers.jsx
│           │   │       └── Returns.jsx
│           │   │
│           │   ├── warehouses/
│           │   │   └── pages/
│           │   │       ├── Warehouses.jsx
│           │   │       ├── WarehouseLocations.jsx
│           │   │       └── UserWarehouseAccess.jsx
│           │   │
│           │   ├── reports/
│           │   │   └── pages/
│           │   │       └── Reports.jsx
│           │   │
│           │   └── admin/
│           │       └── pages/
│           │           ├── UserManagement.jsx
│           │           ├── AuditLog.jsx
│           │           └── Notifications.jsx
│           │
│           ├── components/                          ← Shared UI components (giữ nguyên)
│           │   ├── auth/
│           │   │   └── ProtectedRoute.jsx
│           │   └── common/
│           │       ├── AlertMessage.jsx
│           │       ├── ConfirmModal.jsx
│           │       ├── EmptyState.jsx
│           │       ├── ErrorBoundary.jsx
│           │       ├── Footer.jsx
│           │       ├── Header.jsx
│           │       ├── Icons.jsx
│           │       ├── LoadingSpinner.jsx
│           │       ├── Modal.jsx
│           │       ├── NotificationBell.jsx
│           │       ├── Sidebar.jsx
│           │       ├── SkeletonRow.jsx
│           │       ├── ToastNotification.jsx
│           │       └── TopBar.jsx
│           │
│           ├── contexts/
│           │   └── AuthContext.jsx                  ← (giữ nguyên)
│           │
│           ├── hooks/
│           │   ├── useAutoAlert.js                  ← (giữ nguyên)
│           │   ├── useFormValidation.js             ← (giữ nguyên)
│           │   └── usePagination.js                 ← [MỚI] Unified pagination hook (fix GAP-06)
│           │
│           └── services/
│               └── api.js                           ← axios instance (giữ nguyên)
│
├── packages/
│   │
│   ├── db/                                   ← Database artifacts
│   │   ├── schema.sql                        ← [MỚI] Golden schema v4.0.0 (39 bảng, clean, no migrations)
│   │   └── seed/
│   │       └── seed.sql                      ← Seed data tách riêng khỏi schema
│   │
│   └── contracts/                            ← Shared types (API contract)
│       └── api-types.js                      ← Error codes, Response envelope
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CLAUDE.md
│   ├── API.md
│   ├── DEPLOY.md
│   ├── inventory-rules.md                    ← [MỚI] Domain rules reference
│   └── testing.md                            ← [MỚI] Test strategy
│
├── docker-compose.yml
└── .env.example
```

---

## Ánh xạ (Mapping): Cũ → Mới

| Cũ | Mới | Lý do |
|---|---|---|
| `backend/` | `apps/api/` | Monorepo convention |
| `frontend/` | `apps/web/` | Monorepo convention |
| `database/` | `packages/db/` | Shared package |
| `backend/src/routes/*.js` | `apps/api/src/controllers/` + `use-cases/` | Clean Architecture split |
| `database/init.sql` | `packages/db/schema.sql` | Clean schema, no migration cruft |
| `database/migration_p0→p14` | **Không giữ** | Tích hợp vào schema.sql v4.0.0 |

## Các file MỚI quan trọng

| File | Lý do tồn tại |
|---|---|
| `domain/errors/*.js` | Domain errors → globalErrorHandler map → API contract |
| `shared/middleware/globalErrorHandler.js` | Centralized error → JSON response |
| `shared/dto/*.js` | Zod validation (fix GAP-05) |
| `shared/utils/paginate.js` | Thống nhất 1-based pagination (fix GAP-06) |
| `infrastructure/repositories/LedgerRepository.js` | stock_ledger (fix GAP-02) |
| `infrastructure/repositories/SnapshotRepository.js` | stock_snapshot_daily (fix GAP-03) |
| `packages/contracts/api-types.js` | Error codes enum, Response envelope |

## GAP Resolution Summary

| GAP | Giải pháp |
|---|---|
| GAP-01 (Kiến trúc) | Controller → UseCase → Domain → Repository (Clean Architecture) |
| GAP-02 (StockLedger) | Bảng `stock_ledger` trong schema.sql + LedgerRepository |
| GAP-03 (SnapshotDaily) | Bảng `stock_snapshot_daily` + RunDailySnapshot UseCase |
| GAP-04 (Kiểu dữ liệu) | Giữ nguyên INT (Option B đã phê duyệt) |
| GAP-05 (DTO) | Zod DTOs trong `shared/dto/` |
| GAP-06 (Pagination) | `paginate.js` util + `usePagination.js` hook, chuẩn 1-based |
| GAP-07 (Redis) | Không áp dụng (Option B đã phê duyệt) |