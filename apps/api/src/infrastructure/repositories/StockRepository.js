'use strict';
/**
 * StockRepository.js — Data access cho warehouse_stock + stock_transactions + stock_ledger.
 *
 * Clean Architecture:
 *   - Layer 4: DUY NHẤT file này biết mysql2 cho inventory domain.
 *   - UseCase gọi StockRepository, không gọi db.query trực tiếp.
 *   - Tất cả write methods nhận `conn` (MySQL connection trong transaction).
 *
 * Spec VI.2: Pessimistic Locking (FOR UPDATE NOWAIT) được áp dụng tại đây.
 */
const db = require('../../shared/config/db');

class StockRepository {
  /**
   * Lấy tồn kho hiện tại tại warehouse cho product.
   * Trả về null nếu chưa có row (tồn kho = 0).
   * @param {object} conn - MySQL connection (trong transaction)
   * @param {number} warehouseId
   * @param {number} productId
   * @param {boolean} [lock=false] - có FOR UPDATE NOWAIT không
   */
  async findStock(conn, warehouseId, productId, lock = false) {
    const lockClause = lock ? 'FOR UPDATE NOWAIT' : '';
    const [[row]] = await conn.query(
      `SELECT id, warehouse_id, product_id, location_id, stock_qty,
              reserved_quantity, avg_unit_price
       FROM warehouse_stock
       WHERE warehouse_id=? AND product_id=? ${lockClause}`,
      [warehouseId, productId]
    );
    return row || null;
  }

  /**
   * Upsert warehouse_stock (INSERT or UPDATE).
   * @param {object} conn
   * @param {number} warehouseId
   * @param {number} productId
   * @param {number} qtyDelta    - + nhập, - xuất
   * @param {number} newAvgPrice - đã tính ở domain layer
   * @param {number|null} [locationId=null]
   */
  async upsertStock(conn, warehouseId, productId, qtyDelta, newAvgPrice, locationId = null) {
    // [FIX] MySQL 8 check constraints (chk_ws_qty) kiểm tra cả phần VALUES của ON DUPLICATE KEY UPDATE.
    // Nếu qtyDelta < 0 (xuất kho), việc để -1 trong VALUES sẽ gây lỗi chk_ws_qty >= 0.
    // Giải pháp: Thử UPDATE trước, nếu không có dòng nào (affectedRows=0) thì mới INSERT.
    
    const [result] = await conn.query(
      `UPDATE warehouse_stock 
          SET stock_qty = stock_qty + ?, 
              avg_unit_price = ?,
              location_id = COALESCE(?, location_id),
              updated_at = NOW()
        WHERE warehouse_id = ? AND product_id = ?`,
      [qtyDelta, newAvgPrice, locationId, warehouseId, productId]
    );

    if (result.affectedRows === 0) {
      // Chỉ INSERT khi chưa có dòng này (thường là nhập kho lần đầu, qtyDelta > 0)
      await conn.query(
        `INSERT INTO warehouse_stock (warehouse_id, product_id, stock_qty, avg_unit_price, location_id)
         VALUES (?, ?, ?, ?, ?)`,
        [warehouseId, productId, Math.max(0, qtyDelta), newAvgPrice, locationId]
      );
    }
  }

  /**
   * Cộng reserved_quantity (khi Approve requisition).
   * @param {object} conn
   * @param {number} warehouseId
   * @param {number} productId
   * @param {number} qty - dương
   */
  async increaseReservation(conn, warehouseId, productId, qty) {
    await conn.query(
      `UPDATE warehouse_stock
         SET reserved_quantity = reserved_quantity + ?
       WHERE warehouse_id=? AND product_id=?`,
      [qty, warehouseId, productId]
    );
  }

  /**
   * Giảm reserved_quantity (khi Cancel/Complete requisition).
   */
  async decreaseReservation(conn, warehouseId, productId, qty) {
    await conn.query(
      `UPDATE warehouse_stock
         SET reserved_quantity = GREATEST(0, reserved_quantity - ?)
       WHERE warehouse_id=? AND product_id=?`,
      [qty, warehouseId, productId]
    );
  }

  /**
   * Ghi stock_transactions row.
   * @returns {Promise<number>} insertId
   */
  async insertTransaction(conn, {
    productId, warehouseId, lotId = null, referenceType, referenceId,
    type, quantity, costPerUnit = 0, stockBefore, stockAfter, note, createdBy,
  }) {
    const [r] = await conn.query(
      `INSERT INTO stock_transactions
         (product_id, warehouse_id, lot_id, reference_type, reference_id,
          type, quantity, unit_price, stock_before, stock_after, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, warehouseId, lotId, referenceType, referenceId,
       type, quantity, costPerUnit, stockBefore, stockAfter, note, createdBy]
    );
    return r.insertId;
  }

  /**
   * Ghi stock_ledger row (Audit Core — Spec III.3).
   * @returns {Promise<number>} insertId
   */
  async insertLedger(conn, {
    warehouseId, productId, transactionId, transactionType,
    quantityChange, costPerUnit = 0, runningBalance = null, 
    referenceType, referenceId, note, createdBy,
  }) {
    const costImpact = Math.round(quantityChange * costPerUnit * 1000000) / 1000000;

    let finalBalance = runningBalance;
    if (finalBalance === null) {
      // Fallback: Running balance = current warehouse_stock.stock_qty after delta
      const [[ws]] = await conn.query(
        'SELECT stock_qty FROM warehouse_stock WHERE warehouse_id=? AND product_id=?',
        [warehouseId, productId]
      );
      finalBalance = ws ? ws.stock_qty : 0;
    }

    const [r] = await conn.query(
      `INSERT INTO stock_ledger
         (warehouse_id, product_id, transaction_id, transaction_type,
          quantity_change, running_balance, cost_per_unit, cost_impact,
          reference_type, reference_id, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [warehouseId, productId, transactionId, transactionType,
       quantityChange, finalBalance, costPerUnit, costImpact,
       referenceType, referenceId, note, createdBy]
    );
    return r.insertId;
  }

  /**
   * Cập nhật products.stock_qty + avg_unit_price (global aggregate).
   * [Spec III.2] stock là derived state — tính từ transactions.
   */
  async updateGlobalStock(conn, productId, qtyDelta, newAvgPrice) {
    await conn.query(
      `UPDATE products
         SET stock_qty      = stock_qty + ?,
             avg_unit_price = ?
       WHERE id=?`,
      [qtyDelta, newAvgPrice, productId]
    );
  }

  async syncReservationWithStock(conn, warehouseId, productId) {
    await conn.query(
      'UPDATE warehouse_stock SET reserved_quantity = LEAST(reserved_quantity, stock_qty) WHERE warehouse_id = ? AND product_id = ?',
      [warehouseId, productId]
    );
  }

  async syncProductReservation(conn, productId) {
    await conn.query(
      'UPDATE products SET reserved_quantity = LEAST(reserved_quantity, stock_qty) WHERE id = ?',
      [productId]
    );
  }

  async updateProductAvgPrice(conn, productId, avgPrice) {
    await conn.query('UPDATE products SET avg_unit_price = ? WHERE id = ?', [avgPrice, productId]);
  }

  async updateGlobalAvgPrice(conn, productId, newAvgPrice) {
    await conn.query(
      `UPDATE products SET avg_unit_price = ? WHERE id = ?`,
      [newAvgPrice, productId]
    );
  }

  /**
   * Trừ cả stock_qty lẫn reserved_quantity khỏi bảng products (cho luồng cấp phát từ requisition).
   * KHÔNG thay đổi avg_unit_price (xuất kho không ảnh hưởng chi phí bình quân).
   * @param {object} conn
   * @param {number} productId
   * @param {number} qtyDeducted     - số lượng xuất ra (dương)
   * @param {number} reservedDeducted - số reserved cần giải phóng (dương, <= approved_qty)
   */
  async deductGlobalReservedStock(conn, productId, qtyDeducted, reservedDeducted) {
    await conn.query(
      `UPDATE products
          SET stock_qty         = GREATEST(0, stock_qty - ?),
              reserved_quantity = GREATEST(0, reserved_quantity - ?)
        WHERE id = ?`,
      [qtyDeducted, reservedDeducted, productId]
    );
  }

  async decreaseGlobalReservation(conn, productId, qty) {
    await conn.query(
      `UPDATE products
          SET reserved_quantity = GREATEST(0, reserved_quantity - ?)
        WHERE id = ?`,
      [qty, productId]
    );
  }

  /**
   * Tắt LOW_STOCK notification khi tồn kho tăng.
   */
  async clearLowStockNotif(conn, productId) {
    await conn.query(
      `UPDATE notifications
         SET is_read=TRUE, read_at=NOW()
       WHERE product_id=? AND is_read=FALSE AND type IN ('LOW_STOCK','OUT_OF_STOCK')`,
      [productId]
    );
  }

  /**
   * Lấy product info để validate + costing.
   * @param {object} conn
   * @param {number} productId
   * @param {boolean} [lock=false] - FOR UPDATE NOWAIT
   */
  async findProduct(conn, productId, lock = false) {
    const lockClause = lock ? 'FOR UPDATE NOWAIT' : '';
    const [[p]] = await conn.query(
      `SELECT id, stock_qty, avg_unit_price, min_stock_qty, base_unit_id
       FROM products WHERE id=? AND deleted=FALSE ${lockClause}`,
      [productId]
    );
    return p || null;
  }

  async findProductByIds(conn, ids) {
    if (!ids || ids.length === 0) return [];
    const [rows] = await conn.query(
      'SELECT id, base_unit_id, avg_unit_price FROM products WHERE id IN (?) AND deleted=FALSE',
      [ids]
    );
    return rows;
  }

  /** Lấy connection pool (for use-cases that need it) */
  getConnection() { return db.getConnection(); }
}

module.exports = new StockRepository();