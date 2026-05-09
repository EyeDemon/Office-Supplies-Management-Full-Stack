'use strict';
/**
 * DashboardRepository.js — Clean Architecture Layer 4
 *
 * [BUG-05 FIX] Dùng shared RedisClient thay vì tạo connection riêng.
 * [BUG-05b FIX] Xoá duplicate _getCache/_setCache (override bug — cache luôn miss).
 */
const db = require('../../shared/config/db');
const { getClient } = require('../../shared/infrastructure/RedisClient');

const TTL = 5 * 60; // 5 phút
const PFX = 'qlvpp:dashboard:';

class DashboardRepository {

  // ── Cache helpers (dùng shared Redis client) ───────────────────
  async _getCache(key) {
    try {
      const redis = getClient();
      if (redis.status !== 'ready') return null;
      const val = await redis.get(PFX + key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      console.warn('[dashboard/_getCache]', err.message);
      return null;
    }
  }

  async _setCache(key, data, ttl = TTL) {
    try {
      const redis = getClient();
      if (redis.status !== 'ready') return;
      await redis.set(PFX + key, JSON.stringify(data), 'EX', ttl);
    } catch (err) {
      console.warn('[dashboard/_setCache]', err.message);
    }
  }

  async clearCache() {
    try {
      const redis = getClient();
      if (redis.status !== 'ready') return;
      const keys = await redis.keys(PFX + '*');
      if (keys.length > 0) await redis.del(...keys);
    } catch (err) {
      console.warn('[dashboard/clearCache]', err.message);
    }
  }

  // ── Safe query helper (returns [] on error instead of throwing) ─
  async safeQ(sql, params, def) {
    try {
      const [r] = await db.query(sql, params || []);
      return r;
    } catch (err) {
      console.warn('[dashboard/safeQ]', err.message, '| SQL:', sql.slice(0, 80));
      return def;
    }
  }

  async getStockSummary() {
    const rows = await this.safeQ('SELECT * FROM stock_summary', [], [{}]);
    return rows[0] || {};
  }

  async getAdminStats({ wWhere, wParams, wWhereTf, wParamsTf, userId }) {
    const cacheKey = `admin_${userId}_${wWhere}_${wWhereTf}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const [userRow] = await this.safeQ("SELECT COUNT(*) AS total FROM users WHERE deleted=0", [], [{ total: 0 }]);
    const [pendingReqRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM requisitions WHERE status='PENDING'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [draftImportRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM import_orders WHERE status='DRAFT'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [pendingImportRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM import_orders WHERE status='PENDING'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [approvedImportRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM import_orders WHERE status='APPROVED'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [draftExportRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM export_orders WHERE status='DRAFT'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [pendingTfRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM stock_transfers WHERE status='PENDING'${wWhereTf}`, wParamsTf, [{ cnt: 0 }]);
    const [pendingPRRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM purchase_requests WHERE status='PENDING'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [confirmedPORow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM purchase_orders WHERE status='CONFIRMED'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [draftReturnRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM return_orders WHERE status='DRAFT'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [unreadRow] = await this.safeQ("SELECT COUNT(*) AS cnt FROM notifications WHERE is_read=FALSE AND (user_id IS NULL OR user_id = ?)", [userId], [{ cnt: 0 }]);
    const [highStockRow] = await this.safeQ("SELECT COUNT(*) AS cnt FROM products WHERE deleted=0 AND min_stock_qty > 0 AND stock_qty > min_stock_qty * 5", [], [{ cnt: 0 }]);
    const [todayTx] = await this.safeQ(`
      SELECT COALESCE(SUM(CASE WHEN type='IMPORT' THEN quantity ELSE 0 END),0) AS imported,
             COALESCE(SUM(CASE WHEN type='EXPORT' THEN quantity ELSE 0 END),0) AS exported,
             COUNT(*) AS tx_count
      FROM stock_transactions
      WHERE DATE(created_at) = CURDATE()
        AND (note IS NULL OR note NOT LIKE '[Điều chuyển%')
    `, [], [{ imported: 0, exported: 0, tx_count: 0 }]);

    const result = {
      userRow, pendingReqRow, draftImportRow, pendingImportRow, approvedImportRow,
      draftExportRow, pendingTfRow, pendingPRRow, confirmedPORow, draftReturnRow, unreadRow, highStockRow, todayTx
    };
    await this._setCache(cacheKey, result);
    return result;
  }

  async getWarehouseStats({ wWhere, wParams, wWhereTf, wParamsTf, userId }) {
    const cacheKey = `wh_${userId}_${wWhere}_${wWhereTf}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const [pendingImportRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM import_orders WHERE status='APPROVED'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [pendingExportRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM export_orders WHERE status IN ('DRAFT','PENDING')${wWhere}`, wParams, [{ cnt: 0 }]);
    const [pendingTfRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM stock_transfers WHERE status='PENDING'${wWhereTf}`, wParamsTf, [{ cnt: 0 }]);
    const [approvedReqRow] = await this.safeQ(`SELECT COUNT(*) AS cnt FROM requisitions WHERE status='APPROVED'${wWhere}`, wParams, [{ cnt: 0 }]);
    const [unreadRow] = await this.safeQ("SELECT COUNT(*) AS cnt FROM notifications WHERE is_read=FALSE AND (user_id IS NULL OR user_id = ?)", [userId], [{ cnt: 0 }]);
    const [todayTx] = await this.safeQ(`
      SELECT COALESCE(SUM(CASE WHEN type='IMPORT' THEN quantity ELSE 0 END),0) AS imported,
             COALESCE(SUM(CASE WHEN type='EXPORT' THEN quantity ELSE 0 END),0) AS exported
      FROM stock_transactions
      WHERE DATE(created_at) = CURDATE()
        AND (note IS NULL OR note NOT LIKE '[Điều chuyển%')
    `, [], [{ imported: 0, exported: 0 }]);

    const result = { pendingImportRow, pendingExportRow, pendingTfRow, approvedReqRow, unreadRow, todayTx };
    await this._setCache(cacheKey, result);
    return result;
  }

  async getUserStats(userId) {
    const cacheKey = `user_${userId}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const [myReqRow] = await this.safeQ("SELECT COUNT(*) AS cnt FROM requisitions WHERE requester_id=? AND status='PENDING'", [userId], [{ cnt: 0 }]);
    const [myApprovedRow] = await this.safeQ("SELECT COUNT(*) AS cnt FROM requisitions WHERE requester_id=? AND status='APPROVED' AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)", [userId], [{ cnt: 0 }]);

    const result = { myReqRow, myApprovedRow };
    await this._setCache(cacheKey, result);
    return result;
  }

  async getWeeklyActivity() {
    const [rows] = await db.query(`
      SELECT DATE(created_at) AS day,
        COALESCE(SUM(CASE WHEN type='IMPORT' THEN quantity ELSE 0 END), 0) AS imported,
        COALESCE(SUM(CASE WHEN type='EXPORT' THEN quantity ELSE 0 END), 0) AS exported,
        COALESCE(SUM(CASE WHEN type='ADJUST' THEN quantity ELSE 0 END), 0) AS adjusted,
        COUNT(*) AS tx_count
      FROM stock_transactions
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND (note IS NULL OR note NOT LIKE '[Điều chuyển%')
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);
    return rows;
  }

  async getStockActivity(opts) {
    const { useRange, department, deptJoin, deptWhere, transferFilter, params } = opts;
    const cacheKey = `stock_activity_${JSON.stringify(opts)}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const timeCond = useRange
      ? `t.created_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')`
      : `t.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)`;

    const [rows] = await db.query(`
      SELECT p.id AS product_id, p.name AS product_name, p.sku,
        c.name AS category_name, p.price,
        COALESCE(SUM(CASE WHEN t.type='IMPORT' THEN t.quantity ELSE 0 END), 0) AS imported_qty,
        COALESCE(SUM(CASE WHEN t.type='EXPORT' THEN t.quantity ELSE 0 END), 0) AS exported_qty,
        COALESCE(SUM(CASE WHEN t.type='ADJUST' THEN t.quantity ELSE 0 END), 0) AS adjusted_qty,
        COUNT(t.id) AS total_transactions, p.stock_qty AS current_stock,
        p.min_stock_qty, (p.stock_qty <= p.min_stock_qty) AS is_low_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id AND c.deleted = FALSE
      ${deptJoin}
      LEFT JOIN stock_transactions t ON p.id = t.product_id
        AND ${timeCond} ${transferFilter}
      WHERE p.deleted = FALSE ${deptWhere}
      GROUP BY p.id, p.name, p.sku, c.name, p.price, p.stock_qty, p.min_stock_qty
      ORDER BY imported_qty DESC, exported_qty DESC
    `, params);

    await this._setCache(cacheKey, rows, 60); // 1 min TTL for activity data
    return rows;
  }

  async getCategoryReport({ dateFrom, dateTo } = {}) {
    const cacheKey = `cat_report_${dateFrom}_${dateTo}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    let rows;
    if (dateFrom && dateTo) {
      [rows] = await db.query(`
        SELECT c.id AS category_id, c.name AS category_name,
          COUNT(DISTINCT p.id) AS product_count,
          COALESCE(SUM(p.stock_qty), 0) AS total_stock,
          COALESCE(SUM(p.stock_qty * p.avg_unit_price), 0) AS stock_value,
          SUM(CASE WHEN p.stock_qty = 0 THEN 1 ELSE 0 END) AS out_of_stock_count,
          SUM(CASE WHEN p.stock_qty > 0 AND p.stock_qty <= p.min_stock_qty THEN 1 ELSE 0 END) AS low_stock_count,
          COALESCE(SUM(CASE WHEN t.type='IMPORT' THEN t.quantity ELSE 0 END),0) AS period_imported,
          COALESCE(SUM(CASE WHEN t.type='EXPORT' THEN t.quantity ELSE 0 END),0) AS period_exported
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id AND p.deleted = FALSE
        LEFT JOIN stock_transactions t ON t.product_id = p.id
          AND t.created_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
          AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
        WHERE c.deleted = FALSE
        GROUP BY c.id, c.name
        ORDER BY stock_value DESC
      `, [dateFrom, dateTo]);
    } else {
      [rows] = await db.query(`
        SELECT c.id AS category_id, c.name AS category_name,
          COUNT(DISTINCT p.id) AS product_count,
          COALESCE(SUM(p.stock_qty), 0) AS total_stock,
          COALESCE(SUM(p.stock_qty * p.avg_unit_price), 0) AS stock_value,
          SUM(CASE WHEN p.stock_qty = 0 THEN 1 ELSE 0 END) AS out_of_stock_count,
          SUM(CASE WHEN p.stock_qty > 0 AND p.stock_qty <= p.min_stock_qty THEN 1 ELSE 0 END) AS low_stock_count,
          0 AS period_imported, 0 AS period_exported
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id AND p.deleted = FALSE
        WHERE c.deleted = FALSE
        GROUP BY c.id, c.name
        ORDER BY stock_value DESC
      `);
    }
    await this._setCache(cacheKey, rows);
    return rows;
  }

  async getTopProducts({ type, days, limit }) {
    const cacheKey = `top_products_${type}_${days}_${limit}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const [rows] = await db.query(`
      SELECT p.id, p.name, p.sku, c.name AS category_name,
             SUM(t.quantity) AS total_qty, COUNT(t.id) AS tx_count
      FROM stock_transactions t
      JOIN products p ON p.id = t.product_id
      LEFT JOIN categories c ON c.id = p.category_id AND c.deleted = FALSE
      WHERE t.type = ? AND t.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
        AND p.deleted = FALSE AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
      GROUP BY p.id, p.name, p.sku, c.name
      ORDER BY total_qty DESC
      LIMIT ?
    `, [type, days, limit]);

    await this._setCache(cacheKey, rows);
    return rows;
  }

  async getFinancialReport({ grouping, dateFrom, dateTo }) {
    const cacheKey = `financial_${grouping}_${dateFrom}_${dateTo}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    let rows;
    if (grouping === 'category') {
      [rows] = await db.query(`
        SELECT c.name AS group_name,
          COALESCE(SUM(CASE WHEN t.type='IMPORT' THEN t.quantity * p.price ELSE 0 END), 0) AS total_import_cost,
          COALESCE(SUM(CASE WHEN t.type='EXPORT' THEN t.quantity * p.price ELSE 0 END), 0) AS total_export_cost
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        LEFT JOIN stock_transactions t ON t.product_id = p.id
          AND t.created_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
          AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
        WHERE c.deleted = FALSE
        GROUP BY c.id, c.name
        ORDER BY total_export_cost DESC
      `, [dateFrom, dateTo]);
    } else {
      [rows] = await db.query(`
        SELECT COALESCE(eo.department, 'Không xác định') AS group_name,
          COALESCE(SUM(eoi.quantity * p.price), 0) AS total_export_cost, 0 AS total_import_cost
        FROM export_orders eo
        JOIN export_order_items eoi ON eo.id = eoi.order_id
        JOIN products p ON p.id = eoi.product_id
        WHERE eo.status = 'COMPLETED'
          AND eo.completed_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
        GROUP BY eo.department
        ORDER BY total_export_cost DESC
      `, [dateFrom, dateTo]);
    }
    await this._setCache(cacheKey, rows);
    return rows;
  }

  async getBurnRate({ days, catId }) {
    const cacheKey = `burn_rate_${days}_${catId || 'all'}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const conds = ['p.deleted = FALSE', 'p.stock_qty > 0'];
    const params = [days, days];
    if (catId) { conds.push('p.category_id = ?'); params.push(catId); }

    const [rows] = await db.query(`
      SELECT p.id AS product_id, p.sku, p.name AS product_name,
        p.stock_qty AS current_stock, p.reserved_quantity,
        (p.stock_qty - p.reserved_quantity) AS available_stock,
        p.min_stock_qty, COALESCE(p.reorder_point, p.min_stock_qty) AS reorder_point,
        p.avg_unit_price, (p.stock_qty * p.avg_unit_price) AS stock_value,
        c.name AS category_name,
        COALESCE(SUM(CASE WHEN t.type = 'EXPORT'
            AND t.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
            AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
            THEN t.quantity ELSE 0 END), 0) AS total_exported,
        COUNT(DISTINCT CASE WHEN t.type = 'EXPORT'
            AND t.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
            AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
            THEN DATE(t.created_at) END) AS active_days
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.deleted = FALSE
      LEFT JOIN stock_transactions t ON t.product_id = p.id
      WHERE ${conds.join(' AND ')}
      GROUP BY p.id, p.sku, p.name, p.stock_qty, p.reserved_quantity,
               p.min_stock_qty, p.avg_unit_price, c.name
      HAVING total_exported > 0
      ORDER BY total_exported DESC
    `, params);

    await this._setCache(cacheKey, rows);
    return rows;
  }

  async getDeadStock({ days, catId }) {
    const cacheKey = `dead_stock_${days}_${catId || 'all'}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const catWhere = catId ? 'AND p.category_id = ?' : '';
    const params = catId ? [catId, days] : [days];

    const [rows] = await db.query(`
      SELECT p.id AS product_id, p.sku, p.name AS product_name,
        p.stock_qty AS current_stock, p.reserved_quantity, p.min_stock_qty,
        p.avg_unit_price, (p.stock_qty * p.avg_unit_price) AS stock_value,
        c.name AS category_name, MAX(t.created_at) AS last_export,
        DATEDIFF(NOW(), MAX(t.created_at)) AS days_since_last_export,
        COUNT(t.id) AS total_export_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.deleted = FALSE
      LEFT JOIN stock_transactions t ON t.product_id = p.id AND t.type = 'EXPORT'
        AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
      WHERE p.deleted = FALSE AND p.stock_qty > 0 ${catWhere}
      GROUP BY p.id, p.sku, p.name, p.stock_qty, p.reserved_quantity,
               p.min_stock_qty, p.avg_unit_price, c.name
      HAVING last_export IS NULL OR days_since_last_export >= ?
      ORDER BY stock_value DESC, days_since_last_export DESC
    `, params);

    await this._setCache(cacheKey, rows);
    return rows;
  }
}

module.exports = new DashboardRepository();