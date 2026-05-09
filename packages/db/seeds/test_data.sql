-- ============================================================
-- QLVPP Test Workflow Data
-- File: packages/db/seed/test_data.sql
-- Purpose: Adds sample workflow data for testing all system functions.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. CLEANUP (Only workflow tables)
DELETE FROM import_order_items;
DELETE FROM import_orders;
DELETE FROM requisition_items;
DELETE FROM requisitions;
DELETE FROM purchase_request_items;
DELETE FROM purchase_requests;
DELETE FROM purchase_order_items;
DELETE FROM purchase_orders;
DELETE FROM stocktaking_items;
DELETE FROM stocktaking_sessions;
DELETE FROM stock_transfers;
DELETE FROM stock_transfer_items;

-- 2. IMPORT ORDERS (Phiếu nhập kho)
-- PN-001: DRAFT
INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, created_at)
VALUES (1, 'PN-20260501-0001', 1, 1, 'DRAFT', 350000, 'Phiếu nháp đang nhập liệu', 3, NOW());
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (1, 1, 100, 3500, 350000);

-- PN-002: PENDING
INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, submitted_by, submitted_at, created_at)
VALUES (2, 'PN-20260501-0002', 2, 1, 'PENDING', 4250000, 'Phiếu chờ duyệt manager', 3, 3, NOW(), NOW());
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (2, 3, 50, 85000, 4250000);

-- PN-003: APPROVED
INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, submitted_by, submitted_at, approved_by, approved_at, created_at)
VALUES (3, 'PN-20260501-0003', 1, 1, 'APPROVED', 70000, 'Đã duyệt - chờ nhận hàng', 3, 3, NOW(), 2, NOW(), NOW());
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (3, 1, 20, 3500, 70000);

-- PN-004: COMPLETED
INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, submitted_by, submitted_at, approved_by, approved_at, completed_by, completed_at, created_at)
VALUES (4, 'PN-20260501-0004', 3, 1, 'COMPLETED', 1850000, 'Đã hoàn tất nhập kho', 3, 3, NOW(), 2, NOW(), 3, NOW(), NOW());
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (4, 6, 10, 185000, 1850000);


-- 3. REQUISITIONS (Yêu cầu cấp phát)
-- YC-001: PENDING
INSERT INTO requisitions (id, req_code, status, requester_id, warehouse_id, note, created_at)
VALUES (1, 'YC-20260501-0001', 'PENDING', 4, 1, 'Cấp phát bút cho phòng HC', NOW());
INSERT INTO requisition_items (requisition_id, product_id, quantity_requested, note)
VALUES (1, 1, 5, 'Bút xanh');

-- YC-002: APPROVED (Stock reserved)
INSERT INTO requisitions (id, req_code, status, requester_id, warehouse_id, approved_by, approved_at, note, created_at)
VALUES (2, 'YC-20260501-0002', 'APPROVED', 4, 1, 2, NOW(), 'Đã duyệt - chờ kho xuất', NOW());
INSERT INTO requisition_items (requisition_id, product_id, quantity_requested, quantity_approved)
VALUES (2, 3, 2, 2);
-- Update reserved_quantity in warehouse_stock
UPDATE warehouse_stock SET reserved_quantity = reserved_quantity + 2 WHERE warehouse_id = 1 AND product_id = 3;

-- YC-003: WAREHOUSE_CONFIRMED (Completed)
INSERT INTO requisitions (id, req_code, status, requester_id, warehouse_id, approved_by, approved_at, warehouse_confirmed_by, warehouse_confirmed_at, note, created_at)
VALUES (3, 'YC-20260501-0003', 'WAREHOUSE_CONFIRMED', 4, 1, 2, NOW(), 3, NOW(), 'Đã nhận hàng', NOW());
INSERT INTO requisition_items (requisition_id, product_id, quantity_requested, quantity_approved)
VALUES (3, 15, 1, 1);


-- 4. PURCHASE REQUESTS (Yêu cầu mua hàng)
-- PR-001: PENDING
INSERT INTO purchase_requests (id, pr_code, status, supplier_id, warehouse_id, created_by, note, created_at)
VALUES (1, 'PR-20260501-0001', 'PENDING', 1, 1, 2, 'Yêu cầu mua thêm giấy A4', NOW());
INSERT INTO purchase_request_items (purchase_request_id, product_id, quantity, estimated_unit_price)
VALUES (1, 3, 100, 80000);

-- PR-002: APPROVED
INSERT INTO purchase_requests (id, pr_code, status, supplier_id, warehouse_id, created_by, approved_by, approved_at, note, created_at)
VALUES (2, 'PR-20260501-0002', 'APPROVED', 2, 1, 2, 1, NOW(), 'Đã duyệt mua USB', NOW());
INSERT INTO purchase_request_items (purchase_request_id, product_id, quantity, estimated_unit_price)
VALUES (2, 6, 50, 180000);


-- 5. STOCKTAKING (Kiểm kê)
-- KK-001: OPEN
INSERT INTO stocktaking_sessions (id, session_code, status, warehouse_id, created_by, note, created_at)
VALUES (1, 'KK-20260501-0001', 'OPEN', 1, 3, 'Kiểm kê định kỳ tháng 5', NOW());
INSERT INTO stocktaking_items (session_id, product_id, system_qty)
VALUES (1, 1, 100), (1, 2, 80);

-- KK-002: COMPLETED
INSERT INTO stocktaking_sessions (id, session_code, status, warehouse_id, created_by, completed_by, completed_at, note, created_at)
VALUES (2, 'KK-20260501-0002', 'COMPLETED', 1, 3, 3, NOW(), 'Hoàn tất kiểm kê khớp 100%', NOW());
INSERT INTO stocktaking_items (session_id, product_id, system_qty, actual_qty, difference)
VALUES (2, 4, 200, 200, 0);


-- 6. STOCK TRANSFERS (Điều chuyển)
-- DC-001: PENDING
INSERT INTO stock_transfers (id, transfer_code, status, from_warehouse_id, to_warehouse_id, created_by, note, created_at)
VALUES (1, 'DC-20260501-0001', 'PENDING', 1, 2, 3, 'Chuyển hàng sang kho phụ', NOW());
INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
VALUES (1, 1, 50);


-- 7. RECENT TRANSACTIONS (For Dashboard Charts)
INSERT INTO stock_transactions (warehouse_id, product_id, type, quantity, stock_before, stock_after, created_by, created_at)
VALUES 
(1, 1, 'IMPORT', 100, 0, 100, 3, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(1, 3, 'IMPORT', 50, 0, 50, 3, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(1, 1, 'EXPORT', 10, 100, 90, 3, NOW()),
(1, 6, 'IMPORT', 10, 30, 40, 3, NOW());


-- 8. AUDIT LOGS
INSERT INTO audit_logs (entity_type, entity_id, action, changed_by, ip_address, after_data, created_at)
VALUES 
('import_order', 4, 'COMPLETE', 3, '127.0.0.1', '{"status":"COMPLETED"}', NOW()),
('requisition', 3, 'CONFIRM', 3, '127.0.0.1', '{"status":"WAREHOUSE_CONFIRMED"}', NOW()),
('product', 1, 'UPDATE', 1, '127.0.0.1', '{"price":3500}', NOW());


SET FOREIGN_KEY_CHECKS = 1;
