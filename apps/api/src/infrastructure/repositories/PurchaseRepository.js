'use strict';
/**
 * PurchaseRepository.js — Data access cho purchase_requests + purchase_orders.
 * Clean Architecture — Layer 4 (Infrastructure)
 */
const db = require('../../shared/config/db');

class PurchaseRepository {
  // ──────────────────────────────────────────────────────────────
  // Purchase Requests (PR)
  // ──────────────────────────────────────────────────────────────

  async findPRById(connOrPool, id, lock = false) {
    const lockClause = lock ? 'FOR UPDATE NOWAIT' : '';
    const [[row]] = await connOrPool.query(
      `SELECT pr.*,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_name,
              u3.full_name AS rejected_by_name,
              s.name       AS supplier_name
       FROM purchase_requests pr
       LEFT JOIN users u1    ON u1.id = pr.created_by
       LEFT JOIN users u2    ON u2.id = pr.approved_by
       LEFT JOIN users u3    ON u3.id = pr.rejected_by
       LEFT JOIN suppliers s ON s.id  = pr.supplier_id
       WHERE pr.id = ? ${lockClause}`,
      [id]
    );
    return row || null;
  }

  async findMaxPRSeq(conn, prefix) {
    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(pr_code, -4) AS UNSIGNED)), 0) AS maxSeq
       FROM purchase_requests WHERE pr_code LIKE ? FOR UPDATE`,
      [`${prefix}%`]
    );
    return Number(maxSeq);
  }

  async createPR(conn, { prCode, supplierId, warehouseId, requestedBy, reason, priority, note }) {
    const [r] = await conn.query(
      `INSERT INTO purchase_requests
         (pr_code, supplier_id, warehouse_id, status, reason, priority, created_by, note)
       VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [prCode, supplierId || null, warehouseId || null, reason || null, priority || 'NORMAL', requestedBy, note?.trim() || null]
    );
    return r.insertId;
  }

  async createPRItems(conn, prId, items) {
    for (const item of items) {
      await conn.query(
        `INSERT INTO purchase_request_items
           (purchase_request_id, product_id, quantity, unit_id, estimated_unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [prId, item.productId, item.quantity, item.unitId || null, item.estimatedPrice || 0]
      );
    }
  }

  async findPRItems(connOrPool, prId) {
    const [rows] = await connOrPool.query(
      `SELECT pri.*, p.name AS product_name, p.sku, p.unit, p.stock_qty, p.price,
              u.name AS unit_name
       FROM purchase_request_items pri
       JOIN products p   ON p.id = pri.product_id
       LEFT JOIN units u ON u.id = pri.unit_id
       WHERE pri.purchase_request_id = ?
       ORDER BY p.name`,
      [prId]
    );
    return rows;
  }

  async updatePRStatus(conn, id, { status, approvedBy, rejectedBy, rejectedReason }) {
    const sets  = ['status = ?'];
    const params = [status];
    if (approvedBy) { sets.push('approved_by = ?, approved_at = NOW()'); params.push(approvedBy); }
    if (rejectedBy) { sets.push('rejected_by = ?, rejected_at = NOW()'); params.push(rejectedBy); }
    if (rejectedReason) { sets.push('reject_reason = ?'); params.push(rejectedReason); }
    params.push(id);
    await conn.query(`UPDATE purchase_requests SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  // ──────────────────────────────────────────────────────────────
  // Purchase Orders (PO)
  // ──────────────────────────────────────────────────────────────

  async findPOById(connOrPool, id, lock = false) {
    const lockClause = lock ? 'FOR UPDATE NOWAIT' : '';
    const [[row]] = await connOrPool.query(
      `SELECT po.*,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_name,
              u3.full_name AS received_by_name,
              u4.full_name AS cancelled_by_name,
              s.name       AS supplier_name,
              w.name       AS warehouse_name
       FROM purchase_orders po
       LEFT JOIN users u1      ON u1.id = po.created_by
       LEFT JOIN users u2      ON u2.id = po.approved_by
       LEFT JOIN users u3      ON u3.id = po.received_by
       LEFT JOIN users u4      ON u4.id = po.cancelled_by
       LEFT JOIN suppliers s   ON s.id  = po.supplier_id
       LEFT JOIN warehouses w  ON w.id  = po.warehouse_id
       WHERE po.id = ? ${lockClause}`,
      [id]
    );
    return row || null;
  }

  async findMaxPOSeq(conn, prefix) {
    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(po_code, -4) AS UNSIGNED)), 0) AS maxSeq
       FROM purchase_orders WHERE po_code LIKE ? FOR UPDATE`,
      [`${prefix}%`]
    );
    return Number(maxSeq);
  }

  async createPO(conn, { poCode, supplierId, warehouseId, purchaseRequestId, totalAmount, createdBy, note }) {
    const [r] = await conn.query(
      `INSERT INTO purchase_orders
         (po_code, supplier_id, warehouse_id, purchase_request_id,
          status, total_amount, created_by, note)
       VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [poCode, supplierId || null, warehouseId || null, purchaseRequestId || null,
       totalAmount || 0, createdBy, note?.trim() || null]
    );
    return r.insertId;
  }

  async createPOItems(conn, poId, items) {
    for (const item of items) {
      const qty   = Number(item.quantity);
      const price = Number(item.unitPrice || 0);
      await conn.query(
        `INSERT INTO purchase_order_items
           (purchase_order_id, product_id, quantity, unit_price, total_price, unit_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [poId, item.productId, qty, price, qty * price, item.unitId || null]
      );
    }
  }

  async markPOReceived(conn, poId, receivedBy) {
    await conn.query(
      `UPDATE purchase_orders
       SET status = 'RECEIVED', received_by = ?, received_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [receivedBy, poId]
    );
  }

  async findPOItems(connOrPool, poId) {
    const [rows] = await connOrPool.query(
      `SELECT poi.*, p.name AS product_name, p.sku, p.unit, p.stock_qty,
              u.name AS unit_name
       FROM purchase_order_items poi
       JOIN products p   ON p.id = poi.product_id
       LEFT JOIN units u ON u.id = poi.unit_id
       WHERE poi.purchase_order_id = ?
       ORDER BY p.name`,
      [poId]
    );
    return rows;
  }

  async updatePOStatus(conn, id, { status, approvedBy, receivedBy }) {
    const sets  = ['status = ?'];
    const params = [status];
    if (approvedBy) { sets.push('approved_by = ?, approved_at = NOW()'); params.push(approvedBy); }
    if (receivedBy) { sets.push('received_by = ?, received_at = NOW()'); params.push(receivedBy); }
    params.push(id);
    await conn.query(`UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  // ──────────────────────────────────────────────────────────────
  // State Transitions & Helpers
  // ──────────────────────────────────────────────────────────────

  async genPRCode(conn) {
    const d      = new Date();
    const ym     = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `PR-${ym}-`;
    const maxSeq = await this.findMaxPRSeq(conn, prefix);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  async genPOCode(conn) {
    const d      = new Date();
    const ym     = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `PO-${ym}-`;
    const maxSeq = await this.findMaxPOSeq(conn, prefix);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  async approvePR(conn, id, userId) {
    await conn.query(
      `UPDATE purchase_requests
       SET status='APPROVED', approved_by=?, approved_at=NOW(), updated_at=NOW()
       WHERE id=?`,
      [userId, id]
    );
  }

  async rejectPR(conn, id, userId, reason) {
    await conn.query(
      `UPDATE purchase_requests
       SET status='REJECTED', rejected_by=?, rejected_at=NOW(), reject_reason=?, updated_at=NOW()
       WHERE id=?`,
      [userId, reason, id]
    );
  }

  async cancelPR(conn, id, userId) {
    await conn.query(
      `UPDATE purchase_requests
       SET status='CANCELLED', cancelled_by=?, cancelled_at=NOW(), updated_at=NOW()
       WHERE id=?`,
      [userId, id]
    );
  }

  async confirmPO(conn, id, userId) {
    await conn.query(
      `UPDATE purchase_orders
       SET status = 'CONFIRMED', approved_by = ?, approved_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [userId, id]
    );
  }

  async findPRForUpdate(conn, id) {
    const [[row]] = await conn.query(
      'SELECT id, status, pr_code FROM purchase_requests WHERE id = ? FOR UPDATE NOWAIT',
      [id]
    );
    return row || null;
  }

  async findPOForUpdate(conn, id) {
    const [[row]] = await conn.query(
      'SELECT id, status, po_code, purchase_request_id FROM purchase_orders WHERE id = ? FOR UPDATE NOWAIT',
      [id]
    );
    return row || null;
  }

  async cancelPO(conn, id, userId) {
    await conn.query(
      `UPDATE purchase_orders
       SET status='CANCELLED', cancelled_by=?, cancelled_at=NOW(), updated_at=NOW()
       WHERE id=?`,
      [userId, id]
    );
  }

  async reactivatePR(conn, prId) {
    await conn.query(
      `UPDATE purchase_requests
       SET status='APPROVED', updated_at=NOW()
       WHERE id=? AND status='CONVERTED'`,
      [prId]
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Listing & Analytics
  // ──────────────────────────────────────────────────────────────

  async findAllPR({ page = 1, size = 20, status, priority, warehouseFilter, dateFrom, dateTo, search } = {}) {
    const where  = [];
    const params = [];
    if (status)   { where.push('pr.status = ?');   params.push(status.toUpperCase()); }
    if (priority) { where.push('pr.priority = ?'); params.push(priority.toUpperCase()); }
    if (dateFrom) { where.push('DATE(pr.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo)   { where.push('DATE(pr.created_at) <= ?'); params.push(dateTo); }
    if (search)   {
      where.push('(pr.pr_code LIKE ? OR pr.note LIKE ? OR u1.full_name LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (warehouseFilter && warehouseFilter.clause !== '1=1') {
      where.push(warehouseFilter.clause);
      params.push(...warehouseFilter.params);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM purchase_requests pr LEFT JOIN users u1 ON u1.id = pr.created_by ${w}`, params
    );
    const [rows] = await db.query(
      `SELECT pr.*, u1.full_name AS requested_by_name,
              (SELECT COUNT(*) FROM purchase_request_items WHERE purchase_request_id=pr.id) AS item_count
       FROM purchase_requests pr
       LEFT JOIN users u1 ON u1.id = pr.created_by
       ${w}
       ORDER BY pr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, size, (Math.max(1, page) - 1) * size]
    );
    return { items: rows, totalCount: total, page, size };
  }

  async findAllPO({ page = 1, size = 20, status, warehouseFilter, dateFrom, dateTo, search } = {}) {
    const where  = [];
    const params = [];
    if (status) { where.push('po.status = ?'); params.push(status.toUpperCase()); }
    if (dateFrom) { where.push('DATE(po.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo)   { where.push('DATE(po.created_at) <= ?'); params.push(dateTo); }
    if (search)   {
      where.push('(po.po_code LIKE ? OR po.note LIKE ? OR s.name LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (warehouseFilter && warehouseFilter.clause !== '1=1') {
      where.push(warehouseFilter.clause);
      params.push(...warehouseFilter.params);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id ${w}`, params
    );
    const [rows] = await db.query(
      `SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name, u1.full_name AS created_by_name,
              (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id=po.id) AS item_count
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN warehouses w ON w.id = po.warehouse_id
       LEFT JOIN users u1 ON u1.id = po.created_by
       ${w}
       ORDER BY po.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, size, (Math.max(1, page) - 1) * size]
    );
    return { items: rows, totalCount: total, page, size };
  }

  async getPriceHistory({ page = 1, size = 20, productId, supplierId, dateFrom, dateTo, search } = {}) {
    const where = [];
    const params = [];
    if (productId)  { where.push('ph.product_id = ?');  params.push(productId); }
    if (supplierId) { where.push('ph.supplier_id = ?'); params.push(supplierId); }
    if (dateFrom)   { where.push('ph.effective_date >= ?'); params.push(dateFrom); }
    if (dateTo)     { where.push('ph.effective_date <= ?'); params.push(dateTo); }
    if (search)     {
      where.push('(p.name LIKE ? OR s.name LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM price_history ph 
       LEFT JOIN products p ON p.id = ph.product_id 
       LEFT JOIN suppliers s ON s.id = ph.supplier_id ${w}`, params
    );

    const [rows] = await db.query(
      `SELECT ph.id, ph.product_id AS productId, ph.supplier_id AS supplierId,
              ph.purchase_order_id AS purchaseOrderId, ph.unit_price AS unitPrice,
              ph.quantity, ph.effective_date AS effectiveDate, ph.note,
              p.name AS productName, p.sku, s.name AS supplierName, 
              u.full_name AS createdByName
       FROM price_history ph
       LEFT JOIN products p  ON p.id = ph.product_id
       LEFT JOIN suppliers s ON s.id = ph.supplier_id
       LEFT JOIN users u     ON u.id = ph.changed_by
       ${w}
       ORDER BY ph.effective_date DESC, ph.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, size, (Math.max(1, page) - 1) * size]
    );
    return { items: rows, totalCount: total, page, size };
  }

  async getSuggestedPRItems() {
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.sku, p.unit, p.stock_qty, p.min_stock_qty,
              COALESCE(p.reorder_point, p.min_stock_qty) AS reorder_threshold,
              GREATEST(0, COALESCE(p.reorder_point, p.min_stock_qty) * 3 - p.stock_qty) AS suggested_qty
       FROM products p
       WHERE p.stock_qty <= COALESCE(p.reorder_point, p.min_stock_qty)
         AND p.deleted = FALSE AND p.min_stock_qty > 0
       ORDER BY (p.stock_qty / NULLIF(COALESCE(p.reorder_point, p.min_stock_qty), 0)) ASC
       LIMIT 50`
    );
    return rows;
  }

  async getPOExportData({ status, dateFrom, dateTo, search, warehouseFilter } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('po.status = ?'); params.push(status.toUpperCase()); }
    if (dateFrom) { where.push('DATE(po.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('DATE(po.created_at) <= ?'); params.push(dateTo); }
    if (search) {
      where.push('(po.po_code LIKE ? OR s.name LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (warehouseFilter && warehouseFilter.clause !== '1=1') {
      where.push(warehouseFilter.clause);
      params.push(...warehouseFilter.params);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name,
              u1.full_name AS created_by_name, u2.full_name AS approved_by_name,
              u3.full_name AS received_by_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN warehouses w ON w.id = po.warehouse_id
       LEFT JOIN users u1 ON u1.id = po.created_by
       LEFT JOIN users u2 ON u2.id = po.approved_by
       LEFT JOIN users u3 ON u3.id = po.received_by
       ${w} ORDER BY po.created_at DESC`,
      params
    );
    return rows;
  }

  // ──────────────────────────────────────────────────────────────
  // Auto-PR Helpers
  // ──────────────────────────────────────────────────────────────

  async getLowStockForAutoPR(conn, filterProductIds = null) {
    let sql = `
      SELECT p.id, p.name, p.sku, p.stock_qty, p.reserved_quantity,
             COALESCE(p.reorder_point, p.min_stock_qty) AS reorder_point,
             GREATEST(0, COALESCE(p.reorder_point, p.min_stock_qty) * 3 - p.stock_qty) AS suggested_qty
      FROM products p
      WHERE p.deleted = FALSE AND p.min_stock_qty > 0
        AND (p.stock_qty - p.reserved_quantity) < COALESCE(p.reorder_point, p.min_stock_qty)
        AND (
          SELECT COUNT(*) FROM purchase_request_items pri
          JOIN purchase_requests pr ON pr.id = pri.purchase_request_id
          WHERE pri.product_id = p.id AND pr.status IN ('PENDING','APPROVED')
        ) = 0
    `;
    const params = [];
    if (Array.isArray(filterProductIds) && filterProductIds.length > 0) {
      sql += ` AND p.id IN (${filterProductIds.map(() => '?').join(',')})`;
      params.push(...filterProductIds);
    }
    sql += ' ORDER BY (p.stock_qty / NULLIF(COALESCE(p.reorder_point,p.min_stock_qty),0)) ASC LIMIT 50';
    const [rows] = await conn.query(sql, params);
    return rows;
  }

  async createAutoPRWithItems(conn, { prCode, reason, priority, note, createdBy, items }) {
    const [r] = await conn.query(
      `INSERT INTO purchase_requests (pr_code, status, reason, priority, note, created_by)
       VALUES (?, 'PENDING', ?, ?, ?, ?)`,
      [prCode, reason, priority || 'HIGH', note || null, createdBy]
    );
    const prId = r.insertId;
    for (const item of items) {
      const qty = Math.max(1, Number(item.suggested_qty) || 1);
      await conn.query(
        'INSERT INTO purchase_request_items (purchase_request_id, product_id, quantity, note) VALUES (?,?,?,?)',
        [prId, item.id, qty, `Tồn: ${item.stock_qty} — Ngưỡng: ${item.reorder_point}`]
      );
    }
    return prId;
  }

  async notifyManagersForAutoPR(conn, prId, prCode, itemCount) {
    const [managers] = await conn.query(
      "SELECT id FROM users WHERE role IN ('MANAGER','ADMIN') AND deleted=0 AND active=1"
    );
    for (const m of managers) {
      await conn.query(
        `INSERT INTO notifications (type, title, message, user_id, ref_id, ref_type)
         VALUES ('PURCHASE_REQUEST', ?, ?, ?, ?, 'purchase_request')`,
        [`Auto-PR: ${prCode}`, `Hệ thống tạo PR cho ${itemCount} SP tồn thấp.`, m.id, prId]
      ).catch(() => {});
    }
  }
}

module.exports = new PurchaseRepository();