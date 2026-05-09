-- ============================================================
-- QLVPP Real-World Simulation Data v4.3 (Complete Coverage)
-- File: packages/db/seed/real_world_data.sql
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 0. FIX SCHEMA GAPS
SET @dbname = DATABASE();
SET @tablename = 'export_orders';
SET @columnname = 'requisition_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE export_orders ADD COLUMN requisition_id INT UNSIGNED NULL AFTER warehouse_id, ADD CONSTRAINT fk_eo_requisition FOREIGN KEY (requisition_id) REFERENCES requisitions(id) ON DELETE SET NULL'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1. CLEANUP ALL TRANSACTIONAL DATA
TRUNCATE TABLE general_audit_log;
TRUNCATE TABLE login_audit_log;
TRUNCATE TABLE notifications;
TRUNCATE TABLE stock_transactions;
TRUNCATE TABLE stock_ledger;
TRUNCATE TABLE stock_snapshot_daily;
TRUNCATE TABLE import_order_items;
TRUNCATE TABLE import_orders;
TRUNCATE TABLE export_order_items;
TRUNCATE TABLE export_orders;
TRUNCATE TABLE requisition_items;
TRUNCATE TABLE requisitions;
TRUNCATE TABLE purchase_request_items;
TRUNCATE TABLE purchase_requests;
TRUNCATE TABLE purchase_order_items;
TRUNCATE TABLE purchase_orders;
TRUNCATE TABLE stocktaking_items;
TRUNCATE TABLE stocktaking_sessions;
TRUNCATE TABLE stock_transfers;
TRUNCATE TABLE stock_transfer_items;
TRUNCATE TABLE return_items;
TRUNCATE TABLE return_orders;
TRUNCATE TABLE warehouse_locations;
TRUNCATE TABLE lots;
TRUNCATE TABLE unit_conversions;
TRUNCATE TABLE price_history;
TRUNCATE TABLE import_logs;

-- 2. MASTER DATA ENHANCEMENT
INSERT INTO warehouse_locations (warehouse_id, code, name) VALUES
(1, 'A1-01', 'Kệ VPP Tầng 1'), (1, 'B2-05', 'Kệ Thiết bị Tầng 2'), (2, 'S1-01', 'Kho phụ A');

INSERT INTO unit_conversions (from_unit_id, to_unit_id, ratio, note) VALUES
(2, 1, 12, '1 Hộp = 12 Cái'), (7, 2, 10, '1 Thùng = 10 Hộp');

INSERT INTO lots (product_id, batch_code, expiry_date, quantity_in) VALUES
(7, 'LOT-HP-2024', '2026-12-31', 50), (6, 'LOT-KS-32GB', NULL, 100);

-- 3. RE-INITIALIZE STOCK
UPDATE warehouse_stock SET stock_qty = 100, reserved_quantity = 0;

-- 4. IMPORT ORDERS
INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, submitted_by, approved_by, completed_by, created_at)
VALUES (10, 'PN-20260425-0001', 1, 1, 'COMPLETED', 1500000, 'Nhập lô hàng tháng 4', 3, 3, 2, 3, DATE_SUB(NOW(), INTERVAL 7 DAY));
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (10, 1, 200, 3500, 700000), (10, 3, 10, 80000, 800000);

-- 5. REQUISITIONS & EXPORT ORDERS
INSERT INTO requisitions (id, req_code, status, requester_id, warehouse_id, approved_by, warehouse_confirmed_by, created_at)
VALUES (10, 'YC-20260428-0015', 'WAREHOUSE_CONFIRMED', 4, 1, 2, 3, DATE_SUB(NOW(), INTERVAL 4 DAY));
INSERT INTO requisition_items (requisition_id, product_id, quantity, approved_qty)
VALUES (10, 1, 10, 10), (10, 15, 2, 2);

INSERT INTO export_orders (id, order_code, status, warehouse_id, requisition_id, recipient_name, created_by, approved_by, completed_by, created_at)
VALUES (10, 'PX-20260428-0015', 'COMPLETED', 1, 10, 'Nguyễn Văn A (HC)', 3, 2, 3, DATE_SUB(NOW(), INTERVAL 4 DAY));
INSERT INTO export_order_items (order_id, product_id, quantity)
VALUES (10, 1, 10), (10, 15, 2);

-- 6. STOCK TRANSFERS
INSERT INTO stock_transfers (id, transfer_code, status, from_warehouse_id, to_warehouse_id, created_by, note, created_at)
VALUES (10, 'DC-20260502-0001', 'COMPLETED', 1, 2, 3, 'Chuyển hàng sang kho phụ', DATE_SUB(NOW(), INTERVAL 1 DAY));
INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
VALUES (10, 1, 50);

-- 7. STOCK SNAPSHOTS
INSERT INTO stock_snapshot_daily (snapshot_date, warehouse_id, product_id, stock_qty, reserved_quantity, avg_unit_price, total_value)
SELECT DATE_SUB(CURDATE(), INTERVAL seq.n DAY), 1, p.id, 100 + (seq.n * 5), 0, p.price, (100 + seq.n * 5) * p.price
FROM products p
CROSS JOIN (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) seq;

-- 8. NOTIFICATIONS & AUDIT
INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES
(1, 'SYSTEM', 'Hệ thống đã sẵn sàng', 'Dữ liệu mẫu v4.3 đã được nạp thành công.', 0, NOW()),
(2, 'REQUISITION_PENDING', 'Yêu cầu mới', 'Có phiếu yêu cầu chờ phê duyệt.', 0, NOW());

INSERT INTO login_audit_log (username, ip_address, success) VALUES ('admin', '127.0.0.1', 1);
INSERT INTO general_audit_log (entity_type, entity_id, action, changed_by, after_data) VALUES
('product', 1, 'UPDATE', 1, '{"price":3500}');

SET FOREIGN_KEY_CHECKS = 1;
