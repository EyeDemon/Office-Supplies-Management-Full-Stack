-- Migration: v4.1.0 — Add reserved_quantity to products and update triggers
-- Created: 2026-05-02

-- 1. Thêm cột reserved_quantity vào bảng products
ALTER TABLE products 
ADD COLUMN reserved_quantity INT NOT NULL DEFAULT 0 
AFTER stock_qty;

-- 2. Cập nhật dữ liệu hiện tại (tính tổng từ warehouse_stock)
UPDATE products p
SET p.reserved_quantity = (
    SELECT COALESCE(SUM(ws.reserved_quantity), 0)
    FROM warehouse_stock ws
    WHERE ws.product_id = p.id
);

-- 3. Cập nhật các Triggers để đồng bộ tự động
DELIMITER $$

DROP TRIGGER IF EXISTS trg_ws_after_insert;
CREATE TRIGGER trg_ws_after_insert
AFTER INSERT ON warehouse_stock
FOR EACH ROW
BEGIN
    UPDATE products
    SET stock_qty = (SELECT COALESCE(SUM(stock_qty), 0) FROM warehouse_stock WHERE product_id = NEW.product_id),
        reserved_quantity = (SELECT COALESCE(SUM(reserved_quantity), 0) FROM warehouse_stock WHERE product_id = NEW.product_id)
    WHERE id = NEW.product_id;
END$$

DROP TRIGGER IF EXISTS trg_ws_after_update;
CREATE TRIGGER trg_ws_after_update
AFTER UPDATE ON warehouse_stock
FOR EACH ROW
BEGIN
    IF OLD.stock_qty != NEW.stock_qty OR OLD.reserved_quantity != NEW.reserved_quantity THEN
        UPDATE products
        SET stock_qty = (SELECT COALESCE(SUM(stock_qty), 0) FROM warehouse_stock WHERE product_id = NEW.product_id),
            reserved_quantity = (SELECT COALESCE(SUM(reserved_quantity), 0) FROM warehouse_stock WHERE product_id = NEW.product_id)
        WHERE id = NEW.product_id;
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_after_delete;
CREATE TRIGGER trg_ws_after_delete
AFTER DELETE ON warehouse_stock
FOR EACH ROW
BEGIN
    UPDATE products
    SET stock_qty = (SELECT COALESCE(SUM(stock_qty), 0) FROM warehouse_stock WHERE product_id = OLD.product_id),
        reserved_quantity = (SELECT COALESCE(SUM(reserved_quantity), 0) FROM warehouse_stock WHERE product_id = OLD.product_id)
    WHERE id = OLD.product_id;
END$$

DELIMITER ;

-- 4. Ghi nhận phiên bản migration
INSERT INTO schema_migrations (version) VALUES ('v4.1.0');
