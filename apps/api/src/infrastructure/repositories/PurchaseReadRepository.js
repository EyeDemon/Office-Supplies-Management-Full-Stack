'use strict';
/**
 * PurchaseReadRepository.js
 * Extracted read operations for purchases
 */
const db = require('../../shared/config/db');

class PurchaseReadRepository {
  async getPRList(db, { status, priority, limit, offset }) {
    const conds = []; const params = [];
    if (status)   { conds.push('r.status=?');   params.push(status); }
    if (priority) { conds.push('r.priority=?'); params.push(priority); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM purchase_requests r ${where}`, params);
    const [rows] = await db.query(
      `SELECT r.*,
              u1.full_name AS requested_by_name, u1.username AS requested_by_username,
              u2.full_name AS approved_by_name,
              u3.full_name AS rejected_by_name,
              (SELECT COUNT(*) FROM purchase_request_items WHERE pr_id=r.id) AS item_count
       FROM purchase_requests r
       LEFT JOIN users u1 ON u1.id = r.requested_by
       LEFT JOIN users u2 ON u2.id = r.approved_by
       LEFT JOIN users u3 ON u3.id = r.rejected_by
       ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { total: Number(total), rows };
  }

  async getSuggestPR(db) {
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.sku,
              p.stock_qty AS stock_quantity,
              p.min_stock_qty AS min_stock_level,
              COALESCE(p.reorder_point, p.min_stock_qty) AS reorder_threshold,
              c.name AS category_name,
              GREATEST(0, COALESCE(p.reorder_point, p.min_stock_qty) * 3 - p.stock_qty) AS suggested_qty
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.stock_qty <= COALESCE(p.reorder_point, p.min_stock_qty)
         AND p.deleted = FALSE AND p.min_stock_qty > 0
       ORDER BY (p.stock_qty / NULLIF(COALESCE(p.reorder_point, p.min_stock_qty), 0)) ASC
       LIMIT 50`
    );
    return rows;
  }

  async getPRDetails(db, id) {
    const [[pr]] = await db.query(
      `SELECT r.*,
              u1.full_name AS requested_by_name, u1.username AS requested_by_username,
              u2.full_name AS approved_by_name,
              u3.full_name AS rejected_by_name
       FROM purchase_requests r
       LEFT JOIN users u1 ON u1.id = r.requested_by
       LEFT JOIN users u2 ON u2.id = r.approved_by
       LEFT JOIN users u3 ON u3.id = r.rejected_by
       WHERE r.id=?`, [id]
    );
    if (!pr) return null;

    const [items] = await db.query(
      `SELECT ri.*, p.name AS product_name, p.sku,
              p.stock_qty AS stock_quantity, p.min_stock_qty AS min_stock_level,
              c.name AS category_name
       FROM purchase_request_items ri
       JOIN products p ON p.id = ri.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ri.pr_id=?`, [id]
    );
    const [linkedPOs] = await db.query(
      `SELECT po.id, po.po_code, po.status, po.total_amount, s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.pr_id=?`, [id]
    );
    return { ...pr, items, linkedPOs };
  }

  async getPOList(db, { status, supplierId, limit, offset }) {
    const conds = []; const params = [];
    if (status)     { conds.push('po.status=?');      params.push(status); }
    if (supplierId) { conds.push('po.supplier_id=?'); params.push(supplierId); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM purchase_orders po ${where}`, params);
    const [rows] = await db.query(
      `SELECT po.*, s.name AS supplier_name,
              u1.full_name AS created_by_name,
              u2.full_name AS confirmed_by_name,
              u3.full_name AS received_by_name,
              pr.pr_code,
              (SELECT COUNT(*) FROM purchase_order_items WHERE po_id=po.id) AS item_count
       FROM purchase_orders po
       LEFT JOIN suppliers s   ON s.id = po.supplier_id
       LEFT JOIN users u1      ON u1.id = po.created_by
       LEFT JOIN users u2      ON u2.id = po.confirmed_by
       LEFT JOIN users u3      ON u3.id = po.received_by
       LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
       ${where} ORDER BY po.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { total: Number(total), rows };
  }

  async getPOExport(db, status) {
    const conds = []; const params = [];
    if (status) { conds.push('po.status=?'); params.push(status); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const [rows] = await db.query(
      `SELECT po.po_code, po.status, s.name AS supplier_name,
              po.total_amount, po.delivery_date, po.note,
              pr.pr_code, u1.full_name AS created_by,
              po.created_at, u2.full_name AS received_by, po.received_at
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id=po.supplier_id
       LEFT JOIN purchase_requests pr ON pr.id=po.pr_id
       LEFT JOIN users u1 ON u1.id=po.created_by
       LEFT JOIN users u2 ON u2.id=po.received_by
       ${where} ORDER BY po.created_at DESC`, params
    );
    return rows;
  }

  async getPODetails(db, id) {
    const [[po]] = await db.query(
      `SELECT po.*, s.name AS supplier_name, s.phone AS supplier_phone,
              u1.full_name AS created_by_name,
              u2.full_name AS confirmed_by_name,
              u3.full_name AS received_by_name,
              pr.pr_code
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u1   ON u1.id = po.created_by
       LEFT JOIN users u2   ON u2.id = po.confirmed_by
       LEFT JOIN users u3   ON u3.id = po.received_by
       LEFT JOIN purchase_requests pr ON pr.id = po.pr_id
       WHERE po.id=?`, [id]
    );
    if (!po) return null;
    const [items] = await db.query(
      `SELECT poi.*, p.name AS product_name, p.sku,
              p.stock_qty AS stock_quantity, c.name AS category_name,
              (poi.quantity * poi.unit_price) AS total_price
       FROM purchase_order_items poi
       JOIN products p ON p.id = poi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE poi.po_id=?`, [id]
    );
    return { ...po, items };
  }

  async getAutoPRCheck(db) {
    const [rows] = await db.query(`
      SELECT p.id, p.sku, p.name, p.unit,
             p.stock_qty, p.reserved_quantity,
             (p.stock_qty - p.reserved_quantity) AS available_qty,
             p.min_stock_qty,
             COALESCE(p.reorder_point, p.min_stock_qty) AS reorder_point,
             p.avg_unit_price,
             c.name AS category_name,
             GREATEST(0, COALESCE(p.reorder_point, p.min_stock_qty) * 3 - p.stock_qty) AS suggested_qty,
             (
               SELECT COUNT(*) FROM purchase_request_items pri
               JOIN purchase_requests pr ON pr.id = pri.pr_id
               WHERE pri.product_id = p.id AND pr.status IN ('PENDING','APPROVED')
             ) AS has_active_pr
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.deleted = FALSE AND p.min_stock_qty > 0
        AND (p.stock_qty - p.reserved_quantity) < COALESCE(p.reorder_point, p.min_stock_qty)
      ORDER BY (p.stock_qty / NULLIF(COALESCE(p.reorder_point, p.min_stock_qty), 0)) ASC
    `);
    return rows;
  }

  async getPriceHistory(db, { productId, supplierId, limit, offset }) {
    const conds = []; const params = [];
    if (productId)  { conds.push('ph.product_id = ?');  params.push(productId); }
    if (supplierId) { conds.push('ph.supplier_id = ?'); params.push(supplierId); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM price_history ph ${where}`, params);
    const [rows] = await db.query(
      `SELECT ph.*, p.name AS product_name, p.sku,
              s.name AS supplier_name, u.full_name AS created_by_name
       FROM price_history ph
       JOIN products p       ON p.id = ph.product_id
       LEFT JOIN suppliers s ON s.id = ph.supplier_id
       LEFT JOIN users u     ON u.id = ph.changed_by
       ${where} ORDER BY ph.effective_date DESC, ph.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { total: Number(total), rows };
  }

  async getPriceHistoryByProduct(db, productId) {
    const [[prod]] = await db.query('SELECT id, name, sku, avg_unit_price FROM products WHERE id = ? AND deleted = FALSE', [productId]);
    if (!prod) return null;

    const [history] = await db.query(
      `SELECT ph.*, s.name AS supplier_name, u.full_name AS created_by_name
       FROM price_history ph
       LEFT JOIN suppliers s ON s.id = ph.supplier_id
       LEFT JOIN users u     ON u.id = ph.changed_by
       WHERE ph.product_id = ?
       ORDER BY ph.effective_date DESC, ph.created_at DESC LIMIT 100`, [productId]
    );
    return { prod, history };
  }
}

module.exports = new PurchaseReadRepository();
