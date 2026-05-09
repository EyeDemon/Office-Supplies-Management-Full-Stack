-- ============================================================
-- QLVPP Seed Data v4.0.0
-- File: packages/db/seed/seed.sql
--
-- MỤC ĐÍCH:
--   Tách biệt data khởi tạo khỏi schema.sql theo MONOREPO_STRUCTURE.
--   File này chỉ chứa INSERT — KHÔNG DROP / CREATE table.
--   Chạy SAU schema.sql (hoặc migration).
--
-- CÁCH DÙNG:
--   mysql -u root -p qlvpp < packages/db/seed/seed.sql
--   # hoặc từ root:
--   npm run db:seed
--
-- MÔI TRƯỜNG:
--   Development / Staging chỉ. KHÔNG chạy trên Production
--   (dữ liệu thật).
--
-- TÀI KHOẢN MẶC ĐỊNH (password = "password"):
--   admin      / ADMIN     — toàn quyền
--   manager1   / MANAGER   — duyệt phiếu
--   warehouse1 / WAREHOUSE — xuất nhập kho
--   user1      / USER      — tạo yêu cầu
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ════════════════════════════════════════════════════════════════
-- Xóa data cũ (idempotent — có thể chạy lại nhiều lần)
-- Thứ tự: FK child trước, FK parent sau
-- ════════════════════════════════════════════════════════════════
DELETE FROM stock_snapshot_daily;
DELETE FROM stock_ledger;
DELETE FROM stock_transactions;
DELETE FROM warehouse_stock;
DELETE FROM user_warehouses;
DELETE FROM products;
DELETE FROM suppliers;
DELETE FROM warehouses;
DELETE FROM units;
DELETE FROM categories;
DELETE FROM users WHERE username IN ('admin','manager1','warehouse1','user1');

-- ════════════════════════════════════════════════════════════════
-- I. USERS
-- Hash bcrypt cost=12 cho password "password"
-- $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAeOcYWAHSNbHzUq
-- ════════════════════════════════════════════════════════════════
INSERT INTO users (username, password, full_name, email, role, active) VALUES
('admin',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAeOcYWAHSNbHzUq',
 'Quản Trị Viên', 'admin@qlvpp.local', 'ADMIN', 1),
('manager1',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAeOcYWAHSNbHzUq',
 'Nguyễn Quản Lý', 'manager@qlvpp.local', 'MANAGER', 1),
('warehouse1',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAeOcYWAHSNbHzUq',
 'Trần Thủ Kho', 'warehouse@qlvpp.local', 'WAREHOUSE', 1),
('user1',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAeOcYWAHSNbHzUq',
 'Lê Nhân Viên', 'user@qlvpp.local', 'USER', 1);

-- ════════════════════════════════════════════════════════════════
-- II. CATEGORIES
-- ════════════════════════════════════════════════════════════════
INSERT INTO categories (name, description) VALUES
('Văn phòng phẩm',   'Bút, mực, giấy, kẹp...'),
('Thiết bị điện tử', 'USB, cáp, pin, adapter...'),
('Dụng cụ văn phòng','Dao rọc, thước, kéo, máy bấm...'),
('Tài liệu in ấn',   'Giấy in, mực in, toner...'),
('Khác',             'Vật phẩm văn phòng khác');

-- ════════════════════════════════════════════════════════════════
-- III. UNITS
-- is_base = 1 → đơn vị lưu kho gốc
-- ════════════════════════════════════════════════════════════════
INSERT INTO units (name, symbol, is_base) VALUES
('Cái',   'pcs',  1),  -- base unit
('Hộp',   'box',  0),
('Cuộn',  'roll', 0),
('Ream',  'rm',   0),
('Quyển', 'bk',   0),
('Chiếc', 'pcs',  0),
('Thùng', 'ctn',  0),
('Gói',   'pkg',  0),
('Bộ',    'set',  0);

-- ════════════════════════════════════════════════════════════════
-- IV. WAREHOUSES
-- ════════════════════════════════════════════════════════════════
INSERT INTO warehouses (code, name, location, is_active, created_by) VALUES
('WH-001', 'Kho Chính', 'Tầng 1, Tòa nhà A', 1, 1),
('WH-002', 'Kho Phụ',   'Tầng 2, Tòa nhà B', 1, 1);

-- ════════════════════════════════════════════════════════════════
-- V. USER-WAREHOUSE ASSIGNMENTS
-- Admin, Manager, Warehouse staff → gán vào tất cả kho
-- ════════════════════════════════════════════════════════════════
INSERT INTO user_warehouses (user_id, warehouse_id, created_by)
SELECT u.id, w.id, 1
FROM   users u
JOIN   warehouses w ON w.deleted = 0 AND w.is_active = 1
WHERE  u.deleted = 0
AND    u.role IN ('ADMIN', 'MANAGER', 'WAREHOUSE');

-- ════════════════════════════════════════════════════════════════
-- VI. SUPPLIERS
-- ════════════════════════════════════════════════════════════════
INSERT INTO suppliers (code, name, contact_name, phone, email, active) VALUES
('NCC-001', 'Thiên Long Group',   'Nguyễn Văn A', '0901234567', 'thienlong@example.com', 1),
('NCC-002', 'Hải Tiến',           'Trần Thị B',   '0912345678', 'haitien@example.com',   1),
('NCC-003', 'Văn Phòng Phẩm ABC', 'Lê Văn C',     '0923456789', 'vppABC@example.com',    1);

-- ════════════════════════════════════════════════════════════════
-- VII. PRODUCTS
-- category_id: 1=Văn phòng, 2=Điện tử, 3=Dụng cụ, 4=In ấn, 5=Khác
-- ════════════════════════════════════════════════════════════════
INSERT INTO products
  (sku, name, category_id, unit, price, avg_unit_price, stock_qty, min_stock_qty, description)
VALUES
('VPP-001', 'Bút bi xanh Thiên Long',   1, 'Cái',     3500,   3500, 100, 20, 'Bút bi mực xanh, ngòi 0.7mm'),
('VPP-002', 'Bút bi đỏ Thiên Long',     1, 'Cái',     3500,   3500,  80, 20, 'Bút bi mực đỏ, ngòi 0.7mm'),
('VPP-003', 'Giấy A4 IK Yellow 80gsm', 4, 'Ream',   85000,  85000,  50, 10, 'Giấy in A4 500 tờ/ream'),
('VPP-004', 'Kẹp bướm 32mm',            1, 'Cái',     2000,   2000, 200, 50, 'Kẹp bướm kim loại 32mm'),
('VPP-005', 'Ghim bấm 26/6',            1, 'Hộp',     5000,   5000, 150, 30, 'Ghim bấm 1000 cái/hộp'),
('VPP-006', 'USB Kingston 32GB',        2, 'Cái',   185000, 185000,  30,  5, 'USB 3.0, tốc độ đọc 130MB/s'),
('VPP-007', 'Mực in HP 85A',            4, 'Hộp',   420000, 420000,  15,  3, 'Hộp mực in đen HP LaserJet'),
('VPP-008', 'Băng keo trong 2cm',       1, 'Cuộn',    8000,   8000, 100, 20, 'Băng keo trong 2cm x 45m'),
('VPP-009', 'Dao rọc giấy nhỏ',         3, 'Cái',    12000,  12000,  60, 10, 'Dao rọc giấy 9mm, lưỡi thay thế'),
('VPP-010', 'Sổ tay A5 bìa cứng',       1, 'Quyển',  35000,  35000,  40, 10, 'Sổ tay 200 trang, bìa cứng'),
('VPP-011', 'Bút dạ quang vàng',        1, 'Cái',     8000,   8000,  90, 15, 'Bút highlight màu vàng'),
('VPP-012', 'Bộ kẹp tài liệu A4',       3, 'Bộ',     25000,  25000,  35,  8, 'Bộ 12 cái kẹp nhựa A4'),
('VPP-013', 'Cáp USB-C 1m',             2, 'Cái',    45000,  45000,  20,  5, 'Cáp sạc USB-C 2.0, 1 mét'),
('VPP-014', 'Giấy note 3x3 vàng',       1, 'Gói',    12000,  12000,  75, 20, '100 tờ/gói, tự dính'),
('VPP-015', 'Thước kẻ nhựa 30cm',       3, 'Cái',     5000,   5000,  50, 10, 'Thước kẻ nhựa trong suốt 30cm');

-- ════════════════════════════════════════════════════════════════
-- VIII. WAREHOUSE STOCK — khởi tạo tồn kho ban đầu cho Kho Chính
-- warehouse_id = 1 (WH-001 Kho Chính)
-- ════════════════════════════════════════════════════════════════
INSERT INTO warehouse_stock (warehouse_id, product_id, stock_qty, reserved_quantity, avg_unit_price)
SELECT 1, id, stock_qty, 0, avg_unit_price
FROM   products
WHERE  deleted = 0;

-- Kho Phụ (WH-002) khởi đầu không có hàng
-- (Sẽ nhập hàng thông qua luồng Transfer hoặc Inbound)

-- ════════════════════════════════════════════════════════════════
-- IX. STOCK SNAPSHOT — snapshot ngày khởi tạo
-- Ghi lại trạng thái ban đầu để báo cáo Nhập-Xuất-Tồn hoạt động
-- ════════════════════════════════════════════════════════════════
INSERT INTO stock_snapshot_daily
  (snapshot_date, warehouse_id, product_id, stock_qty, reserved_quantity, avg_unit_price, total_value)
SELECT
    CURDATE()           AS snapshot_date,
    ws.warehouse_id,
    ws.product_id,
    ws.stock_qty,
    ws.reserved_quantity,
    ws.avg_unit_price,
    (ws.stock_qty * ws.avg_unit_price) AS total_value
FROM warehouse_stock ws;

-- ════════════════════════════════════════════════════════════════
-- X. STOCK LEDGER — balance khởi đầu
-- reference_type='INIT' để phân biệt với giao dịch thật
-- ════════════════════════════════════════════════════════════════
INSERT INTO stock_ledger
  (warehouse_id, product_id, transaction_id, transaction_type,
   quantity_before, quantity_change, quantity_after,
   cost_per_unit, reference_type, note, created_by)
SELECT
    ws.warehouse_id,
    ws.product_id,
    NULL                    AS transaction_id,
    'INIT'                  AS transaction_type,
    0                       AS quantity_before,
    ws.stock_qty            AS quantity_change,
    ws.stock_qty            AS quantity_after,
    ws.avg_unit_price       AS cost_per_unit,
    'INIT'                  AS reference_type,
    'Số dư đầu kỳ (seed)'  AS note,
    1                       AS created_by
FROM warehouse_stock ws;

-- ════════════════════════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════════════════════════
SET FOREIGN_KEY_CHECKS = 1;

-- Kiểm tra nhanh sau khi seed
SELECT
    'users'     AS tbl, COUNT(*) AS rows FROM users     WHERE deleted = 0
UNION ALL SELECT 'products',   COUNT(*) FROM products   WHERE deleted = 0
UNION ALL SELECT 'warehouses', COUNT(*) FROM warehouses WHERE deleted = 0
UNION ALL SELECT 'wh_stock',   COUNT(*) FROM warehouse_stock;
