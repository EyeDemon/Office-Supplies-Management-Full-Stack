-- Migration: v4.2.0 — Fix price_history schema mismatch
-- Created: 2026-05-04

ALTER TABLE price_history
ADD COLUMN supplier_id INT UNSIGNED NULL AFTER product_id,
ADD COLUMN purchase_order_id INT UNSIGNED NULL AFTER supplier_id,
ADD COLUMN unit_price DECIMAL(18,6) NOT NULL DEFAULT 0 AFTER purchase_order_id,
ADD COLUMN quantity INT NOT NULL DEFAULT 0 AFTER unit_price,
ADD COLUMN effective_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER quantity,
ADD CONSTRAINT fk_ph_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_ph_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
MODIFY COLUMN old_price DECIMAL(18,6) NULL DEFAULT 0,
MODIFY COLUMN new_price DECIMAL(18,6) NULL DEFAULT 0;

-- Optional: Populate unit_price from new_price for existing records
UPDATE price_history SET unit_price = new_price WHERE unit_price = 0 AND new_price > 0;

-- Optional: Populate effective_date from created_at
UPDATE price_history SET effective_date = created_at WHERE effective_date = CURRENT_TIMESTAMP;

-- Update migration version
INSERT INTO schema_migrations (version) VALUES ('v4.2.0');
