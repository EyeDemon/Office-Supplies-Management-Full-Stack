# API.md — Tài liệu API Đầy Đủ (QLVPP)

> **Version:** N30 · **Base URL:** `http://localhost:8080/api`  
> **Auth:** Session Cookie (đăng nhập qua `POST /auth/login`)  
> **Header bắt buộc cho mọi request thay đổi dữ liệu:** `X-CSRF-Token: <token>`  
> **Header idempotency (POST tạo tài nguyên):** `Idempotency-Key: <uuid-v4>`

---

## Mục lục

1. [Error Contract](#error-contract)
2. [CSRF Token](#csrf-token)
3. [Health Check](#health-check)
4. [Auth](#auth)
5. [Users](#users)
6. [Categories](#categories)
7. [Suppliers](#suppliers)
8. [Products](#products)
9. [Warehouses](#warehouses)
10. [Warehouse Locations](#warehouse-locations)
11. [Units & Conversions](#units--conversions)
12. [Lots](#lots)
13. [Import Orders (Phiếu nhập)](#import-orders)
14. [Export Orders (Phiếu xuất)](#export-orders)
15. [Requisitions (Yêu cầu cấp phát)](#requisitions)
16. [Transfers (Điều chuyển kho)](#transfers)
17. [Stocktaking (Kiểm kê)](#stocktaking)
18. [Returns (Trả hàng)](#returns)
19. [Adjustments (Điều chỉnh tồn kho)](#adjustments)
20. [Purchases — PR & PO](#purchases--pr--po)
21. [Stock Ledger (Sổ cái)](#stock-ledger)
22. [Dashboard](#dashboard)
23. [Reports (Báo cáo)](#reports)
24. [Notifications](#notifications)
25. [Audit Log](#audit-log)
26. [User-Warehouse Access](#user-warehouse-access)

---

## Error Contract

Mọi lỗi từ API đều trả về định dạng chuẩn:

```json
{
  "success": false,
  "message": "Mô tả lỗi",
  "errors": ["chi tiết lỗi 1"]
}
```

| HTTP Code | Ý nghĩa |
|-----------|---------|
| 400 | Validation Error / Bad Request |
| 401 | Chưa đăng nhập |
| 403 | Không đủ quyền |
| 404 | Không tìm thấy |
| 409 | Conflict (trùng lặp, sai trạng thái) |
| 422 | Tồn kho không đủ (INSUFFICIENT_STOCK) |
| 429 | Rate limit |
| 500 | Lỗi server |

---

## CSRF Token

> Bắt buộc lấy trước khi gọi bất kỳ POST/PUT/DELETE nào.  
> Frontend lưu vào memory, gửi qua header `X-CSRF-Token`.

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/csrf-token` | — | Lấy CSRF token cho session hiện tại |

**Response:** `{ "token": "abc123..." }`

---

## Health Check

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/health` | — | Trạng thái hệ thống (DB, uptime, memory) |

```json
{ "status": "UP", "database": "connected", "uptime": 3600, "memory": "128MB", "version": "1.0.0" }
```

---

## Auth

| Method | Endpoint | Body | Rate Limit | Mô tả |
|--------|----------|------|-----------|-------|
| GET | `/auth/me` | — | — | Thông tin user đang đăng nhập |
| GET | `/auth/verify-reset-token` | `?token=` | — | Kiểm tra token reset còn hợp lệ không |
| POST | `/auth/register` | `{username, email, fullName, password, confirmPassword}` | ✅ | Đăng ký |
| POST | `/auth/login` | `{username, password}` | ✅ | Đăng nhập → set session cookie |
| POST | `/auth/logout` | — | — | Đăng xuất, xóa session |
| POST | `/auth/change-password` | `{currentPassword, newPassword, confirmPassword}` | — | Đổi mật khẩu |
| POST | `/auth/forgot-password` | `{email}` | ✅ | Gửi email reset password |
| POST | `/auth/reset-password` | `{token, newPassword}` | — | Đặt lại mật khẩu bằng token |

---

## Users

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/users/departments` | — | Login | Danh sách phòng ban |
| GET | `/users` | `?page=0&size=20&search=&role=&department=` | Admin | Danh sách users |
| GET | `/users/deleted` | — | Admin | Users đã xóa mềm |
| GET | `/users/:id` | — | Self\|Admin | Chi tiết user |
| POST | `/users` | `{username, email, fullName, password, role, department}` | Admin | Tạo user |
| PUT | `/users/:id` | `{email, fullName, role, department, active}` | Self\|Admin | Cập nhật thông tin |
| PUT | `/users/:id/password` | `{currentPassword, newPassword}` | Self | Đổi mật khẩu |
| DELETE | `/users/:id` | — | Admin | Soft-delete user |
| POST | `/users/:id/restore` | — | Admin | Khôi phục user đã xóa |

**Roles hợp lệ:** `ADMIN` · `MANAGER` · `WAREHOUSE` · `USER`

---

## Categories

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/categories` | `?search=` | Login | Danh sách danh mục (kèm số SP) |
| GET | `/categories/export` | — | MA | Export CSV |
| GET | `/categories/:id` | — | Login | Chi tiết danh mục |
| POST | `/categories` | `{name, description}` | MA | Tạo danh mục |
| PUT | `/categories/:id` | `{name, description}` | MA | Cập nhật |
| DELETE | `/categories/:id` | — | MA | Xóa (chỉ khi không có sản phẩm) |

---

## Suppliers

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/suppliers` | `?page=0&size=50&search=&active=true` | MA | Danh sách nhà cung cấp |
| GET | `/suppliers/all` | — | Login | Tất cả NCC (cho dropdown) |
| GET | `/suppliers/export` | — | MA | Export CSV |
| GET | `/suppliers/import-template` | — | MA | Tải template CSV |
| GET | `/suppliers/:id` | — | MA | Chi tiết NCC |
| POST | `/suppliers` | `{name, code, phone, email, address, contactPerson, taxCode}` | MA | Tạo NCC |
| POST | `/suppliers/import` | `multipart: file (CSV)` | MA | Import NCC từ CSV |
| PUT | `/suppliers/:id` | `{name, phone, email, address, contactPerson, active}` | MA | Cập nhật |
| DELETE | `/suppliers/:id` | — | Admin | Soft-delete |

---

## Products

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/products` | `?page=0&size=20&search=&categoryId=&lowStock=&warehouseId=` | Login | Danh sách sản phẩm |
| GET | `/products/stats` | — | Login | Thống kê nhanh (tổng SP, tồn thấp, giá trị) |
| GET | `/products/export` | `?search=&categoryId=` | MA | Export CSV |
| GET | `/products/deleted` | — | Admin | Sản phẩm đã xóa mềm |
| GET | `/products/transactions/recent` | `?limit=10` | Login | Giao dịch gần đây nhất |
| GET | `/products/:id` | — | Login | Chi tiết + tồn từng kho |
| GET | `/products/:id/transactions` | `?page=0&size=20&type=` | Login | Lịch sử giao dịch |
| POST | `/products` | `{sku, name, categoryId, unit, price, minStockQty, reorderPoint, description}` | MA | Tạo sản phẩm |
| PUT | `/products/:id` | `{name, categoryId, unit, price, minStockQty, reorderPoint, active}` | MA | Cập nhật |
| DELETE | `/products/:id` | — | Admin | Soft-delete |
| POST | `/products/:id/restore` | — | Admin | Khôi phục |
| POST | `/products/:id/stock-in` | `{quantity, warehouseId, note, unitPrice}` | MA | Nhập tồn nhanh |
| POST | `/products/:id/stock-out` | `{quantity, warehouseId, note}` | MA | Xuất tồn nhanh |
| POST | `/products/:id/stock-adjust` | `{newQuantity, reason, warehouseId}` | Admin | Điều chỉnh tồn trực tiếp |

**Response fields:** `id, sku, name, categoryId, categoryName, unit, price, avgUnitPrice, stockQty, reservedQty, availableQty, minStockQty, reorderPoint, active, lowStock, description`

---

## Warehouses

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/warehouses` | `?warehouseId=` | Login | Kho user được phép truy cập |
| GET | `/warehouses/all` | — | Login | Tất cả kho (cho dropdown) |
| GET | `/warehouses/:id` | — | Login | Chi tiết kho |
| GET | `/warehouses/:id/stock` | `?page=0&size=20&search=&categoryId=` | Login | Tồn kho chi tiết của kho |
| POST | `/warehouses` | `{name, code, address, description}` | MA | Tạo kho |
| POST | `/warehouses/import` | `multipart: file (CSV)` | MA | Import kho từ CSV |
| PUT | `/warehouses/:id` | `{name, address, description, active}` | MA | Cập nhật |
| PATCH | `/warehouses/:id/toggle` | — | MA | Bật/tắt trạng thái kho |
| DELETE | `/warehouses/:id` | — | Admin | Xóa kho (chỉ khi không còn tồn kho) |

---

## Warehouse Locations

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/warehouse-locations` | `?warehouseId=&active=true` | WA | Danh sách vị trí trong kho |
| GET | `/warehouse-locations/:id` | — | WA | Chi tiết vị trí |
| POST | `/warehouse-locations` | `{warehouseId, code, name, description, capacity}` | MA | Tạo vị trí |
| PUT | `/warehouse-locations/:id` | `{name, description, capacity, isActive}` | MA | Cập nhật |
| DELETE | `/warehouse-locations/:id` | — | MA | Vô hiệu hóa (soft) |

---

## Units & Conversions

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/units` | — | Login | Danh sách đơn vị |
| GET | `/units/:id` | — | Login | Chi tiết đơn vị |
| GET | `/units/conversions/all` | — | Login | Tất cả quy đổi |
| POST | `/units` | `{name, symbol, description}` | MA | Tạo đơn vị |
| PUT | `/units/:id` | `{name, symbol, description}` | MA | Cập nhật |
| DELETE | `/units/:id` | — | Admin | Xóa |
| POST | `/units/conversions` | `{fromUnitId, toUnitId, factor}` | MA | Tạo quy đổi (`1 from = factor to`) |
| PUT | `/units/conversions/:id` | `{factor}` | MA | Cập nhật hệ số |
| DELETE | `/units/conversions/:id` | — | Admin | Xóa quy đổi |
| POST | `/units/convert` | `{quantity, fromUnitId, toUnitId}` | WA | Tính quy đổi số lượng |

---

## Lots

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/lots` | `?page=0&size=20&search=&productId=&expiringSoon=&expired=` | Login | Danh sách lô hàng |
| GET | `/lots/expiring` | `?days=30` | Login | Lô sắp hết hạn trong N ngày |
| GET | `/lots/expired` | — | MA | Lô đã hết hạn |
| GET | `/lots/by-product/:productId` | — | Login | Lô theo sản phẩm |
| GET | `/lots/:id` | — | Login | Chi tiết lô |
| POST | `/lots` | `{productId, lotNumber, manufactureDate, expiryDate, quantity, warehouseId}` | MA | Tạo lô |
| PUT | `/lots/:id` | `{lotNumber, manufactureDate, expiryDate}` | MA | Cập nhật |
| DELETE | `/lots/:id` | — | Admin | Xóa (chỉ khi số lượng = 0) |

---

## Import Orders

> Phiếu nhập kho · Mã: `PN-YYYYMM-NNNN`  
> **State:** `DRAFT → SUBMITTED → APPROVED → COMPLETED / CANCELLED`

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/orders` | `?page=0&size=20&status=&warehouseId=&search=` | WA | Danh sách phiếu nhập |
| GET | `/orders/export` | `?status=&warehouseId=` | WA | Export CSV |
| GET | `/orders/:id` | — | WA | Chi tiết + items |
| POST | `/orders` | `{supplierId, warehouseId, expectedDate, note, items:[{productId,quantity,unitPrice}]}` | WA | Tạo DRAFT · *Idempotency-Key* |
| PUT | `/orders/:id` | `{supplierId, expectedDate, note, items}` | WA | Sửa (chỉ DRAFT) |
| POST | `/orders/:id/submit` | `{note?}` | WA | Gửi duyệt → SUBMITTED |
| POST | `/orders/:id/approve` | `{note?}` | MA | Duyệt → APPROVED |
| POST | `/orders/:id/confirm` | `{note?}` | WA | Kho xác nhận chuẩn bị nhận |
| POST | `/orders/:id/complete` | `{actualItems?:[{id,actualQty}], note?}` | WA | Hoàn tất → nhập kho + tính avg_price · **NOWAIT lock** |
| POST | `/orders/:id/reject` | `{note}` | MA | Từ chối → DRAFT |
| POST | `/orders/:id/cancel` | `{note}` | WA | Hủy |

---

## Export Orders

> Phiếu xuất kho · Mã: `XK-YYYYMM-NNNN`  
> **State:** `DRAFT → SUBMITTED → APPROVED → COMPLETED / CANCELLED`

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/export-orders` | `?page=1&limit=20&status=&warehouseId=` | WA | Danh sách phiếu xuất |
| GET | `/export-orders/export/csv` | — | WA | Export CSV |
| GET | `/export-orders/:id` | — | WA | Chi tiết + items |
| POST | `/export-orders` | `{warehouseId, note, items:[{productId,quantity}]}` | WA | Tạo DRAFT · *Idempotency-Key* |
| PUT | `/export-orders/:id` | `{warehouseId, note, items}` | WA | Sửa (chỉ DRAFT) |
| POST | `/export-orders/:id/submit` | `{note?}` | WA | Gửi duyệt |
| POST | `/export-orders/:id/approve` | `{note?}` | WA | Duyệt → `reserved_quantity += qty` |
| POST | `/export-orders/:id/reject` | `{note}` | WA | Từ chối → DRAFT |
| POST | `/export-orders/:id/complete` | `{note?}` | WA | Hoàn tất → trừ qty & reserved · **NOWAIT lock** |
| DELETE | `/export-orders/:id/cancel` | — | WA | Hủy → giải phóng reserved |

---

## Requisitions

> Yêu cầu cấp phát · Mã: `YC-YYYYMM-NNNN`  
> **State:** `DRAFT → PENDING → APPROVED → COMPLETED / CANCELLED`

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/requisitions` | `?page=0&size=20&status=&department=` | Login | Danh sách (USER thấy của mình) |
| GET | `/requisitions/export` | `?status=&department=` | MA | Export CSV |
| GET | `/requisitions/:id` | — | Login | Chi tiết |
| POST | `/requisitions` | `{note?, items:[{productId,quantity,note?}]}` | Login | Tạo yêu cầu · *Idempotency-Key* |
| PUT | `/requisitions/:id` | `{note, items}` | Login | Sửa (chỉ DRAFT) |
| POST | `/requisitions/:id/cancel` | — | Login | Hủy → giải phóng reserved nếu đã approve |
| POST | `/requisitions/:id/approve` | `{note?}` | MA | Duyệt → `reserved_quantity += qty` · **NOWAIT lock** |
| POST | `/requisitions/:id/reject` | `{note}` | MA | Từ chối |
| POST | `/requisitions/:id/warehouse-confirm` | `{note?}` | WA | Kho xác nhận xuất → trừ qty & reserved |
| POST | `/requisitions/bulk-approve` | `{ids:[1,2,3], note?}` | MA | Duyệt hàng loạt |
| POST | `/requisitions/bulk-reject` | `{ids:[1,2,3], note}` | MA | Từ chối hàng loạt |

---

## Transfers

> Điều chuyển kho · Mã: `DC-YYYYMM-NNNN`  
> **State:** `DRAFT → SUBMITTED → APPROVED → DISPATCHED → COMPLETED / CANCELLED`

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/transfers` | `?page=1&limit=20&status=&fromWarehouseId=&toWarehouseId=` | WA | Danh sách phiếu điều chuyển |
| GET | `/transfers/export/csv` | — | WA | Export CSV |
| GET | `/transfers/:id` | — | WA | Chi tiết + items |
| POST | `/transfers` | `{fromWarehouseId, toWarehouseId, note?, items:[{productId,quantity}]}` | WA | Tạo · *Idempotency-Key* |
| PUT | `/transfers/:id` | `{note, items}` | WA | Sửa (chỉ DRAFT) |
| POST | `/transfers/:id/submit` | — | WA | Gửi duyệt |
| POST | `/transfers/:id/approve` | `{note?}` | MA | Duyệt |
| POST | `/transfers/:id/reject` | `{note}` | MA | Từ chối → DRAFT |
| POST | `/transfers/:id/dispatch` | `{note?}` | WA | Xuất kho nguồn → `fromWarehouse.qty -= qty` · **NOWAIT lock** |
| POST | `/transfers/:id/complete` | `{note?}` | WA | Nhập kho đích → `toWarehouse.qty += qty` + tính avg_price |
| DELETE | `/transfers/:id/cancel` | — | WA | Hủy → rollback nếu đã dispatch |

---

## Stocktaking

> Kiểm kê · Mã: `KK-YYYYMM-NNNN`  
> **State:** `IN_PROGRESS → COMPLETED / CANCELLED`

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/stocktaking` | `?page=1&limit=20&warehouseId=` | WA | Danh sách đợt kiểm kê |
| GET | `/stocktaking/:id` | — | WA | Chi tiết + items (actual vs system qty) |
| POST | `/stocktaking` | `{warehouseId, note?}` | WA | Tạo đợt (snapshot tồn kho hiện tại) · *Idempotency-Key* |
| PUT | `/stocktaking/:id/items` | `{items:[{id, actualQty, note?}]}` | WA | Cập nhật số lượng thực tế (batch) |
| POST | `/stocktaking/:id/complete` | `{note?}` | WA | Hoàn tất → tạo ADJUSTMENT cho chênh lệch · *Idempotency-Key* |
| DELETE | `/stocktaking/:id/cancel` | — | WA | Hủy đợt kiểm kê |

---

## Returns

> Trả hàng · Mã: `RTN-YYYYMM-NNNN`  
> **`type`:** `CUSTOMER_RETURN` (nhập kho) | `SUPPLIER_RETURN` (xuất kho)

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/returns` | `?page=1&limit=20&type=&warehouseId=` | WA | Danh sách phiếu trả |
| GET | `/returns/export/csv` | — | WA | Export CSV |
| GET | `/returns/:id` | — | WA | Chi tiết |
| POST | `/returns` | `{type, warehouseId, supplierId?, referenceOrderId?, note, items:[{productId,quantity,reason}]}` | WA | Tạo phiếu · *Idempotency-Key* |
| PUT | `/returns/:id` | `{note, items}` | WA | Sửa (chỉ DRAFT) |
| POST | `/returns/:id/complete` | `{note?}` | WA | Hoàn tất → cập nhật tồn · **NOWAIT lock** |
| DELETE | `/returns/:id/cancel` | — | WA | Hủy |

---

## Adjustments

> Điều chỉnh tồn kho bất thường — Chỉ Admin, bắt buộc ghi lý do.

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/adjustments` | `?page=0&size=20&productId=&warehouseId=&dateFrom=&dateTo=` | Admin | Danh sách điều chỉnh |
| GET | `/adjustments/export` | — | Admin | Export CSV |
| POST | `/adjustments` | `{productId, quantity, warehouseId?, note}` | Admin | Tạo điều chỉnh · **`note` bắt buộc** · *Idempotency-Key* |

> ⚠️ `quantity` = số lượng **tuyệt đối mới** (không phải delta). Hệ thống tự tính chênh lệch.

---

## Purchases — PR & PO

> **PR State:** `DRAFT → PENDING → APPROVED → PO_CREATED / REJECTED / CANCELLED`  
> **PO State:** `DRAFT → CONFIRMED → RECEIVED / CANCELLED`

### Purchase Requests

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/purchases/requests` | `?page=0&size=20&status=&productId=` | WA | Danh sách PR |
| GET | `/purchases/requests/suggest` | `?productId=` | WA | Gợi ý PR từ tồn thấp / reorder point |
| GET | `/purchases/requests/:id` | — | WA | Chi tiết PR |
| POST | `/purchases/requests` | `{productId, quantity, supplierId?, note, estimatedPrice?}` | MA | Tạo PR · *Idempotency-Key* |
| POST | `/purchases/requests/:id/approve` | `{note?}` | MA | Duyệt → tự động tạo PO Draft |
| POST | `/purchases/requests/:id/reject` | `{note}` | MA | Từ chối |
| DELETE | `/purchases/requests/:id/cancel` | — | MA | Hủy |

### Purchase Orders

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/purchases/orders` | `?page=0&size=20&status=&supplierId=` | WA | Danh sách PO |
| GET | `/purchases/orders/export/csv` | — | MA | Export CSV |
| GET | `/purchases/orders/:id` | — | WA | Chi tiết PO + items |
| POST | `/purchases/orders` | `{supplierId, warehouseId, expectedDate, items:[{productId,quantity,unitPrice}], note?}` | MA | Tạo PO · *Idempotency-Key* |
| POST | `/purchases/orders/:id/confirm` | `{note?}` | MA | Xác nhận → CONFIRMED |
| POST | `/purchases/orders/:id/receive` | `{warehouseId, items:[{productId,receivedQty,unitPrice}], note?}` | WA | Nhận hàng → nhập kho |
| DELETE | `/purchases/orders/:id/cancel` | — | MA | Hủy |

### Auto-PR

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/purchases/auto-pr/check` | — | MA | Kiểm tra SP cần tái đặt (`stockQty <= reorderPoint`) |
| POST | `/purchases/auto-pr/generate` | `{productIds:[1,2,3]}` | MA | Tự động tạo PR · *Idempotency-Key* |

### Price History

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/purchases/price-history` | `?productId=&supplierId=&dateFrom=&dateTo=` | WA | Lịch sử giá nhập |
| GET | `/purchases/price-history/product/:id` | — | WA | Lịch sử giá theo sản phẩm |
| POST | `/purchases/price-history` | `{productId, supplierId, unitPrice, effectiveDate, note?}` | MA | Ghi nhận giá mới |

---

## Stock Ledger

> Sổ cái tồn kho — Audit tuyệt đối. Chỉ đọc (không có POST/PUT/DELETE).

| Method | Endpoint | Query | Roles | Mô tả |
|--------|----------|-------|-------|-------|
| GET | `/stock-ledger` | `?page=0&size=50&warehouseId=&productId=&transactionType=&referenceType=&referenceId=&dateFrom=&dateTo=` | WA | Danh sách bút toán |
| GET | `/stock-ledger/summary` | `?warehouseId=&productId=&dateFrom=&dateTo=` | WA | Tóm tắt nhập/xuất/tồn theo kỳ |

**`transactionType` hợp lệ:** `INBOUND` · `OUTBOUND` · `ADJUSTMENT` · `TRANSFER_IN` · `TRANSFER_OUT` · `RETURN_IN` · `RETURN_OUT`

**Response mẫu:**
```json
{
  "id": 1001,
  "productId": 5, "productName": "Bút bi xanh",
  "warehouseId": 1, "warehouseName": "Kho trung tâm",
  "transactionType": "INBOUND",
  "quantityBefore": 100, "quantityChange": 50, "quantityAfter": 150,
  "unitCostBefore": 2000, "unitCostAfter": 2100,
  "referenceType": "IMPORT_ORDER", "referenceId": 42, "referenceCode": "PN-202604-0042",
  "note": "Nhập hàng tháng 4",
  "createdByName": "Nguyễn Văn A",
  "createdAt": "2026-04-28T09:00:00.000Z"
}
```

---

## Dashboard

| Method | Endpoint | Query | Roles | Mô tả |
|--------|----------|-------|-------|-------|
| GET | `/dashboard/stats` | `?warehouseId=` | Login | KPI tổng quan (khác nhau theo role) |
| GET | `/dashboard/weekly` | — | Login | Hoạt động 7 ngày gần nhất |
| GET | `/dashboard/stock-activity` | `?days=30&warehouseId=` | WA | Nhập/xuất theo ngày |
| GET | `/dashboard/stock-activity/export` | — | WA | Export CSV |
| GET | `/dashboard/by-category` | `?warehouseId=` | WA | Tồn kho theo danh mục |
| GET | `/dashboard/by-category/export` | — | WA | Export CSV |
| GET | `/dashboard/top-products` | `?type=IMPORT\|EXPORT&days=30&limit=5` | WA | Top sản phẩm nhập/xuất |
| GET | `/dashboard/top-products/export` | — | WA | Export CSV |
| GET | `/dashboard/financial` | `?dateFrom=&dateTo=&grouping=category\|department` | WA | Báo cáo tài chính theo kỳ |
| GET | `/dashboard/burn-rate` | `?days=30&categoryId=` | WA | Tốc độ tiêu hao hàng hóa |
| GET | `/dashboard/burn-rate/export` | — | WA | Export CSV |
| GET | `/dashboard/dead-stock` | `?days=90&warehouseId=` | WA | Hàng tồn không xuất trong N ngày |
| GET | `/dashboard/dead-stock/export` | — | WA | Export CSV |

**`GET /dashboard/stats` — Fields theo role:**

| Field | ADMIN/MANAGER | WAREHOUSE | USER |
|-------|:---:|:---:|:---:|
| `totalProducts` | ✅ | ✅ | ✅ |
| `totalStockValue` | ✅ | ✅ | — |
| `lowStockCount` | ✅ | ✅ | — |
| `pendingRequisitions` | ✅ | ✅ | ✅ (của mình) |
| `approvedImportOrders` | ✅ | ✅ | — |
| `draftExportOrders` | ✅ | ✅ | — |
| `pendingPurchaseRequests` | ✅ | — | — |
| `confirmedPurchaseOrders` | ✅ | — | — |

---

## Reports

| Method | Endpoint | Query | Roles | Mô tả |
|--------|----------|-------|-------|-------|
| GET | `/reports/stock-activity` | `?days=30&warehouseId=` | WA | Nhập/xuất theo ngày |
| GET | `/reports/stock-activity/export` | — | WA | Export CSV |
| GET | `/reports/by-category` | `?warehouseId=` | WA | Tồn kho theo danh mục |
| GET | `/reports/by-category/export` | — | WA | Export CSV |
| GET | `/reports/top-products` | `?type=IMPORT\|EXPORT&days=30&limit=5` | WA | Top sản phẩm |
| GET | `/reports/top-products/export` | — | WA | Export CSV |
| GET | `/reports/financial` | `?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&grouping=category\|department` | WA | Chi phí nhập/xuất theo kỳ |
| GET | `/reports/burn-rate` | `?days=30&categoryId=` | WA | Tốc độ tiêu hao |
| GET | `/reports/burn-rate/export` | — | WA | Export CSV |
| GET | `/reports/dead-stock` | `?days=90&warehouseId=` | WA | Hàng tồn lâu không xuất |
| GET | `/reports/dead-stock/export` | — | WA | Export CSV |
| GET | `/reports/stock-history` | `?dateFrom=&dateTo=&productId=&warehouseId=&page=0&size=50` | WA | Lịch sử tồn theo ngày (StockSnapshot) |
| GET | `/reports/stock-history/export` | — | WA | Export CSV |

---

## Notifications

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/notifications` | `?page=1&limit=20&unreadOnly=true\|false` | Login | Danh sách thông báo |
| GET | `/notifications/unread-count` | — | Login | Số thông báo chưa đọc (cho badge) |
| PUT | `/notifications/:id/read` | — | Login | Đánh dấu đã đọc |
| PUT | `/notifications/read-all` | — | Login | Đánh dấu tất cả đã đọc |
| DELETE | `/notifications/clear-read` | — | MA | Xóa thông báo đã đọc > 30 ngày |
| POST | `/notifications/sync` | — | MA | Đồng bộ thông báo từ các module (manual trigger) |

**Notification types:** `LOW_STOCK` · `APPROVAL_REQUIRED` · `TRANSACTION_COMPLETED` · `SYSTEM`

---

## Audit Log

| Method | Endpoint | Query | Roles | Mô tả |
|--------|----------|-------|-------|-------|
| GET | `/audit/logins` | `?page=0&size=20&userId=&dateFrom=&dateTo=` | Admin | Lịch sử đăng nhập |
| GET | `/audit/logins/suspicious` | `?threshold=5` | Admin | Đăng nhập đáng ngờ (failed > threshold) |
| GET | `/audit/logins/export` | — | Admin | Export CSV |
| GET | `/audit/general` | `?page=0&size=20&action=&userId=&dateFrom=&dateTo=` | Admin | Audit log chung |
| GET | `/audit/general/entity/:type/:id` | — | Admin | Audit log của một entity cụ thể |
| GET | `/audit/general/export` | — | Admin | Export CSV |

**Actions được ghi log:** `APPROVE` · `REJECT` · `CANCEL` · `DELETE` · `RESTORE` · `ADJUST` · `COMPLETE` · `TRANSFER`

---

## User-Warehouse Access

| Method | Endpoint | Query / Body | Roles | Mô tả |
|--------|----------|-------------|-------|-------|
| GET | `/user-warehouses/my` | — | Login | Kho tôi được phép truy cập |
| GET | `/user-warehouses/:userId` | — | Admin | Kho user được phân quyền |
| POST | `/user-warehouses/:userId` | `{warehouseId}` | Admin | Thêm quyền truy cập kho |
| POST | `/user-warehouses/:userId/bulk` | `{warehouseIds:[1,2,3]}` | Admin | Gán nhiều kho (thay thế toàn bộ) |
| DELETE | `/user-warehouses/:userId/:warehouseId` | — | Admin | Thu hồi quyền kho |

---

## Legend

| Ký hiệu | Nghĩa |
|---------|-------|
| **MA** | MANAGER + ADMIN (`requireManagerOrAdmin`) |
| **WA** | WAREHOUSE + MANAGER + ADMIN (`requireWarehouseOrAdmin`) |
| **Login** | Bất kỳ role đã đăng nhập (`requireLogin`) |
| **Admin** | Chỉ ADMIN (`requireAdmin`) |
| **Self\|Admin** | Chủ tài khoản hoặc ADMIN (`requireSelfOrAdmin`) |
| *Idempotency-Key* | Header `Idempotency-Key: <uuid-v4>` bắt buộc |
| **NOWAIT lock** | `SELECT ... FOR UPDATE NOWAIT` — trả lỗi ngay khi xung đột |

---

## State Machines

```
Import Order:   DRAFT → SUBMITTED → APPROVED → COMPLETED
                                  ↘ REJECTED → DRAFT
                    ↓(any) CANCELLED

Export Order:   DRAFT → SUBMITTED → APPROVED → COMPLETED
                                  ↘ REJECTED → DRAFT
                    ↓(any) CANCELLED

Transfer:       DRAFT → SUBMITTED → APPROVED → DISPATCHED → COMPLETED
                                  ↘ REJECTED → DRAFT
                    ↓(any) CANCELLED

Requisition:    DRAFT → PENDING → APPROVED → WAREHOUSE_CONFIRMED
                               ↘ REJECTED
                CANCELLED (bất kỳ state chưa complete)

Purchase PR:    DRAFT → PENDING → APPROVED → PO_CREATED
                               ↘ REJECTED / CANCELLED

Purchase PO:    DRAFT → CONFIRMED → RECEIVED
                CANCELLED

Stocktaking:    IN_PROGRESS → COMPLETED / CANCELLED
```
