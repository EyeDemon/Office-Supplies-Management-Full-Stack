'use strict';
/**
 * SnapshotRepository.js — Data access cho stock_snapshot_daily.
 *
 * Clean Architecture — Layer 4 (Infrastructure):
 *   - Dùng bởi: dailySnapshot job (write) + Report UseCase (read).
 *   - Spec X.1: Cron job RunDailySnapshot — tăng tốc báo cáo lịch sử.
 *
 * Idempotent: ON DUPLICATE KEY UPDATE → chạy 2 lần cùng ngày an toàn.
 */
const db = require('../../shared/config/db');

class SnapshotRepository {
  /**
   * Thực thi snapshot: INSERT ... ON DUPLICATE KEY UPDATE
   * Ghi toàn bộ warehouse_stock hiện tại vào stock_snapshot_daily cho ngày hôm nay.
   * [GAP-03] Chuyển logic từ cron job vào repository.
   *
   * @param {object} conn - MySQL connection
   * @param {string} snapshotDate - 'YYYY-MM-DD'
   */
  async runDailySnapshot(conn, snapshotDate) {
    return await conn.query(
      `INSERT INTO stock_snapshot_daily
         (snapshot_date, warehouse_id, product_id, stock_qty, reserved_quantity, avg_unit_price, total_value)
       SELECT
         ?,
         ws.warehouse_id,
         ws.product_id,
         ws.stock_qty,
         COALESCE(ws.reserved_quantity, 0),
         COALESCE(ws.avg_unit_price, 0),
         ROUND(ws.stock_qty * COALESCE(ws.avg_unit_price, 0), 2)
       FROM warehouse_stock ws
       WHERE ws.stock_qty > 0 OR ws.reserved_quantity > 0
       ON DUPLICATE KEY UPDATE
         stock_qty         = VALUES(stock_qty),
         reserved_quantity = VALUES(reserved_quantity),
         avg_unit_price    = VALUES(avg_unit_price),
         total_value       = VALUES(total_value)`,
      [snapshotDate]
    );
  }

  /**
   * Ghi snapshot cho ngày hôm nay (Standalone version).
   * @param {string} snapshotDate - 'YYYY-MM-DD'
   * @returns {Promise<{ snapshotDate, affectedRows, elapsedMs }>}
   */
  async upsertDailySnapshot(snapshotDate) {
    const startMs = Date.now();
    const [result] = await this.runDailySnapshot(db, snapshotDate);

    return {
      snapshotDate,
      affectedRows: result.affectedRows || 0,
      elapsedMs:    Date.now() - startMs,
    };
  }

  /**
   * Lấy snapshot gần nhất (hoặc theo ngày cụ thể) cho 1 kho + sản phẩm.
   * @param {object} opts - { warehouseId, productId, date? }
   */
  async findOne({ warehouseId, productId, date } = {}) {
    const dateClause = date ? 'AND snapshot_date = ?' : 'ORDER BY snapshot_date DESC LIMIT 1';
    const params     = [warehouseId, productId];
    if (date) params.push(date);

    const [[row]] = await db.query(
      `SELECT * FROM stock_snapshot_daily
       WHERE warehouse_id = ? AND product_id = ?
       ${date ? 'AND snapshot_date = ?' : 'ORDER BY snapshot_date DESC'}
       LIMIT 1`,
      params
    );
    return row || null;
  }

  /**
   * Lấy snapshot theo ngày cho toàn bộ kho / hoặc 1 kho cụ thể.
   * @param {object} opts - { date, warehouseId? }
   */
  async findByDate({ date, warehouseId } = {}) {
    const where  = ['snapshot_date = ?'];
    const params = [date];

    if (warehouseId) { where.push('warehouse_id = ?'); params.push(warehouseId); }

    const [rows] = await db.query(
      `SELECT ssd.*,
              p.name  AS product_name, p.sku,
              wh.name AS warehouse_name
       FROM stock_snapshot_daily ssd
       JOIN products p     ON p.id  = ssd.product_id
       JOIN warehouses wh  ON wh.id = ssd.warehouse_id
       WHERE ${where.join(' AND ')}
       ORDER BY wh.name, p.name`,
      params
    );
    return rows;
  }

  /**
   * Lấy lịch sử snapshot theo khoảng ngày cho 1 sản phẩm + kho.
   * Dùng để vẽ biểu đồ xu hướng tồn kho.
   * @param {object} opts - { warehouseId, productId, dateFrom, dateTo }
   */
  async findTrend({ warehouseId, productId, dateFrom, dateTo } = {}) {
    const where  = ['warehouse_id = ?', 'product_id = ?'];
    const params = [warehouseId, productId];

    if (dateFrom) { where.push('snapshot_date >= ?'); params.push(dateFrom); }
    if (dateTo)   { where.push('snapshot_date <= ?'); params.push(dateTo); }

    const [rows] = await db.query(
      `SELECT snapshot_date, stock_qty, reserved_quantity,
              (stock_qty - COALESCE(reserved_quantity, 0)) AS available_qty,
              avg_unit_price, total_value
       FROM stock_snapshot_daily
       WHERE ${where.join(' AND ')}
       ORDER BY snapshot_date ASC`,
      params
    );
    return rows;
  }

  /**
   * Tổng giá trị kho theo ngày (across all warehouses).
   * Dùng cho dashboard báo cáo tổng quan.
   * @param {string} date - 'YYYY-MM-DD'
   */
  async getTotalValueByDate(date) {
    const [rows] = await db.query(
      `SELECT
         wh.id          AS warehouse_id,
         wh.name        AS warehouse_name,
         SUM(ssd.stock_qty)   AS total_qty,
         SUM(ssd.total_value) AS total_value,
         COUNT(DISTINCT ssd.product_id) AS product_count
       FROM stock_snapshot_daily ssd
       JOIN warehouses wh ON wh.id = ssd.warehouse_id
       WHERE ssd.snapshot_date = ?
       GROUP BY wh.id, wh.name
       ORDER BY total_value DESC`,
      [date]
    );
    return rows;
  }

  /**
   * Ngày có snapshot gần nhất (để biết lần cuối cron chạy thành công).
   * @returns {Promise<string|null>} - 'YYYY-MM-DD' hoặc null
   */
  async getLatestSnapshotDate() {
    const [[row]] = await db.query(
      'SELECT MAX(snapshot_date) AS latest FROM stock_snapshot_daily'
    );
    return row?.latest ? String(row.latest).slice(0, 10) : null;
  }

  /**
   * Dọn dẹp snapshot cũ hơn N ngày (tránh bảng phình to).
   * @param {number} [keepDays=365] - giữ 1 năm gần nhất
   * @returns {Promise<number>} số rows bị xoá
   */
  async pruneOldSnapshots(keepDays = 365) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const [result] = await db.query(
      'DELETE FROM stock_snapshot_daily WHERE snapshot_date < ?',
      [cutoffDate]
    );
    return result.affectedRows || 0;
  }
}

module.exports = new SnapshotRepository();
