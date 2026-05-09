-- ============================================================
-- QLVPP Golden Seed v4.0.0 (Corrected & Aligned)
-- File: packages/db/seed/seed_v4.sql
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. CLEANUP ALL TRANSACTIONAL DATA
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

-- 2. IMPORT ORDERS (Phiếu nhập kho)
INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, created_at)
VALUES (1, 'PN-20260501-0001', 1, 1, 'DRAFT', 350000, 'Phiếu nháp đang nhập liệu', 3, NOW());
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (1, 1, 100, 3500, 350000);

INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, submitted_by, submitted_at, created_at)
VALUES (2, 'PN-20260501-0002', 2, 1, 'PENDING', 4250000, 'Phiếu chờ duyệt manager', 3, 3, NOW(), NOW());
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (2, 3, 50, 85000, 4250000);

INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, submitted_by, submitted_at, approved_by, approved_at, created_at)
VALUES (3, 'PN-20260501-0003', 1, 1, 'APPROVED', 70000, 'Đã duyệt - chờ nhận hàng', 3, 3, NOW(), 2, NOW(), NOW());
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (3, 1, 20, 3500, 70000);

INSERT INTO import_orders (id, order_code, supplier_id, warehouse_id, status, total_amount, note, created_by, submitted_by, submitted_at, approved_by, approved_at, completed_by, completed_at, created_at)
VALUES (4, 'PN-20260501-0004', 3, 1, 'COMPLETED', 1850000, 'Đã hoàn tất nhập kho', 3, 3, NOW(), 2, NOW(), 3, NOW(), NOW());
INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price)
VALUES (4, 6, 10, 185000, 1850000);

-- 3. REQUISITIONS (Yêu cầu cấp phát)
INSERT INTO requisitions (id, req_code, status, requester_id, warehouse_id, note, created_at)
VALUES (1, 'YC-20260501-0001', 'PENDING', 4, 1, 'Cấp phát bút cho phòng HC', NOW());
INSERT INTO requisition_items (requisition_id, product_id, quantity_requested, note)
VALUES (1, 1, 5, 'Bút xanh');

INSERT INTO requisitions (id, req_code, status, requester_id, warehouse_id, approved_by, approved_at, note, created_at)
VALUES (2, 'YC-20260501-0002', 'APPROVED', 4, 1, 2, NOW(), 'Đã duyệt - chờ kho xuất', NOW());
INSERT INTO requisition_items (requisition_id, product_id, quantity_requested, quantity_approved)
VALUES (2, 3, 2, 2);

INSERT INTO requisitions (id, req_code, status, requester_id, warehouse_id, approved_by, approved_at, warehouse_confirmed_by, warehouse_confirmed_at, note, created_at)
VALUES (3, 'YC-20260501-0003', 'WAREHOUSE_CONFIRMED', 4, 1, 2, NOW(), 3, NOW(), 'Đã nhận hàng', NOW());
INSERT INTO requisition_items (requisition_id, product_id, quantity_requested, quantity_approved)
VALUES (3, 15, 1, 1);

-- 4. PURCHASE REQUESTS (Yêu cầu mua hàng)
INSERT INTO purchase_requests (id, pr_code, status, warehouse_id, requested_by, priority, note, created_at)
VALUES (1, 'PR-20260501-0001', 'PENDING', 1, 2, 'NORMAL', 'Yêu cầu mua thêm giấy A4', NOW());
INSERT INTO purchase_request_items (pr_id, product_id, quantity, estimated_price)
VALUES (1, 3, 100, 80000);

INSERT INTO purchase_requests (id, pr_code, status, warehouse_id, requested_by, approved_by, approved_at, priority, note, created_at)
VALUES (2, 'PR-20260501-0002', 'APPROVED', 1, 2, 1, NOW(), 'HIGH', 'Đã duyệt mua USB', NOW());
INSERT INTO purchase_request_items (pr_id, product_id, quantity, estimated_price)
VALUES (2, 6, 50, 180000);

-- 5. STOCKTAKING (Kiểm kê)
INSERT INTO stocktaking_sessions (id, session_code, status, warehouse_id, created_by, note, created_at)
VALUES (1, 'KK-20260501-0001', 'OPEN', 1, 3, 'Kiểm kê định kỳ tháng 5', NOW());
INSERT INTO stocktaking_items (session_id, product_id, system_qty)
VALUES (1, 1, 100), (1, 2, 80);

INSERT INTO stocktaking_sessions (id, session_code, status, warehouse_id, created_by, completed_by, confirmed_at, note, created_at)
VALUES (2, 'KK-20260501-0002', 'CONFIRMED', 1, 3, 3, NOW(), 'Hoàn tất kiểm kê khớp 100%', NOW());
INSERT INTO stocktaking_items (session_id, product_id, system_qty, actual_qty, difference)
VALUES (2, 4, 200, 200, 0);

-- 6. STOCK TRANSFERS (Điều chuyển)
INSERT INTO stock_transfers (id, transfer_code, status, from_warehouse_id, to_warehouse_id, created_by, note, created_at)
VALUES (1, 'DC-20260501-0001', 'PENDING', 1, 2, 3, 'Chuyển hàng sang kho phụ', NOW());
INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
VALUES (1, 1, 50);

-- 7. NOTIFICATIONS
INSERT INTO notifications (user_id, product_id, type, title, message, is_read, created_at)
VALUES (1, 1, 'LOW_STOCK', 'Cảnh báo tồn kho thấp', 'Sản phẩm Bút Bi Thiên Long sắp hết hàng.', 0, NOW());

SET FOREIGN_KEY_CHECKS = 1;
