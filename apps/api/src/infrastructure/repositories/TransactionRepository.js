'use strict';
/**
 * TransactionRepository.js — Read-only analytics trên bảng stock_transactions.
 *
 * Clean Architecture — Layer 4 (Infrastructure):
 *   - Chuyên trách đọc/query analytics từ stock_transactions.
 *   - Write operations (insertTransaction) nằm ở StockRepository (giữ write-path tập trung).
 *   - Dùng bởi: GetStockReport UseCase, Report Controller.
 *
 * Spec III.1: InventoryTransaction = Source of Truth
 * Spec X.1:  Reporting — Nhập/Xuất/Tồn, Tiêu hao, Giá trị vốn
 */
const db = require('../../shared/config/db');

class TransactionRepository {
  /**
   * Lấy lịch sử giao dịch có phân trang + filter.
   * @param {object} opts
   * @param {number} opts.page
   * @param {number} opts.size
   * @param {number} [opts.warehouseId]
   * @param {number} [opts.productId]
   * @param {string} [opts.type]          - 'IMPORT' | 'EXPORT' | 'ADJUST' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RETURN'
   * @param {string} [opts.dateFrom]      - 'YYYY-MM-DD'
   * @param {string} [opts.dateTo]        - 'YYYY-MM-DD'
   * @param {string} [opts.referenceType] - 'import_order' | 'export_order' | ...
   * @returns {Promise<{items, totalCount, totalPages, page, size}>}
   */
  async findAll({
    page = 0, size = 50,
    warehouseId, productId, type,
    dateFrom, dateTo, referenceType,
  } = {}) {
    const where  = [];
    const params = [];

    if (warehouseId)   { where.push('t.warehouse_id = ?');   params.push(warehouseId); }
    if (productId)     { where.push('t.product_id = ?');     params.push(productId); }
    if (type)          { where.push('t.type = ?');           params.push(type.toUpperCase()); }
    if (referenceType) { where.push('t.reference_type = ?'); params.push(referenceType); }
    if (dateFrom)    { where.push('t.created_at >= CONCAT(?, " 00:00:00")'); params.push(dateFrom); }
    if (dateTo)      { where.push('t.created_at <= CONCAT(?, " 23:59:59")'); params.push(dateTo); }

    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM stock_transactions t ${w}`, params
    );

    const [rows] = await db.query(
      `SELECT t.*,
              p.name       AS product_name,
              p.sku,
              w.name       AS warehouse_name,
              u.full_name  AS created_by_name
       FROM stock_transactions t
       JOIN products p         ON p.id = t.product_id
       LEFT JOIN warehouses w  ON w.id = t.warehouse_id
       LEFT JOIN users u       ON u.id = t.created_by
       ${w}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, size, page * size]
    );

    return { items: rows, totalCount: total, totalPages: Math.ceil(total / size), page, size };
  }

  /**
   * Tổng hợp nhập/xuất theo khoảng ngày (cho báo cáo Nhập-Xuất-Tồn).
   * @param {object} opts - { warehouseId?, productId?, dateFrom, dateTo }
   * @returns {Promise<Array<{ product_id, product_name, sku, total_import, total_export, net }>>}
   */
  async summarizeInOut({ warehouseId, productId, dateFrom, dateTo } = {}) {
    const where  = [];
    const params = [];

    if (warehouseId) { where.push('t.warehouse_id = ?'); params.push(warehouseId); }
    if (productId)   { where.push('t.product_id = ?');   params.push(productId); }
    if (dateFrom)    { where.push('t.created_at >= CONCAT(?, " 00:00:00")'); params.push(dateFrom); }
    if (dateTo)      { where.push('t.created_at <= CONCAT(?, " 23:59:59")'); params.push(dateTo); }

    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT
         p.id         AS product_id,
         p.name       AS product_name,
         p.sku,
         SUM(CASE 
           WHEN t.type = 'IMPORT' THEN t.quantity 
           WHEN t.type = 'ADJUST' AND (t.stock_after - t.stock_before) > 0 THEN t.quantity
           WHEN t.type IN ('TRANSFER_IN', 'RETURN_IN') THEN t.quantity
           ELSE 0 
         END) AS total_import,
         SUM(CASE 
           WHEN t.type = 'EXPORT' THEN t.quantity 
           WHEN t.type = 'ADJUST' AND (t.stock_after - t.stock_before) < 0 THEN t.quantity
           WHEN t.type IN ('TRANSFER_OUT', 'RETURN_OUT') THEN t.quantity
           ELSE 0 
         END) AS total_export,
         SUM(t.stock_after - t.stock_before) AS net
       FROM stock_transactions t
       JOIN products p ON p.id = t.product_id
       ${w}
       GROUP BY p.id, p.name, p.sku
       ORDER BY p.name`,
      params
    );

    return rows;
  }

  /**
   * Báo cáo giá trị kho hiện tại theo warehouse.
   * @param {number} [warehouseId]
   */
  async getInventoryValue(warehouseId) {
    // BUG-INV-01 FIX: dùng AND thay vì WHERE thứ 2 — tránh duplicate WHERE syntax error
    const andClause = warehouseId ? 'AND ws.warehouse_id = ?' : '';
    const params    = warehouseId ? [warehouseId] : [];

    const [rows] = await db.query(
      `SELECT
         ws.warehouse_id,
         wh.name         AS warehouse_name,
         ws.product_id,
         p.name          AS product_name,
         p.sku,
         ws.stock_qty,
         ws.reserved_quantity,
         (ws.stock_qty - COALESCE(ws.reserved_quantity, 0)) AS available_qty,
         ws.avg_unit_price,
         ROUND(ws.stock_qty * COALESCE(ws.avg_unit_price, 0), 2) AS total_value
       FROM warehouse_stock ws
       JOIN products p    ON p.id = ws.product_id
       JOIN warehouses wh ON wh.id = ws.warehouse_id
       WHERE ws.stock_qty > 0
         ${andClause}
       ORDER BY wh.name, p.name`,
      params
    );

    return rows;
  }

  /**
   * Báo cáo hàng tồn đọng (không có giao dịch trong N ngày).
   * @param {number} [thresholdDays=90] - Hàng không xuất quá N ngày → tồn đọng
   * @param {number} [warehouseId]
   */
  async getDeadStock(thresholdDays = 90, warehouseId) {
    return this._queryDeadStock(thresholdDays, warehouseId);
  }


  /** @private — cleaner dead-stock query */
  async _queryDeadStock(thresholdDays, warehouseId) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);
    const dateStr = thresholdDate.toISOString().slice(0, 10);

    const whClause = warehouseId ? 'AND ws.warehouse_id = ?' : '';
    const baseParams = warehouseId ? [warehouseId] : [];

    const [rows] = await db.query(
      `SELECT
         ws.product_id,
         p.name         AS product_name,
         p.sku,
         ws.warehouse_id,
         wh.name        AS warehouse_name,
         ws.stock_qty,
         COALESCE(ws.avg_unit_price, 0) AS avg_unit_price,
         ROUND(ws.stock_qty * COALESCE(ws.avg_unit_price, 0), 2) AS total_value,
         MAX(t.created_at) AS last_movement_at,
         DATEDIFF(NOW(), COALESCE(MAX(t.created_at), ws.created_at)) AS days_since_movement
       FROM warehouse_stock ws
       JOIN products p      ON p.id = ws.product_id  AND p.deleted = FALSE
       JOIN warehouses wh   ON wh.id = ws.warehouse_id
       LEFT JOIN stock_transactions t
         ON t.product_id   = ws.product_id
         AND t.warehouse_id = ws.warehouse_id
         AND (t.type IN ('EXPORT','TRANSFER_OUT','RETURN_OUT') OR (t.type = 'ADJUST' AND t.stock_after < t.stock_before))
       WHERE ws.stock_qty > 0 ${whClause}
       GROUP BY ws.product_id, ws.warehouse_id,
                p.name, p.sku, wh.name, ws.stock_qty, ws.avg_unit_price, ws.created_at
       HAVING COALESCE(MAX(t.created_at), '1970-01-01') < ?
       ORDER BY days_since_movement DESC, total_value DESC`,
      [...baseParams, dateStr]
    );

    return rows;
  }

  /**
   * Tiêu hao theo khoảng ngày (consumption report).
   * @param {object} opts - { warehouseId?, dateFrom, dateTo }
   */
  async getConsumptionReport({ warehouseId, dateFrom, dateTo } = {}) {
    const where  = ["(t.type IN ('EXPORT','TRANSFER_OUT','RETURN_OUT') OR (t.type = 'ADJUST' AND t.stock_after < t.stock_before))"];
    const params = [];

    if (warehouseId) { where.push('t.warehouse_id = ?'); params.push(warehouseId); }
    if (dateFrom)    { where.push('t.created_at >= CONCAT(?, " 00:00:00")'); params.push(dateFrom); }
    if (dateTo)      { where.push('t.created_at <= CONCAT(?, " 23:59:59")'); params.push(dateTo); }

    const [rows] = await db.query(
      `SELECT
         p.id         AS product_id,
         p.name       AS product_name,
         p.sku,
         SUM(t.quantity)                       AS total_qty_out,
         AVG(t.unit_price)                     AS avg_cost,
         ROUND(SUM(t.quantity * t.unit_price), 2) AS total_cost,
         COUNT(DISTINCT t.reference_id)        AS transaction_count
       FROM stock_transactions t
       JOIN products p ON p.id = t.product_id
       WHERE ${where.join(' AND ')}
       GROUP BY p.id, p.name, p.sku
       ORDER BY total_cost DESC`,
      params
    );

    return rows;
  }
}

module.exports = new TransactionRepository();
