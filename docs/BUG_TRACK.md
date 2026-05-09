# QLVPP — BUG TRACKER
> Cập nhật: N33 (29/04/2026) — Purchase bulk-approve gap + 61 E2E tests

## ✅ Trạng thái tổng quan

| Metric | Kết quả |
|--------|---------|
| Backend syntax | 31/31 files ✅ |
| Unit tests | 93/93 passed ✅ |
| Race conditions | 0 còn tồn tại ✅ |
| Connection leaks | 0 (tất cả dùng finally{conn.release()}) ✅ |
| Unit tests | 283/283 passed ✅ |
| Bulk-approve PRs | ✅ Added (N33) |
| Bulk-approve POs | ✅ Added (N33) |
| Docker deploy | Sẵn sàng (migrations idempotent) ✅ |

---

## 🟢 N28 — FIXED THIS SESSION

| Bug ID | Severity | File(s) | Mô tả | Status |
|--------|----------|---------|-------|--------|
| BUG-N28-01 | 🔴 CRITICAL | `migration_p0.sql` | 2× `ADD COLUMN IF NOT EXISTS` — MariaDB syntax, MySQL 8.0 không hỗ trợ → Docker init crash | ✅ Fixed N28 |
| BUG-N28-02 | 🔴 CRITICAL | `migration_p1.sql` | 1× `ADD COLUMN IF NOT EXISTS reorder_point` — cùng vấn đề | ✅ Fixed N28 |
| BUG-N28-03 | 🔴 CRITICAL | `migration_p2.sql` | 6× `ADD COLUMN IF NOT EXISTS` (lot_id ×4, unit_id, warehouse_ids) | ✅ Fixed N28 |
| BUG-N28-04 | 🔴 CRITICAL | `migration_p3.sql` | 4× `ADD COLUMN IF NOT EXISTS` + 1× `ADD INDEX IF NOT EXISTS` | ✅ Fixed N28 |
| BUG-N28-05 | 🔴 CRITICAL | `migration_p4.sql` | `ADD COLUMN reserved_quantity` không có IF NOT EXISTS → crash "Duplicate column name" trên fresh install | ✅ Fixed N28 |
| BUG-N28-06 | 🟠 HIGH | `init.sql` | Thiếu cột: `warehouse_stock.location_id`, `notifications.email_sent/email_sent_at`, `users.warehouse_ids` | ✅ Fixed N28 |

### Pattern fix áp dụng (MySQL 8.0 compatible):
```sql
-- Thay ADD COLUMN IF NOT EXISTS bằng:
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tbl' AND COLUMN_NAME='col');
SET @s = IF(@c=0,'ALTER TABLE tbl ADD COLUMN col TYPE','SELECT 1');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;

-- Thay ADD INDEX IF NOT EXISTS bằng:
SET @i = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tbl' AND INDEX_NAME='idx');
SET @s = IF(@i=0,'ALTER TABLE tbl ADD INDEX idx (col)','SELECT 1');
PREPARE _p FROM @s; EXECUTE _p; DEALLOCATE PREPARE _p;
```

---

## 🟢 N27 — FIXED

| Bug ID | Severity | Mô tả | Status |
|--------|----------|-------|--------|
| BUG-N27-01 | 🔴 HIGH | `frontend/.dockerignore` thiếu → Docker copy node_modules | ✅ Fixed N27 |
| BUG-N27-02 | 🟠 MEDIUM | PO receive: `import_orders` code gen thiếu `FOR UPDATE` → race condition | ✅ Fixed N27 |
| BUG-N27-03 | 🟠 MEDIUM | PO receive: INSERT thiếu `completed_by` → audit trail gap | ✅ Fixed N27 |

## 🟢 N26 — FIXED

| Bug ID | Severity | Mô tả |
|--------|----------|-------|
| BUG-PO-WH-01 | 🔴 CRITICAL | PO warehouseId flow — backend + frontend + api.js |
| BUG-DEPS-01 | 🟠 HIGH | xlsx CDN private → npm public registry |
| BUG-JEST-COV | 🟡 LOW | Jest coverage threshold |

## 🟢 N25 — FIXED

| Bug ID | Mô tả |
|--------|-------|
| BUG-RC-03 | purchases.js genPRCode/genPOCode + FOR UPDATE |
| BUG-RC-04 | warehouses.js genCode MAX+FOR UPDATE |
| BUG-ENV-01 | Root vs backend .env.example nhất quán |

---

## 🔴 Race Conditions — Trạng thái cuối cùng: 0 còn tồn tại

| File | Function | FOR UPDATE | Status |
|------|----------|-----------|--------|
| `returns.js` | `genCode()` | ✅ | Fixed N19 |
| `stocktaking.js` | `genSessionCode()` | ✅ | Fixed N19 |
| `transfers.js` | `genCode()` | ✅ | Fixed N19 |
| `requisitions.js` | `genReqCode()` | ✅ | Fixed N19 |
| `orders.js` | inline genCode | ✅ | Fixed N15 |
| `export-orders.js` | inline genCode | ✅ | Fixed N15 |
| `purchases.js` | `genPRCode()` / `genPOCode()` | ✅ | Fixed N25 |
| `warehouses.js` | `genCode()` | ✅ | Fixed N25 |
| `purchases.js` | PO receive → import_orders | ✅ | Fixed N27 |

---

## ✅ Kiến trúc đã xác nhận hoạt động đúng

- Moving Average Weighted Cost (Spec IV) — đúng per-warehouse và global
- `reserved_quantity` reserve/release flow — đầy đủ
- Pessimistic lock (SELECT ... FOR UPDATE) — xuất kho, kiểm kê, điều chuyển
- Idempotency key — chống double-submit PR, PO, Import, Export, Transfer
- RBAC data-level security — `attachUserWarehouses` + `buildWarehouseFilter`
- Triggers sync `warehouse_stock` → `products.stock_qty`
- Status machine transitions — Import, Export, Transfer, Requisition, PO
- Partial fulfillment — export_orders với `fulfilledItems`
- 2-phase transfer — APPROVED → IN_TRANSIT → COMPLETED
- Migrations — MySQL 8.0 fully compatible, idempotent

---

## 🟢 N37 — FIXED (30/04/2026)

| Bug ID | Severity | File(s) | Mô tả | Status |
|--------|----------|---------|-------|--------|
| BUG-N37-01 | 🔴 CRITICAL | `apps/web/nginx.conf` | `proxy_pass http://backend:8080` → hostname "backend" không tồn tại trong Docker network; service tên là "api" → 502 tất cả API calls khi deploy Docker | ✅ Fixed N37 |
| ENH-N37-01 | 🟡 MEDIUM | `apps/api/Dockerfile` | Root user + không có dumb-init → SIGTERM bị ignore, graceful shutdown không hoạt động | ✅ Fixed N37 |

---

## 🟢 N38 — FIXED (30/04/2026)

| Bug ID | Severity | File(s) | Mô tả | Status |
|--------|----------|---------|-------|--------|
| BUG-N38-01 | 🔴 CRITICAL | `apps/api/src/controllers/report.controller.js` | dead-stock GET shadowing fat route với sai RBAC (Manager-only thay vì Warehouse+), param mismatch (thresholdDays vs days), thiếu categoryId filter, response shape khác | ✅ Fixed N38 |
| ENH-N38-02 | 🟠 HIGH | `apps/web/nginx.conf` | Thiếu 5 security response headers chuẩn | ✅ Fixed N38 |
