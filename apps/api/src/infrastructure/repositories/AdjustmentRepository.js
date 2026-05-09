'use strict';
/**
 * AdjustmentRepository.js
 * Read operations for adjustments
 */
const db = require('../../shared/config/db');

class AdjustmentRepository {
  async getAdjustments(db, { page, size, productId, changedBy, dateFrom, dateTo, searchParams }) {
    // Note: Now we query from inventory_adjustments table for history
    const where = ['1=1'];
    const params = [];
    if (productId) { where.push('a.product_id = ?'); params.push(productId); }
    if (changedBy) { where.push('a.created_by = ?'); params.push(changedBy); }
    if (dateFrom) { where.push('DATE(a.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('DATE(a.created_at) <= ?'); params.push(dateTo); }
    if (searchParams) {
      where.push('(p.name LIKE ? OR p.sku LIKE ? OR a.note LIKE ?)');
      params.push(searchParams, searchParams, searchParams);
    }
    const w = 'WHERE ' + where.join(' AND ');

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM inventory_adjustments a JOIN products p ON p.id = a.product_id ${w}`, params);
    const [rows] = await db.query(
      `SELECT a.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit,
              u.full_name AS changed_by_name, u.username AS changed_by_username
       FROM inventory_adjustments a
       JOIN products p ON p.id = a.product_id
       LEFT JOIN users u ON u.id = a.created_by
       ${w} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, size, (page - 1) * size]
    );
    return { total: Number(total), rows };
  }

  async createAdjustmentRequest(conn, data) {
    const [r] = await conn.query(
      `INSERT INTO inventory_adjustments (adj_code, warehouse_id, product_id, old_qty, new_qty, delta, reason, note, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.adjCode, data.warehouseId, data.productId, data.oldQty, data.newQty, data.delta, data.reason, data.note, data.status, data.createdBy]
    );
    return r.insertId;
  }

  async findAdjustmentById(db, id) {
    const [[row]] = await db.query('SELECT * FROM inventory_adjustments WHERE id = ?', [id]);
    return row;
  }

  async updateAdjustmentStatus(conn, id, { status, actorId }) {
    const field = status === 'APPROVED' ? 'approved_by' : 'rejected_by';
    const dateField = status === 'APPROVED' ? 'approved_at' : 'rejected_at';
    await conn.query(
      `UPDATE inventory_adjustments SET status = ?, ${field} = ?, ${dateField} = NOW() WHERE id = ?`,
      [status, actorId, id]
    );
  }

  async genAdjCode(conn) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = `ADJ${ymd}`;

    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(adj_code, -4) AS UNSIGNED)), 0) AS maxSeq
       FROM inventory_adjustments WHERE adj_code LIKE ? FOR UPDATE`,
      [`${prefix}%`]
    );
    
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }
  async getAdjustmentsForExport(db, { productId, dateFrom, dateTo, searchParams }) {
    const where = ['1=1'];
    const params = [];

    if (productId) { where.push('a.product_id = ?'); params.push(productId); }
    if (dateFrom) { where.push('DATE(a.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('DATE(a.created_at) <= ?'); params.push(dateTo); }
    if (searchParams) {
      where.push('(p.name LIKE ? OR p.sku LIKE ? OR a.note LIKE ?)');
      params.push(searchParams, searchParams, searchParams);
    }

    const w = 'WHERE ' + where.join(' AND ');

    const [rows] = await db.query(
      `SELECT
         a.created_at, p.sku, p.name AS product_name, p.unit,
         a.old_qty AS stock_before, a.new_qty AS stock_after,
         a.delta AS difference,
         a.note, u.full_name AS changed_by_name
       FROM inventory_adjustments a
       JOIN products p    ON p.id = a.product_id
       LEFT JOIN users u  ON u.id = a.created_by
       ${w}
       ORDER BY a.created_at DESC
       LIMIT 5000`,
      params
    );
    return rows;
  }
}

module.exports = new AdjustmentRepository();
