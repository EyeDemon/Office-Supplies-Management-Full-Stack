'use strict';
/**
 * LedgerRepository.js — Read-only access cho bảng stock_transactions.
 *
 * Clean Architecture — Layer 4 (Infrastructure):
 *   - Chuyên trách đọc từ stock_transactions (Audit Core — Spec III.3).
 *   - Write operations (insertTransaction) nằm ở StockRepository.
 *   - Dùng bởi: StockLedger route/controller, Report UseCase.
 *
 * Spec III.3: StockLedger = Audit Core — ghi nhận mọi thay đổi, phục vụ truy vết.
 */
const db = require('../../shared/config/db');

class LedgerRepository {
  /**
   * Lấy sổ cái có phân trang + filter.
   * @param {object} opts
   */
  async findAll({
    page = 0, size = 50,
    warehouseId, productId,
    transactionType, referenceType, referenceId, dateFrom, dateTo, search,
  } = {}) {
    const where  = [];
    const params = [];

    if (warehouseId)      { where.push('sl.warehouse_id = ?');       params.push(warehouseId); }
    if (productId)        { where.push('sl.product_id = ?');         params.push(productId); }
    if (transactionType)  { where.push('sl.type = ?');               params.push(transactionType.toUpperCase()); }
    if (referenceType)    { where.push('sl.reference_type = ?');     params.push(referenceType); }
    if (referenceId)      { where.push('sl.reference_id = ?');       params.push(referenceId); }
    if (dateFrom)         { where.push('DATE(sl.created_at) >= ?');  params.push(dateFrom); }
    if (dateTo)           { where.push('DATE(sl.created_at) <= ?');  params.push(dateTo); }
    if (search && search.trim()) {
      where.push('(p.name LIKE ? OR p.sku LIKE ? OR sl.note LIKE ?)');
      const like = `%${search.trim()}%`;
      params.push(like, like, like);
    }

    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total 
       FROM stock_transactions sl 
       JOIN products p ON p.id = sl.product_id 
       ${w}`, params
    );

    const [rows] = await db.query(
      `SELECT
         sl.id,
         sl.warehouse_id,
         sl.product_id,
         sl.type               AS transaction_type,
         sl.quantity           AS quantity_change,
         sl.unit_price         AS cost_per_unit,
         sl.stock_after        AS running_balance,
         ROUND(sl.quantity * sl.unit_price, 2) AS cost_impact,
         sl.reference_type,
         sl.reference_id,
         sl.note,
         sl.created_at,
         p.name        AS product_name,
         p.sku,
         p.unit        AS product_unit,
         wh.name       AS warehouse_name,
         u.full_name   AS created_by_name
       FROM stock_transactions sl
       JOIN products p       ON p.id  = sl.product_id
       JOIN warehouses wh    ON wh.id = sl.warehouse_id
       LEFT JOIN users u     ON u.id  = sl.created_by
       ${w}
       ORDER BY sl.created_at DESC, sl.id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, (Math.max(1, page) - 1) * size]
    );

    return { items: rows, totalCount: total, totalPages: Math.ceil(total / size), page, size };
  }

  /**
   * Tổng hợp số dư mở/đóng theo tháng.
   */
  async getMonthlyBalance({ warehouseId, productId, year, month } = {}) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 1).toISOString().slice(0, 10);

    const [[{ openingBalance }]] = await db.query(
      `SELECT COALESCE(SUM(quantity), 0) AS openingBalance
       FROM stock_transactions
       WHERE warehouse_id = ? AND product_id = ? AND created_at < ?`,
      [warehouseId, productId, startDate]
    );

    const [rows] = await db.query(
      `SELECT
         sl.id, sl.type AS transaction_type, sl.quantity AS quantity_change,
         sl.unit_price AS cost_per_unit, sl.reference_type, sl.reference_id,
         sl.note, sl.created_at, sl.stock_after AS running_balance
       FROM stock_transactions sl
       WHERE sl.warehouse_id = ? AND sl.product_id = ?
         AND sl.created_at >= ? AND sl.created_at < ?
       ORDER BY sl.created_at, sl.id`,
      [warehouseId, productId, startDate, endDate]
    );

    const closingBalance = rows.length > 0
      ? rows[rows.length - 1].running_balance
      : Number(openingBalance);

    return {
      warehouseId, productId, year, month,
      openingBalance: Number(openingBalance),
      closingBalance: Number(closingBalance),
      transactions:   rows,
    };
  }

  /**
   * Xuất sổ cái dạng flat.
   */
  async exportFlat({ warehouseId, productId, dateFrom, dateTo } = {}) {
    const where  = [];
    const params = [];

    if (warehouseId) { where.push('sl.warehouse_id = ?'); params.push(warehouseId); }
    if (productId)   { where.push('sl.product_id = ?');   params.push(productId); }
    if (dateFrom)    { where.push('DATE(sl.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo)      { where.push('DATE(sl.created_at) <= ?'); params.push(dateTo); }

    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT
         sl.created_at, sl.type AS transaction_type,
         p.name AS product_name, p.sku,
         wh.name AS warehouse_name,
         sl.quantity AS quantity_change, sl.unit_price AS cost_per_unit,
         ROUND(ABS(sl.quantity) * sl.unit_price, 2) AS line_value,
         sl.reference_type, sl.reference_id, sl.note,
         u.full_name AS created_by_name
       FROM stock_transactions sl
       JOIN products p       ON p.id  = sl.product_id
       JOIN warehouses wh    ON wh.id = sl.warehouse_id
       LEFT JOIN users u     ON u.id  = sl.created_by
       ${w}
       ORDER BY sl.created_at ASC, sl.id ASC`,
      params
    );

    return rows;
  }

  async getSummary({ warehouseId, productId, dateFrom, dateTo } = {}) {
    const conds  = [];
    const params = [];
    if (warehouseId) { conds.push('sl.warehouse_id = ?'); params.push(parseInt(warehouseId)); }
    if (productId)   { conds.push('sl.product_id = ?');   params.push(parseInt(productId)); }
    if (dateFrom)    { conds.push('DATE(sl.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo)      { conds.push('DATE(sl.created_at) <= ?'); params.push(dateTo); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await db.query(
      `SELECT
         sl.type                         AS transaction_type,
         COUNT(*)                        AS tx_count,
         SUM(ABS(sl.quantity))           AS total_qty,
         SUM(ABS(sl.quantity * sl.unit_price)) AS total_cost_impact
       FROM stock_transactions sl
       ${where}
       GROUP BY sl.type
       ORDER BY sl.type`,
      params
    );
    return rows;
  }
}

module.exports = new LedgerRepository();
