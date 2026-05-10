-- ============================================================
-- QLVPP Schema v4.0.0 — Golden Source of Truth
-- Ngày tạo: 2026-04-28
-- [GAP-03 FIX] 1 file duy nhất thay thế init.sql + migration_p0→p14
-- Tổng: 39 bảng, triggers, views, seed data đầy đủ
-- Dùng trong docker-compose: 01-schema.sql
-- ============================================================
-- ============================================================
-- QLVPP — Quản Lý Văn Phòng Phẩm
-- Golden Schema v4.0.0  (Clean Break — Clean Architecture)
-- MySQL 8.0 | utf8mb4_unicode_ci
--
-- Tổng bảng: 39 (37 gốc + 2 mới: stock_ledger, stock_snapshot_daily)
-- Lược bỏ: migration_p0→p14 (tích hợp hoàn toàn vào đây)
-- Kiểu dữ liệu quantity: INT (Option B — văn phòng phẩm số nguyên)
-- Kiểu dữ liệu price/cost: DECIMAL(18,6) — độ chính xác cao (Spec VII)
--
-- Nhóm bảng:
--   I.   System & Auth      (7 bảng)
--   II.  Master Data        (10 bảng)
--   III. Inventory Core     (4 bảng)  ← + 2 bảng mới
--   IV.  Business Modules   (16 bảng)
--   V.   Triggers & Views
--   VI.  Seed Data
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- ── 0. Database ──────────────────────────────────────────────────────
DROP DATABASE IF EXISTS qlvpp;
CREATE DATABASE qlvpp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE qlvpp;

-- ── DROP — reverse FK order ──────────────────────────────────────────
DROP TABLE IF EXISTS stock_snapshot_daily;
DROP TABLE IF EXISTS stock_ledger;
DROP TABLE IF EXISTS inventory_adjustments;
DROP TABLE IF EXISTS import_logs;
DROP TABLE IF EXISTS stocktaking_items;
DROP TABLE IF EXISTS stocktaking_sessions;
DROP TABLE IF EXISTS return_items;
DROP TABLE IF EXISTS return_orders;
DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS purchase_request_items;
DROP TABLE IF EXISTS purchase_requests;
DROP TABLE IF EXISTS stock_transfer_items;
DROP TABLE IF EXISTS stock_transfers;
DROP TABLE IF EXISTS requisition_items;
DROP TABLE IF EXISTS requisitions;
DROP TABLE IF EXISTS export_order_items;
DROP TABLE IF EXISTS export_orders;
DROP TABLE IF EXISTS import_order_items;
DROP TABLE IF EXISTS import_orders;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS stock_transactions;
DROP TABLE IF EXISTS warehouse_stock;
DROP TABLE IF EXISTS price_history;
DROP TABLE IF EXISTS warehouse_locations;
DROP TABLE IF EXISTS user_warehouses;
DROP TABLE IF EXISTS unit_conversions;
DROP TABLE IF EXISTS lots;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS units;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS warehouses;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS general_audit_log;
DROP TABLE IF EXISTS login_audit_log;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS schema_migrations;

-- ════════════════════════════════════════════════════════════════════
-- I. SYSTEM & AUTH
-- ════════════════════════════════════════════════════════════════════

-- ── I.0. departments ─────────────────────────────────────────────────
CREATE TABLE departments (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL UNIQUE,
    description  TEXT         NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── I.1. users ───────────────────────────────────────────────────────
CREATE TABLE users (
    id           INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(50)    NOT NULL UNIQUE,
    password     VARCHAR(255)   NOT NULL,
    full_name    VARCHAR(100)   NOT NULL,
    email        VARCHAR(150)   NOT NULL UNIQUE,
    phone_number VARCHAR(20)    NULL,
    department_id INT UNSIGNED NULL,
    department   VARCHAR(100)   NULL COMMENT 'Legacy department field',
    warehouse_ids JSON          NULL COMMENT 'Cache danh sách warehouse_id (source of truth = user_warehouses)',
    role         ENUM('ADMIN','MANAGER','WAREHOUSE','USER') NOT NULL DEFAULT 'USER',
    active       TINYINT(1)     NOT NULL DEFAULT 1,
    deleted      TINYINT(1)     NOT NULL DEFAULT 0,
    created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    INDEX idx_users_role    (role),
    INDEX idx_users_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── I.2. password_reset_tokens ───────────────────────────────────────
CREATE TABLE password_reset_tokens (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    token      VARCHAR(64)  NOT NULL UNIQUE,
    expires_at DATETIME     NOT NULL,
    used       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_prt_token   (token),
    INDEX idx_prt_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── I.3. sessions (express-mysql-session) ────────────────────────────
CREATE TABLE sessions (
    session_id VARCHAR(128) NOT NULL PRIMARY KEY,
    expires    INT UNSIGNED NOT NULL,
    data       MEDIUMTEXT   NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── I.4. idempotency_keys ────────────────────────────────────────────
-- Chống double submit cho POST / mutation endpoints
CREATE TABLE idempotency_keys (
    id              INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    idem_key        VARCHAR(255)   NOT NULL,
    user_id         INT UNSIGNED NULL,
    endpoint        VARCHAR(200) NOT NULL,
    status          ENUM('PROCESSING', 'COMPLETED') NOT NULL DEFAULT 'PROCESSING',
    response_status SMALLINT UNSIGNED NOT NULL DEFAULT 200,
    response_body   MEDIUMTEXT     NULL,
    processed_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME       NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uk_idem (idem_key, (IFNULL(user_id, 0))),
    INDEX idx_idem_key     (idem_key),
    INDEX idx_idem_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── I.5. login_audit_log ─────────────────────────────────────────────
CREATE TABLE login_audit_log (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username   VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45)  NULL,
    user_agent TEXT         NULL,
    success    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lal_username   (username),
    INDEX idx_lal_ip         (ip_address),
    INDEX idx_lal_created_at (created_at),
    INDEX idx_lal_success    (success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── I.6. general_audit_log ───────────────────────────────────────────
-- Ghi lại mọi thay đổi quan trọng: approve, adjust, delete, complete
CREATE TABLE general_audit_log (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entity_type VARCHAR(50)  NOT NULL COMMENT 'Tên bảng hoặc aggregate (e.g. import_order, requisition)',
    entity_id   INT UNSIGNED NULL,
    action      VARCHAR(50)  NOT NULL COMMENT 'CREATE | UPDATE | DELETE | APPROVE | REJECT | COMPLETE',
    changed_by  INT UNSIGNED NULL,
    ip_address  VARCHAR(45)  NULL,
    before_data JSON         NULL,
    after_data  JSON         NULL,
    note        TEXT         NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_gal_entity     (entity_type, entity_id),
    INDEX idx_gal_action     (action),
    INDEX idx_gal_changed_by (changed_by),
    INDEX idx_gal_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── I.7. schema_migrations ───────────────────────────────────────────
CREATE TABLE schema_migrations (
    version    VARCHAR(50) NOT NULL PRIMARY KEY,
    applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ════════════════════════════════════════════════════════════════════
-- II. MASTER DATA
-- ════════════════════════════════════════════════════════════════════

-- ── II.1. categories ────────────────────────────────────────────────
CREATE TABLE categories (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT         NULL,
    deleted     TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cat_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── II.2. units ─────────────────────────────────────────────────────
CREATE TABLE units (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(50)  NOT NULL UNIQUE COMMENT 'Cái, Hộp, Ream, Cuộn...',
    symbol     VARCHAR(20)  NULL,
    is_base    TINYINT(1)   NOT NULL DEFAULT 0,
    deleted    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_unit_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── II.3. unit_conversions ──────────────────────────────────────────
CREATE TABLE unit_conversions (
    id           INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    from_unit_id INT UNSIGNED   NOT NULL,
    to_unit_id   INT UNSIGNED   NOT NULL,
    ratio        DECIMAL(18,6)  NOT NULL COMMENT 'to = from * ratio',
    note         VARCHAR(200)   NULL,
    created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_unit_id) REFERENCES units(id) ON DELETE CASCADE,
    FOREIGN KEY (to_unit_id)   REFERENCES units(id) ON DELETE CASCADE,
    UNIQUE KEY uk_conversion (from_unit_id, to_unit_id),
    CONSTRAINT chk_ratio           CHECK (ratio > 0),
    CONSTRAINT chk_no_self_convert CHECK (from_unit_id != to_unit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── II.4. warehouses ────────────────────────────────────────────────
CREATE TABLE warehouses (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    location    VARCHAR(200) NULL,
    description TEXT         NULL,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    deleted     TINYINT(1)   NOT NULL DEFAULT 0,
    created_by  INT UNSIGNED NULL,
    updated_by  INT UNSIGNED NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_wh_deleted   (deleted),
    INDEX idx_wh_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── II.5. warehouse_locations ───────────────────────────────────────
CREATE TABLE warehouse_locations (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    warehouse_id INT UNSIGNED NOT NULL,
    code         VARCHAR(30)  NOT NULL COMMENT 'A1-01, B2-03...',
    name         VARCHAR(100) NULL,
    description  TEXT         NULL,
    deleted      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    UNIQUE KEY uk_wl_code (warehouse_id, code),
    INDEX idx_wl_warehouse (warehouse_id),
    INDEX idx_wl_deleted   (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── II.6. suppliers ─────────────────────────────────────────────────
CREATE TABLE suppliers (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code         VARCHAR(20)  NOT NULL UNIQUE,
    name         VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100) NULL,
    phone        VARCHAR(20)  NULL,
    email        VARCHAR(150) NULL,
    address      TEXT         NULL,
    tax_code     VARCHAR(20)  NULL,
    active       TINYINT(1)   NOT NULL DEFAULT 1,
    deleted      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sup_active  (active),
    INDEX idx_sup_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── II.7. products ──────────────────────────────────────────────────
CREATE TABLE products (
    id            INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    sku           VARCHAR(50)    NOT NULL UNIQUE,
    barcode       VARCHAR(100)   NULL UNIQUE  COMMENT 'Mã vạch (EAN13, QR...)',
    name          VARCHAR(200)   NOT NULL,
    category_id   INT UNSIGNED   NULL,
    base_unit_id  INT UNSIGNED   NULL COMMENT 'Đơn vị tính gốc (FK → units)',
    unit          VARCHAR(30)    NULL         COMMENT 'Giữ lại cho backward compat — prefer base_unit_id',
    price         DECIMAL(18,6)  NOT NULL DEFAULT 0 COMMENT 'Giá nhập/tham chiếu',
    avg_unit_price DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Giá vốn trung bình toàn hệ thống (cache)',
    stock_qty     INT            NOT NULL DEFAULT 0 COMMENT 'Tổng tồn kho toàn hệ thống (cache, derived)',
    reserved_quantity INT        NOT NULL DEFAULT 0 COMMENT 'Tổng hàng giữ chỗ toàn hệ thống (cache, derived)',
    min_stock_qty INT            NOT NULL DEFAULT 0 COMMENT 'Mức tồn kho tối thiểu (cảnh báo)',
    reorder_point INT UNSIGNED   NULL         COMMENT 'Điểm đặt hàng lại',
    description   TEXT           NULL,
    image_url     VARCHAR(500)   NULL,
    deleted       TINYINT(1)     NOT NULL DEFAULT 0,
    created_by    INT UNSIGNED   NULL,
    updated_by    INT UNSIGNED   NULL,
    created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id)  REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (base_unit_id) REFERENCES units(id)      ON DELETE SET NULL,
    FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (updated_by)   REFERENCES users(id)      ON DELETE SET NULL,
    INDEX idx_prod_category (category_id),
    INDEX idx_prod_deleted  (deleted),
    INDEX idx_prod_sku      (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── II.8. lots ──────────────────────────────────────────────────────
CREATE TABLE lots (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id  INT UNSIGNED NOT NULL,
    batch_code  VARCHAR(100) NOT NULL COMMENT 'Mã lô / batch number',
    expiry_date DATE         NULL COMMENT 'Hạn sử dụng (NULL = không có HSD)',
    CHECK (expiry_date IS NULL OR expiry_date >= '2000-01-01'),
    quantity_in INT          NOT NULL DEFAULT 0 COMMENT 'Tổng SL nhập lô này',
    note        TEXT         NULL,
    created_by  INT UNSIGNED NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL,
    UNIQUE KEY uk_lot_batch (product_id, batch_code),
    INDEX idx_lot_product (product_id),
    INDEX idx_lot_expiry  (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Quản lý lô hàng (batch/lot tracking)';

-- ── II.9. user_warehouses ───────────────────────────────────────────
-- Data-level RBAC: gán quyền truy cập kho theo user
CREATE TABLE user_warehouses (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED NOT NULL,
    warehouse_id INT UNSIGNED NOT NULL,
    created_by   INT UNSIGNED NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)  ON DELETE CASCADE,
    FOREIGN KEY (created_by)   REFERENCES users(id)       ON DELETE SET NULL,
    UNIQUE KEY uk_uw (user_id, warehouse_id),
    INDEX idx_uw_user      (user_id),
    INDEX idx_uw_warehouse (warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Gán quyền truy cập kho cho user';

-- ── II.10. price_history ────────────────────────────────────────────
CREATE TABLE price_history (
    id                INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    product_id        INT UNSIGNED   NOT NULL,
    supplier_id       INT UNSIGNED   NULL,
    purchase_order_id INT UNSIGNED   NULL,
    unit_price        DECIMAL(18,6)  NOT NULL DEFAULT 0 COMMENT 'Giá tại thời điểm ghi nhận',
    quantity          INT            NOT NULL DEFAULT 0 COMMENT 'Số lượng (nếu là từ PO)',
    old_price         DECIMAL(18,6)  NULL DEFAULT 0     COMMENT 'Giá cũ (nếu là đổi giá master)',
    new_price         DECIMAL(18,6)  NULL DEFAULT 0     COMMENT 'Giá mới (nếu là đổi giá master)',
    effective_date    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by        INT UNSIGNED   NULL,
    note              TEXT           NULL,
    created_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id)        REFERENCES products(id)        ON DELETE CASCADE,
    FOREIGN KEY (supplier_id)       REFERENCES suppliers(id)       ON DELETE SET NULL,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (changed_by)        REFERENCES users(id)           ON DELETE SET NULL,
    INDEX idx_ph_product    (product_id),
    INDEX idx_ph_supplier   (supplier_id),
    INDEX idx_ph_po         (purchase_order_id),
    INDEX idx_ph_effective  (effective_date),
    INDEX idx_ph_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ════════════════════════════════════════════════════════════════════
-- III. INVENTORY CORE  ← Trái tim của hệ thống
-- ════════════════════════════════════════════════════════════════════

-- ── III.1. warehouse_stock ──────────────────────────────────────────
-- Derived state — KHÔNG cập nhật trực tiếp, chỉ qua InventoryTransaction
CREATE TABLE warehouse_stock (
    id                INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    warehouse_id      INT UNSIGNED   NOT NULL,
    product_id        INT UNSIGNED   NOT NULL,
    location_id       INT UNSIGNED   NULL COMMENT 'Vị trí trong kho (optional)',
    stock_qty         INT            NOT NULL DEFAULT 0,
    reserved_quantity INT            NOT NULL DEFAULT 0
                      COMMENT 'SL đang reserve — tránh oversell khi approve requisition/export',
    avg_unit_price    DECIMAL(18,6)  NOT NULL DEFAULT 0
                      COMMENT 'Giá vốn trung bình (Moving Average Weighted) per kho',
    updated_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)          ON DELETE CASCADE,
    FOREIGN KEY (product_id)   REFERENCES products(id)            ON DELETE CASCADE,
    CONSTRAINT fk_ws_location  FOREIGN KEY (location_id) REFERENCES warehouse_locations(id) ON DELETE SET NULL,
    UNIQUE KEY uk_ws (warehouse_id, product_id),
    INDEX idx_ws_product      (product_id),
    INDEX idx_ws_location     (location_id),
    INDEX idx_ws_warehouse_qty (warehouse_id, stock_qty),
    -- Computed: available = stock_qty - reserved_quantity (check constraint for safety)
    CONSTRAINT chk_ws_reserved CHECK (reserved_quantity >= 0),
    CONSTRAINT chk_ws_qty      CHECK (stock_qty >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tồn kho per kho per sản phẩm (derived state — KHÔNG sửa trực tiếp)';

-- ── III.2. stock_transactions ───────────────────────────────────────
-- Source of Truth — mọi thay đổi tồn kho đều bắt đầu từ đây
CREATE TABLE stock_transactions (
    id             INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    product_id     INT UNSIGNED   NOT NULL,
    warehouse_id   INT UNSIGNED   NULL COMMENT 'Kho thực hiện giao dịch',
    lot_id         INT UNSIGNED   NULL COMMENT 'Lô hàng liên quan',
    reference_type VARCHAR(50)    NULL
                   COMMENT 'import_order | export_order | transfer | stocktaking | adjustment | return',
    reference_id   INT UNSIGNED   NULL COMMENT 'PK của document nguồn',
    type           ENUM(
                     'IMPORT',       -- Nhập kho (từ PO hoặc trực tiếp)
                     'EXPORT',       -- Xuất kho (từ export order)
                     'ADJUST',       -- Điều chỉnh (stocktaking hoặc manual)
                     'TRANSFER_IN',  -- Nhận từ kho khác
                     'TRANSFER_OUT', -- Chuyển sang kho khác
                     'RETURN_IN',    -- Nhận hàng trả từ nhân viên
                     'RETURN_OUT',   -- Trả hàng lại nhà cung cấp
                     'STOCKTAKE'     -- Xác nhận kiểm kê
                   ) NOT NULL,
    quantity       INT            NOT NULL,
    unit_price     DECIMAL(18,6)  NOT NULL DEFAULT 0
                   COMMENT 'Snapshot giá vốn avg_unit_price tại thời điểm giao dịch',
    stock_before   INT            NOT NULL DEFAULT 0 COMMENT 'Tồn trước giao dịch',
    stock_after    INT            NOT NULL DEFAULT 0 COMMENT 'Tồn sau giao dịch',
    note           TEXT           NULL,
    created_by     INT UNSIGNED   NULL,
    created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id)   REFERENCES products(id)    ON DELETE RESTRICT,
    FOREIGN KEY (created_by)   REFERENCES users(id)       ON DELETE SET NULL,
    CONSTRAINT fk_stx_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    CONSTRAINT fk_stx_lot       FOREIGN KEY (lot_id)       REFERENCES lots(id)       ON DELETE SET NULL,
    INDEX idx_stx_product           (product_id),
    INDEX idx_stx_warehouse         (warehouse_id),
    INDEX idx_stx_lot               (lot_id),
    INDEX idx_stx_reference         (reference_type, reference_id),
    INDEX idx_stx_type              (type),
    INDEX idx_stx_created_at        (created_at),
    INDEX idx_stx_type_date         (type, created_at),
    INDEX idx_stx_product_type_date (product_id, type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Source of Truth — mọi thay đổi tồn kho đều có record ở đây';

-- ── III.3. stock_ledger  [MỚI - GAP-02] ─────────────────────────────
-- Sổ cái tồn kho — audit trail với running_balance per kho per sản phẩm
-- Ghi mỗi khi stock_transactions INSERT → phục vụ truy vết tuyệt đối
CREATE TABLE stock_ledger (
    id               INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    warehouse_id     INT UNSIGNED   NOT NULL,
    product_id       INT UNSIGNED   NOT NULL,
    transaction_id   INT UNSIGNED   NOT NULL COMMENT 'FK → stock_transactions.id',
    transaction_type ENUM(
                       'IMPORT','EXPORT','ADJUST',
                       'TRANSFER_IN','TRANSFER_OUT',
                       'RETURN_IN','RETURN_OUT','STOCKTAKE'
                     ) NOT NULL,
    quantity_change  INT            NOT NULL COMMENT 'Dương=nhập, Âm=xuất',
    running_balance  INT            NOT NULL DEFAULT 0
                     COMMENT 'Số dư tích lũy tại kho này sau giao dịch',
    cost_per_unit    DECIMAL(18,6)  NOT NULL DEFAULT 0 COMMENT 'Giá vốn tại thời điểm giao dịch',
    cost_impact      DECIMAL(18,6)  NOT NULL DEFAULT 0
                     COMMENT 'Tác động giá vốn = quantity_change * cost_per_unit',
    reference_type   VARCHAR(50)    NULL,
    reference_id     INT UNSIGNED   NULL,
    note             TEXT           NULL,
    created_by       INT UNSIGNED   NULL,
    created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id)   REFERENCES warehouses(id)        ON DELETE RESTRICT,
    FOREIGN KEY (product_id)     REFERENCES products(id)          ON DELETE RESTRICT,
    FOREIGN KEY (transaction_id) REFERENCES stock_transactions(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by)     REFERENCES users(id)             ON DELETE SET NULL,
    INDEX idx_sl_warehouse         (warehouse_id),
    INDEX idx_sl_product           (product_id),
    INDEX idx_sl_transaction       (transaction_id),
    INDEX idx_sl_wh_prod_date      (warehouse_id, product_id, created_at),
    INDEX idx_sl_reference         (reference_type, reference_id),
    INDEX idx_sl_type_date          (transaction_type, created_at),
    INDEX idx_sl_created_at        (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Sổ cái tồn kho — audit trail với running_balance (GAP-02)';

-- ── III.4. stock_snapshot_daily  [MỚI - GAP-03] ─────────────────────
-- Snapshot tồn kho cuối ngày — tránh tính lại toàn bộ lịch sử khi báo cáo
-- Được tạo bởi Cron job RunDailySnapshot chạy mỗi 23:59
CREATE TABLE stock_snapshot_daily (
    id                INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    snapshot_date     DATE           NOT NULL COMMENT 'Ngày snapshot (YYYY-MM-DD)',
    warehouse_id      INT UNSIGNED   NOT NULL,
    product_id        INT UNSIGNED   NOT NULL,
    stock_qty         INT            NOT NULL DEFAULT 0 COMMENT 'Tồn kho cuối ngày',
    reserved_quantity INT            NOT NULL DEFAULT 0,
    avg_unit_price    DECIMAL(18,6)  NOT NULL DEFAULT 0 COMMENT 'Giá vốn TB cuối ngày',
    total_value       DECIMAL(18,6)  NOT NULL DEFAULT 0
                      COMMENT 'Tổng giá trị tồn = stock_qty * avg_unit_price',
    created_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id)   REFERENCES products(id)   ON DELETE CASCADE,
    UNIQUE KEY uk_snapshot (snapshot_date, warehouse_id, product_id),
    INDEX idx_snap_date         (snapshot_date),
    INDEX idx_snap_warehouse    (warehouse_id),
    INDEX idx_snap_product      (product_id),
    INDEX idx_snap_wh_prod_date (warehouse_id, product_id, snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Snapshot tồn kho cuối ngày — tăng tốc báo cáo lịch sử (GAP-03)';


-- ════════════════════════════════════════════════════════════════════
-- IV. BUSINESS MODULES
-- ════════════════════════════════════════════════════════════════════

-- ── IV.1. notifications ─────────────────────────────────────────────
CREATE TABLE notifications (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NULL COMMENT 'NULL = gửi cho tất cả ADMIN/MANAGER',
    product_id  INT UNSIGNED NULL COMMENT 'Liên kết sản phẩm (cảnh báo tồn kho)',
    ref_id      INT UNSIGNED NULL COMMENT 'ID của document liên quan (YC, PO...)',
    type        VARCHAR(50)  NOT NULL COMMENT 'LOW_STOCK | OUT_OF_STOCK | REQUISITION_CREATED | etc',
    title       VARCHAR(200) NOT NULL,
    message     TEXT         NULL,
    link        VARCHAR(300) NULL,
    is_read     TINYINT(1)   NOT NULL DEFAULT 0,
    read_at     DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    INDEX idx_notif_user     (user_id),
    INDEX idx_notif_is_read  (is_read),
    INDEX idx_notif_product  (product_id),
    INDEX idx_notif_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.2. import_orders (Phiếu nhập kho) ────────────────────────────
CREATE TABLE import_orders (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_code   VARCHAR(30)  NOT NULL UNIQUE,
    supplier_id  INT UNSIGNED NULL,
    warehouse_id INT UNSIGNED NULL,
    status       ENUM('DRAFT','PENDING','APPROVED','IN_TRANSIT','COMPLETED','CANCELLED')
                 NOT NULL DEFAULT 'DRAFT',
    total_amount DECIMAL(18,6) NOT NULL DEFAULT 0,
    note         TEXT          NULL,
    created_by       INT UNSIGNED NULL,
    submitted_by     INT UNSIGNED NULL,
    submitted_at     DATETIME     NULL,
    approved_by      INT UNSIGNED NULL,
    approved_at      DATETIME     NULL,
    rejected_by      INT UNSIGNED NULL,
    rejected_at      DATETIME     NULL,
    confirmed_by     INT UNSIGNED NULL,
    confirmed_at     DATETIME     NULL,
    completed_by     INT UNSIGNED NULL,
    completed_at     DATETIME     NULL,
    cancelled_by     INT UNSIGNED NULL,
    cancelled_at     DATETIME     NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id)  REFERENCES suppliers(id)  ON DELETE SET NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (submitted_by) REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (approved_by)  REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (rejected_by)  REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (confirmed_by) REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (completed_by) REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (cancelled_by) REFERENCES users(id)      ON DELETE SET NULL,
    INDEX idx_io_status      (status),
    INDEX idx_io_supplier    (supplier_id),
    INDEX idx_io_warehouse   (warehouse_id),
    INDEX idx_io_status_date (status, created_at),
    INDEX idx_io_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.3. import_order_items ─────────────────────────────────────────
CREATE TABLE import_order_items (
    id          INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    order_id    INT UNSIGNED   NOT NULL,
    product_id  INT UNSIGNED   NOT NULL,
    lot_id      INT UNSIGNED   NULL,
    unit_id     INT UNSIGNED   NULL,
    quantity    INT            NOT NULL,
    unit_price  DECIMAL(18,6)  NOT NULL DEFAULT 0,
    total_price DECIMAL(18,6)  NOT NULL DEFAULT 0,
    FOREIGN KEY (order_id)   REFERENCES import_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)      ON DELETE RESTRICT,
    FOREIGN KEY (lot_id)     REFERENCES lots(id)          ON DELETE SET NULL,
    FOREIGN KEY (unit_id)    REFERENCES units(id)         ON DELETE SET NULL,
    UNIQUE KEY uk_ioi (order_id, product_id),
    INDEX idx_ioi_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.4. export_orders (Phiếu xuất kho) ────────────────────────────
CREATE TABLE export_orders (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_code     VARCHAR(30)  NOT NULL UNIQUE,
    requisition_id INT UNSIGNED NULL COMMENT 'Nguồn từ phiếu yêu cầu (nếu có)',
    status         ENUM('DRAFT','PENDING','APPROVED','REJECTED','COMPLETED','CANCELLED')
                   NOT NULL DEFAULT 'DRAFT',
    recipient_name VARCHAR(100) NULL,
    department     VARCHAR(100) NULL,
    warehouse_id   INT UNSIGNED NULL,
    note           TEXT         NULL,
    total_qty      INT          NOT NULL DEFAULT 0,
    created_by     INT UNSIGNED NULL,
    submitted_by   INT UNSIGNED NULL,
    submitted_at   DATETIME     NULL,
    approved_by    INT UNSIGNED NULL,
    approved_at    DATETIME     NULL,
    rejected_by    INT UNSIGNED NULL,
    rejected_at    DATETIME     NULL,
    completed_by   INT UNSIGNED NULL,
    completed_at   DATETIME     NULL,
    cancelled_by   INT UNSIGNED NULL,
    cancelled_at   DATETIME     NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requisition_id) REFERENCES requisitions(id) ON DELETE SET NULL,
    FOREIGN KEY (warehouse_id)   REFERENCES warehouses(id)   ON DELETE SET NULL,
    FOREIGN KEY (created_by)     REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (submitted_by)   REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (approved_by)    REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (rejected_by)    REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (completed_by)   REFERENCES users(id)        ON DELETE SET NULL,
    FOREIGN KEY (cancelled_by)   REFERENCES users(id)        ON DELETE SET NULL,
    INDEX idx_eo_status     (status),
    INDEX idx_eo_warehouse  (warehouse_id),
    INDEX idx_eo_status_date (status, created_at),
    INDEX idx_eo_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.5. export_order_items ─────────────────────────────────────────
CREATE TABLE export_order_items (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id           INT UNSIGNED NOT NULL,
    product_id         INT UNSIGNED NOT NULL,
    lot_id             INT UNSIGNED NULL,
    unit_id            INT UNSIGNED NULL COMMENT 'NULL = dùng base_unit_id của product',
    quantity           INT          NOT NULL,
    quantity_fulfilled INT UNSIGNED NULL COMMENT 'SL thực xuất (partial). NULL = chưa xuất',
    note               TEXT         NULL,
    FOREIGN KEY (order_id)   REFERENCES export_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)      ON DELETE RESTRICT,
    CONSTRAINT fk_eoi_lot  FOREIGN KEY (lot_id)  REFERENCES lots(id)  ON DELETE SET NULL,
    CONSTRAINT fk_eoi_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
    INDEX idx_eoi_product (product_id),
    INDEX idx_eoi_unit    (unit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.6. requisitions (Phiếu yêu cầu vật tư) ──────────────────────
CREATE TABLE requisitions (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    req_code                VARCHAR(30)  NOT NULL UNIQUE,
    status                  ENUM('PENDING','APPROVED','REJECTED','CANCELLED','WAREHOUSE_CONFIRMED')
                            NOT NULL DEFAULT 'PENDING',
    note                    TEXT         NULL,
    reject_reason           TEXT         NULL,
    requester_id            INT UNSIGNED NULL,
    approved_by             INT UNSIGNED NULL,
    approved_at             DATETIME     NULL,
    rejected_by             INT UNSIGNED NULL,
    rejected_at             DATETIME     NULL,
    cancelled_by            INT UNSIGNED NULL,
    cancelled_at            DATETIME     NULL,
    warehouse_confirmed_by  INT UNSIGNED NULL,
    warehouse_confirmed_at  DATETIME     NULL,
    warehouse_id            INT UNSIGNED NULL,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id)           REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (approved_by)            REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (rejected_by)            REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (cancelled_by)           REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (warehouse_confirmed_by) REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (warehouse_id)           REFERENCES warehouses(id)  ON DELETE SET NULL,
    INDEX idx_req_status      (status),
    INDEX idx_req_requester   (requester_id),
    INDEX idx_req_warehouse   (warehouse_id),
    INDEX idx_req_status_date (status, created_at),
    INDEX idx_req_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.7. requisition_items ──────────────────────────────────────────
CREATE TABLE requisition_items (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    requisition_id     INT UNSIGNED NOT NULL,
    product_id         INT UNSIGNED NOT NULL,
    quantity_requested INT          NOT NULL,
    quantity_approved  INT          NULL COMMENT 'Số lượng được duyệt (có thể < quantity)',
    unit_id            INT UNSIGNED NULL,
    note               TEXT         NULL,
    FOREIGN KEY (requisition_id) REFERENCES requisitions(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id)     REFERENCES products(id)     ON DELETE RESTRICT,
    FOREIGN KEY (unit_id)        REFERENCES units(id)        ON DELETE SET NULL,
    UNIQUE KEY uk_ri (requisition_id, product_id),
    INDEX idx_ri_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.8. stock_transfers (Điều chuyển kho) ─────────────────────────
CREATE TABLE stock_transfers (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    transfer_code    VARCHAR(30)  NOT NULL UNIQUE,
    from_warehouse_id INT UNSIGNED NULL,
    to_warehouse_id   INT UNSIGNED NULL,
    status           ENUM('DRAFT','PENDING','APPROVED','IN_TRANSIT','COMPLETED','CANCELLED')
                     NOT NULL DEFAULT 'DRAFT',
    note             TEXT         NULL,
    created_by       INT UNSIGNED NULL,
    approved_by      INT UNSIGNED NULL,
    approved_at      DATETIME     NULL,
    completed_by     INT UNSIGNED NULL,
    completed_at     DATETIME     NULL,
    cancelled_by     INT UNSIGNED NULL,
    cancelled_at     DATETIME     NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (to_warehouse_id)   REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)        REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (approved_by)       REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (completed_by)      REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (cancelled_by)      REFERENCES users(id)      ON DELETE SET NULL,
    INDEX idx_st_status  (status),
    INDEX idx_st_from_wh (from_warehouse_id),
    INDEX idx_st_to_wh   (to_warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.9. stock_transfer_items ───────────────────────────────────────
CREATE TABLE stock_transfer_items (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    transfer_id INT UNSIGNED NOT NULL,
    product_id  INT UNSIGNED NOT NULL,
    lot_id      INT UNSIGNED NULL,
    quantity    INT          NOT NULL,
    note        TEXT         NULL,
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id)  REFERENCES products(id)        ON DELETE RESTRICT,
    FOREIGN KEY (lot_id)      REFERENCES lots(id)            ON DELETE SET NULL,
    UNIQUE KEY uk_sti (transfer_id, product_id),
    INDEX idx_sti_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.10. purchase_requests (Đề nghị mua hàng — PR) ────────────────
CREATE TABLE purchase_requests (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pr_code      VARCHAR(30)  NOT NULL UNIQUE,
    warehouse_id INT UNSIGNED NULL,
    status       ENUM('DRAFT','PENDING','APPROVED','REJECTED','CONVERTED','CANCELLED')
                 NOT NULL DEFAULT 'DRAFT',
    priority     ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
    note         TEXT         NULL,
    reject_reason TEXT        NULL,
    requested_by INT UNSIGNED NULL,
    approved_by  INT UNSIGNED NULL,
    approved_at  DATETIME     NULL,
    rejected_by  INT UNSIGNED NULL,
    rejected_at  DATETIME     NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by)  REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (rejected_by)  REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_pr_status     (status),
    INDEX idx_pr_warehouse  (warehouse_id),
    INDEX idx_pr_requested_by (requested_by),
    INDEX idx_pr_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.11. purchase_request_items ────────────────────────────────────
CREATE TABLE purchase_request_items (
    id                  INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    pr_id               INT UNSIGNED   NOT NULL,
    product_id          INT UNSIGNED   NOT NULL,
    quantity            INT            NOT NULL,
    estimated_price     DECIMAL(18,6)  NULL,
    note                TEXT           NULL,
    FOREIGN KEY (pr_id)      REFERENCES purchase_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)          ON DELETE RESTRICT,
    UNIQUE KEY uk_pri (pr_id, product_id),
    INDEX idx_pri_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.12. purchase_orders (Đơn đặt hàng — PO) ──────────────────────
CREATE TABLE purchase_orders (
    id           INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    po_code      VARCHAR(30)    NOT NULL UNIQUE,
    pr_id        INT UNSIGNED   NULL COMMENT 'PR nguồn (nếu có)',
    supplier_id  INT UNSIGNED   NULL,
    warehouse_id INT UNSIGNED   NULL,
    status       ENUM('DRAFT','PENDING','APPROVED','ORDERED','COMPLETED','CANCELLED')
                 NOT NULL DEFAULT 'DRAFT',
    total_amount DECIMAL(18,6)  NOT NULL DEFAULT 0,
    expected_date DATE          NULL,
    delivery_date DATE          NULL,
    note         TEXT           NULL,
    created_by   INT UNSIGNED   NULL,
    confirmed_by INT UNSIGNED   NULL,
    confirmed_at DATETIME       NULL,
    approved_by  INT UNSIGNED   NULL,
    approved_at  DATETIME       NULL,
    received_by  INT UNSIGNED   NULL,
    received_at  DATETIME       NULL,
    completed_by INT UNSIGNED   NULL,
    completed_at DATETIME       NULL,
    cancelled_by INT UNSIGNED   NULL,
    cancelled_at DATETIME       NULL,
    created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (pr_id)        REFERENCES purchase_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id)  REFERENCES suppliers(id)  ON DELETE SET NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (confirmed_by) REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (approved_by)  REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (received_by)  REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (completed_by) REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (cancelled_by) REFERENCES users(id)      ON DELETE SET NULL,
    INDEX idx_po_status     (status),
    INDEX idx_po_supplier   (supplier_id),
    INDEX idx_po_warehouse  (warehouse_id),
    INDEX idx_po_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.13. purchase_order_items ──────────────────────────────────────
CREATE TABLE purchase_order_items (
    id                INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    po_id             INT UNSIGNED   NOT NULL,
    product_id        INT UNSIGNED   NOT NULL,
    quantity          INT            NOT NULL,
    unit_price        DECIMAL(18,6)  NOT NULL DEFAULT 0,
    total_price       DECIMAL(18,6)  NOT NULL DEFAULT 0,
    quantity_received INT            NOT NULL DEFAULT 0,
    note              TEXT           NULL,
    FOREIGN KEY (po_id)      REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)        ON DELETE RESTRICT,
    UNIQUE KEY uk_poi (po_id, product_id),
    INDEX idx_poi_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.14. return_orders (Phiếu trả hàng) ───────────────────────────
CREATE TABLE return_orders (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    return_code  VARCHAR(30)  NOT NULL UNIQUE,
    type         ENUM('EMPLOYEE_RETURN','SUPPLIER_RETURN') NOT NULL
                 COMMENT 'EMPLOYEE_RETURN=nhân viên trả→nhập kho; SUPPLIER_RETURN=trả NCC→xuất kho',
    status       ENUM('DRAFT','PENDING','APPROVED','COMPLETED','CANCELLED')
                 NOT NULL DEFAULT 'DRAFT',
    warehouse_id INT UNSIGNED NULL,
    supplier_id  INT UNSIGNED NULL COMMENT 'Chỉ dùng cho SUPPLIER_RETURN',
    reference_id INT UNSIGNED NULL COMMENT 'export_order.id hoặc import_order.id nguồn',
    note         TEXT         NULL,
    created_by   INT UNSIGNED NULL,
    approved_by  INT UNSIGNED NULL,
    approved_at  DATETIME     NULL,
    completed_by INT UNSIGNED NULL,
    completed_at DATETIME     NULL,
    cancelled_by INT UNSIGNED NULL,
    cancelled_at DATETIME     NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id)  REFERENCES suppliers(id)  ON DELETE SET NULL,
    FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (approved_by)  REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (completed_by) REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (cancelled_by) REFERENCES users(id)      ON DELETE SET NULL,
    INDEX idx_ro_status  (status),
    INDEX idx_ro_type    (type),
    INDEX idx_ro_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.15. return_items ──────────────────────────────────────────────
CREATE TABLE return_items (
    id              INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
    return_order_id INT UNSIGNED   NOT NULL,
    product_id      INT UNSIGNED   NOT NULL,
    lot_id          INT UNSIGNED   NULL,
    quantity        INT            NOT NULL,
    unit_price      DECIMAL(18,6)  NOT NULL DEFAULT 0,
    note            TEXT           NULL,
    FOREIGN KEY (return_order_id) REFERENCES return_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id)      REFERENCES products(id)      ON DELETE RESTRICT,
    FOREIGN KEY (lot_id)          REFERENCES lots(id)          ON DELETE SET NULL,
    UNIQUE KEY uk_ri (return_order_id, product_id),
    INDEX idx_retitem_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.16. stocktaking_sessions (Phiên kiểm kê) ─────────────────────
CREATE TABLE stocktaking_sessions (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_code VARCHAR(30)  NOT NULL UNIQUE,
    warehouse_id INT UNSIGNED NULL,
    status       ENUM('OPEN','COUNTING','CONFIRMED','CANCELLED')
                 NOT NULL DEFAULT 'OPEN',
    note         TEXT         NULL,
    created_by   INT UNSIGNED NULL,
    completed_by INT UNSIGNED NULL,
    confirmed_at DATETIME     NULL,
    cancelled_by INT UNSIGNED NULL,
    cancelled_at DATETIME     NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (completed_by) REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (cancelled_by) REFERENCES users(id)      ON DELETE SET NULL,
    INDEX idx_sks_status    (status),
    INDEX idx_sks_warehouse (warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.17. stocktaking_items ────────────────────────────────────────
CREATE TABLE stocktaking_items (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id          INT UNSIGNED NOT NULL,
    product_id          INT UNSIGNED NOT NULL,
    lot_id              INT UNSIGNED NULL,
    system_qty          INT          NOT NULL DEFAULT 0,
    actual_qty          INT          NULL,
    difference          INT          NULL COMMENT 'Chênh lệch = actual - system (manual update by code)',
    note                TEXT         NULL,
    FOREIGN KEY (session_id) REFERENCES stocktaking_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)             ON DELETE RESTRICT,
    FOREIGN KEY (lot_id)     REFERENCES lots(id)                 ON DELETE SET NULL,
    UNIQUE KEY uk_ski (session_id, product_id),
    INDEX idx_ski_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.18. import_logs ──────────────────────────────────────────────
CREATE TABLE import_logs (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    file_name  VARCHAR(255) NOT NULL,
    file_type  VARCHAR(50)  NULL,
    records    INT          NOT NULL DEFAULT 0,
    errors     INT          NOT NULL DEFAULT 0,
    status     ENUM('PROCESSING','SUCCESS','PARTIAL','FAILED') NOT NULL DEFAULT 'PROCESSING',
    error_log  TEXT         NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_il_status     (status),
    INDEX idx_il_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.19. inventory_adjustments [MỚI - BUS-001] ────────────────────
CREATE TABLE inventory_adjustments (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    adj_code     VARCHAR(30)  NOT NULL UNIQUE,
    warehouse_id INT UNSIGNED NOT NULL,
    product_id   INT UNSIGNED NOT NULL,
    old_qty      INT          NOT NULL,
    new_qty      INT          NOT NULL,
    delta        INT          NOT NULL,
    reason       TEXT         NOT NULL,
    note         TEXT         NULL,
    status       ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    created_by   INT UNSIGNED NOT NULL,
    approved_by  INT UNSIGNED NULL,
    approved_at  DATETIME     NULL,
    rejected_by  INT UNSIGNED NULL,
    rejected_at  DATETIME     NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id)   REFERENCES products(id)   ON DELETE CASCADE,
    FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE RESTRICT,
    FOREIGN KEY (approved_by)  REFERENCES users(id)      ON DELETE SET NULL,
    FOREIGN KEY (rejected_by)  REFERENCES users(id)      ON DELETE SET NULL,
    INDEX idx_adj_status     (status),
    INDEX idx_adj_warehouse  (warehouse_id),
    INDEX idx_adj_product    (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IV.20. department_quotas [MỚI - MISS-04] ──────────────────────
CREATE TABLE department_quotas (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    department_id INT UNSIGNED NOT NULL,
    year          SMALLINT NOT NULL,
    month         TINYINT NOT NULL,
    monthly_limit DECIMAL(18,6) NOT NULL DEFAULT 0,
    spent_amount  DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Cập nhật khi requisition được APPROVED',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    UNIQUE KEY uk_dept_month (department_id, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- ════════════════════════════════════════════════════════════════════
-- V. TRIGGERS
-- ════════════════════════════════════════════════════════════════════

-- ARCH-01: Sync products.stock_qty từ warehouse_stock (tổng toàn hệ thống)
DELIMITER $$

CREATE TRIGGER trg_ws_after_insert
AFTER INSERT ON warehouse_stock
FOR EACH ROW
BEGIN
    UPDATE products
    SET stock_qty = (
        SELECT COALESCE(SUM(stock_qty), 0)
        FROM warehouse_stock
        WHERE product_id = NEW.product_id
    ),
    reserved_quantity = (
        SELECT COALESCE(SUM(reserved_quantity), 0)
        FROM warehouse_stock
        WHERE product_id = NEW.product_id
    )
    WHERE id = NEW.product_id;
END$$

CREATE TRIGGER trg_ws_after_update
AFTER UPDATE ON warehouse_stock
FOR EACH ROW
BEGIN
    IF OLD.stock_qty != NEW.stock_qty OR OLD.reserved_quantity != NEW.reserved_quantity THEN
        UPDATE products
        SET stock_qty = (
            SELECT COALESCE(SUM(stock_qty), 0)
            FROM warehouse_stock
            WHERE product_id = NEW.product_id
        ),
        reserved_quantity = (
            SELECT COALESCE(SUM(reserved_quantity), 0)
            FROM warehouse_stock
            WHERE product_id = NEW.product_id
        )
        WHERE id = NEW.product_id;
    END IF;
END$$

CREATE TRIGGER trg_ws_after_delete
AFTER DELETE ON warehouse_stock
FOR EACH ROW
BEGIN
    UPDATE products
    SET stock_qty = (
        SELECT COALESCE(SUM(stock_qty), 0)
        FROM warehouse_stock
        WHERE product_id = OLD.product_id
    ),
    reserved_quantity = (
        SELECT COALESCE(SUM(reserved_quantity), 0)
        FROM warehouse_stock
        WHERE product_id = OLD.product_id
    )
    WHERE id = OLD.product_id;
END$$

DELIMITER ;


-- ════════════════════════════════════════════════════════════════════
-- V.2. VIEWS
-- ════════════════════════════════════════════════════════════════════

-- View: tồn kho khả dụng per kho per sản phẩm
CREATE OR REPLACE VIEW v_available_stock AS
SELECT
    ws.warehouse_id,
    w.name        AS warehouse_name,
    ws.product_id,
    p.sku,
    p.name        AS product_name,
    ws.stock_qty,
    ws.reserved_quantity,
    (ws.stock_qty - ws.reserved_quantity) AS available_qty,
    ws.avg_unit_price,
    (ws.stock_qty * ws.avg_unit_price)    AS total_value
FROM warehouse_stock ws
JOIN warehouses w ON w.id = ws.warehouse_id
JOIN products   p ON p.id = ws.product_id
WHERE w.deleted = 0 AND p.deleted = 0;

-- View: phiên bản schema hiện tại
CREATE OR REPLACE VIEW v_schema_version AS
SELECT version, applied_at
FROM schema_migrations
ORDER BY applied_at DESC
LIMIT 1;

-- ── IV.41. stock_summary (VIEW cho Dashboard) ───────────────────────
CREATE OR REPLACE VIEW stock_summary AS
SELECT
    (SELECT COUNT(*) FROM products WHERE deleted = 0) AS total_products,
    (SELECT COALESCE(SUM(stock_qty * price), 0) FROM products WHERE deleted = 0) AS total_stock_value,
    (SELECT COUNT(*) FROM products WHERE deleted = 0 AND stock_qty > 0 AND stock_qty <= min_stock_qty) AS low_stock_count,
    (SELECT COUNT(*) FROM products WHERE deleted = 0 AND stock_qty = 0) AS out_of_stock_count;


-- ════════════════════════════════════════════════════════════════════
-- VI. SEED DATA
-- ════════════════════════════════════════════════════════════════════

-- ── VI.1. Schema version ────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('v4.0.0');

-- ── VI.1.1 Departments ───────────────────────────────────────────
INSERT INTO departments (name, description) VALUES
('Phòng Hành chính', 'Quản lý nhân sự, văn phòng phẩm'),
('Phòng Kỹ thuật',   'Đội ngũ kỹ thuật, IT'),
('Phòng Kinh doanh', 'Đội ngũ sales và marketing'),
('Phòng Kế toán',    'Quản lý tài chính, ngân sách');

-- ── VI.2. Admin user (password = 'password', bcrypt cost=12) ────────

-- Hash: $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAeOcYWAHSNbHzUq
INSERT INTO users (username, password, full_name, email, role, department_id) VALUES
('admin', '$2a$12$PaHgQWoPmy0BxFXmiY9NIudcD3kISYXSHgD0YvLlOU65.yWFxZcbC', 'Quản trị viên', 'admin@qlvpp.local', 'ADMIN', 1),
('manager1', '$2a$12$PaHgQWoPmy0BxFXmiY9NIudcD3kISYXSHgD0YvLlOU65.yWFxZcbC', 'Nguyễn Quản Lý', 'manager@qlvpp.local', 'MANAGER', 2),
('warehouse1', '$2a$12$PaHgQWoPmy0BxFXmiY9NIudcD3kISYXSHgD0YvLlOU65.yWFxZcbC', 'Trần Thủ Kho', 'warehouse@qlvpp.local', 'WAREHOUSE', 1),
('user1', '$2a$12$PaHgQWoPmy0BxFXmiY9NIudcD3kISYXSHgD0YvLlOU65.yWFxZcbC', 'Lê Nhân Viên', 'user@qlvpp.local', 'USER', 3);


-- ── VI.3. Categories ────────────────────────────────────────────────
INSERT INTO categories (name, description) VALUES
('Văn phòng phẩm',  'Bút, mực, giấy, kẹp...'),
('Thiết bị điện tử','USB, cáp, pin...'),
('Dụng cụ văn phòng','Dao rọc, thước, kéo...'),
('Tài liệu in ấn',  'Giấy in, mực in...'),
('Khác',            'Vật phẩm khác');

-- ── VI.4. Units ─────────────────────────────────────────────────────
INSERT INTO units (name, symbol, is_base) VALUES
('Cái',   'pcs',  1),
('Hộp',   'box',  0),
('Cuộn',  'roll', 0),
('Ream',  'rm',   0),
('Quyển', 'bk',   0),
('Chiếc', 'pcs',  0),
('Thùng', 'ctn',  0),
('Gói',   'pkg',  0),
('Bộ',    'set',  0);

-- ── VI.5. Warehouses ────────────────────────────────────────────────
INSERT INTO warehouses (code, name, location, is_active, created_by) VALUES
('WH-001', 'Kho Chính', 'Tầng 1, Tòa nhà A', 1, 1),
('WH-002', 'Kho Phụ',   'Tầng 2, Tòa nhà B', 1, 1);

-- ── VI.6. User-Warehouse assignments ────────────────────────────────
INSERT INTO user_warehouses (user_id, warehouse_id, created_by)
SELECT u.id, w.id, 1
FROM users u JOIN warehouses w ON w.deleted = 0 AND w.is_active = 1
WHERE u.deleted = 0 AND u.role IN ('ADMIN','MANAGER','WAREHOUSE');

-- ── VI.7. Suppliers ─────────────────────────────────────────────────
INSERT INTO suppliers (code, name, contact_name, phone, email, active) VALUES
('NCC-001', 'Thiên Long Group',    'Nguyễn Văn A', '0901234567', 'thienlong@example.com', 1),
('NCC-002', 'Hải Tiến',            'Trần Thị B',   '0912345678', 'haitien@example.com',   1),
('NCC-003', 'Văn Phòng Phẩm ABC',  'Lê Văn C',     '0923456789', 'vppABC@example.com',    1);

-- ── VI.8. Products ──────────────────────────────────────────────────
INSERT INTO products (sku, name, category_id, unit, price, avg_unit_price, stock_qty, min_stock_qty, description) VALUES
('VPP-001', 'Bút bi xanh Thiên Long',  1, 'Cái',    3500,   3500,  100, 20, 'Bút bi mực xanh, ngòi 0.7mm'),
('VPP-002', 'Bút bi đỏ Thiên Long',    1, 'Cái',    3500,   3500,   80, 20, 'Bút bi mực đỏ, ngòi 0.7mm'),
('VPP-003', 'Giấy A4 IK Yellow 80gsm', 4, 'Ream',  85000,  85000,   50, 10, 'Giấy in A4 500 tờ/ream'),
('VPP-004', 'Kẹp bướm 32mm',           1, 'Cái',    2000,   2000,  200, 50, 'Kẹp bướm kim loại 32mm'),
('VPP-005', 'Ghim bấm 26/6',           1, 'Hộp',    5000,   5000,  150, 30, 'Ghim bấm 1000 cái/hộp'),
('VPP-006', 'USB Kingston 32GB',       2, 'Cái',  185000, 185000,   30,  5, 'USB 3.0, tốc độ cao'),
('VPP-007', 'Mực in HP 85A',           4, 'Hộp',  420000, 420000,   15,  3, 'Hộp mực in đen HP LaserJet'),
('VPP-008', 'Băng keo trong 2cm',      1, 'Cuộn',   8000,   8000,  100, 20, 'Băng keo trong 2cm x 45m'),
('VPP-009', 'Dao rọc giấy nhỏ',        3, 'Cái',   12000,  12000,   60, 10, 'Dao rọc giấy 9mm'),
('VPP-010', 'Sổ tay A5 bìa cứng',      1, 'Quyển', 35000,  35000,   40, 10, 'Sổ tay 200 trang, bìa cứng');

-- ── VI.9. Warehouse Stock (init từ products) ─────────────────────────
CREATE TEMPORARY TABLE tmp_init_stock AS 
SELECT id, stock_qty, avg_unit_price FROM products WHERE deleted = 0;

INSERT INTO warehouse_stock (warehouse_id, product_id, stock_qty, reserved_quantity, avg_unit_price)
SELECT 1, id, stock_qty, 0, avg_unit_price
FROM tmp_init_stock;

DROP TEMPORARY TABLE tmp_init_stock;

-- ── VI.10. Stock ledger khởi tạo (initial balance) ───────────────────
-- Ghi nhận trạng thái ban đầu vào ledger (không có transaction nguồn,
-- dùng reference_type='INIT' để phân biệt)
-- Sẽ được tạo bởi seed script, không cần transaction_id thật ở đây.

-- ── VI.11. Department Quotas ──────────────────────────────────────────
INSERT INTO department_quotas (department_id, year, month, monthly_limit) VALUES
(1, 2026, 5, 50000000), -- 50M
(2, 2026, 5, 20000000), -- 20M
(3, 2026, 5, 10000000), -- 10M
(4, 2026, 5, 5000000);   -- 5M

-- ── VI.12. Snapshot ngày khởi tạo ───────────────────────────────────

INSERT INTO stock_snapshot_daily (snapshot_date, warehouse_id, product_id, stock_qty, reserved_quantity, avg_unit_price, total_value)
SELECT
    CURDATE(),
    ws.warehouse_id,
    ws.product_id,
    ws.stock_qty,
    ws.reserved_quantity,
    ws.avg_unit_price,
    (ws.stock_qty * ws.avg_unit_price)
FROM warehouse_stock ws;


SET FOREIGN_KEY_CHECKS = 1;

-- ════════════════════════════════════════════════════════════════════
-- END OF SCHEMA v4.0.0
-- Tổng: 39 bảng | 3 triggers | 2 views
-- ════════════════════════════════════════════════════════════════════