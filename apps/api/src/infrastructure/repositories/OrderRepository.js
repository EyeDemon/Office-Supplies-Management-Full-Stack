'use strict';
/**
 * OrderRepository.js — Data access cho import_orders, export_orders, stock_transfers.
 *
 * Clean Architecture — Layer 4 (Infrastructure):
 *   - Biết MySQL. KHÔNG chứa business logic.
 *   - inventory.controller.js (Layer 3) gọi vào đây thay vì query DB trực tiếp.
 *
 * Pattern: Tất cả write methods nhận `conn` (MySQL connection trong transaction).
 *          Read-with-lock dùng FOR UPDATE NOWAIT (Spec VIII.6).
 */
const db = require('../../shared/config/db');

class OrderRepository {

  // ══════════════════════════════════════════════════════════════════
  // IMPORT ORDERS (Phiếu nhập kho)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Tìm import order + lock FOR UPDATE NOWAIT (để tránh race condition).
   * @param {object} conn
   * @param {number} id
   * @returns {Promise<{id,order_code,warehouse_id,status}|null>}
   */
  async findImportOrderForUpdate(conn, id) {
    const [[row]] = await conn.query(
      `SELECT id, order_code, warehouse_id, status
       FROM import_orders WHERE id = ? FOR UPDATE NOWAIT`,
      [id]
    );
    return row || null;
  }

  /**
   * Lấy danh sách items của import order.
   * @param {object} conn
   * @param {number} orderId
   * @returns {Promise<Array<{product_id,quantity,unit_price,unit_id,lot_id}>>}
   */
  async findImportOrderItems(conn, orderId) {
    const [rows] = await conn.query(
      `SELECT product_id, quantity, unit_price, unit_id, lot_id
       FROM import_order_items WHERE order_id = ?`,
      [orderId]
    );
    return rows;
  }

  /**
   * Đánh dấu import order là COMPLETED.
   * @param {object} conn
   * @param {number} id
   * @param {number} userId
   */
  async markImportCompleted(conn, id, userId) {
    await conn.query(
      `UPDATE import_orders
       SET status = 'COMPLETED', completed_by = ?, completed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [userId, id]
    );
  }

  async findAllImport(db, { status, supplierId, dateFrom, dateTo, warehouseFilter, size, offset }) {
    const where = [];
    const params = [];
    if (status) { where.push('o.status=?'); params.push(status.toUpperCase()); }
    if (supplierId) { where.push('o.supplier_id=?'); params.push(supplierId); }
    if (dateFrom) { where.push('DATE(o.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('DATE(o.created_at) <= ?'); params.push(dateTo); }
    
    if (warehouseFilter && warehouseFilter.clause !== '1=1') {
      where.push(warehouseFilter.clause);
      params.push(...warehouseFilter.params);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM import_orders o ${w}`, params
    );
    const [rows] = await db.query(
      `SELECT o.*, s.name AS supplier_name, s.code AS supplier_code,
              u1.full_name AS created_by_name,
              u2.full_name AS submitted_by_name,
              u3.full_name AS approved_by_name,
              u4.full_name AS confirmed_by_name,
              u5.full_name AS completed_by_name,
              u6.full_name AS cancelled_by_name,
              u7.full_name AS rejected_by_name,
              (SELECT COUNT(*) FROM import_order_items WHERE order_id = o.id) AS item_count
       FROM import_orders o
       LEFT JOIN suppliers s ON s.id = o.supplier_id
       LEFT JOIN users u1 ON u1.id = o.created_by
       LEFT JOIN users u2 ON u2.id = o.submitted_by
       LEFT JOIN users u3 ON u3.id = o.approved_by
       LEFT JOIN users u4 ON u4.id = o.confirmed_by
       LEFT JOIN users u5 ON u5.id = o.completed_by
       LEFT JOIN users u6 ON u6.id = o.cancelled_by
       LEFT JOIN users u7 ON u7.id = o.rejected_by
       ${w}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    return { total: Number(total), rows };
  }

  async findImportById(db, id) {
    const [[o]] = await db.query(
      `SELECT o.*, s.name AS supplier_name, s.code AS supplier_code,
              w.name AS warehouse_name,
              u1.full_name AS created_by_name,
              u2.full_name AS submitted_by_name,
              u3.full_name AS approved_by_name,
              u4.full_name AS confirmed_by_name,
              u5.full_name AS cancelled_by_name,
              u6.full_name AS completed_by_name,
              u7.full_name AS rejected_by_name
       FROM import_orders o
       LEFT JOIN suppliers s ON s.id = o.supplier_id
       LEFT JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN users u1 ON u1.id = o.created_by
       LEFT JOIN users u2 ON u2.id = o.submitted_by
       LEFT JOIN users u3 ON u3.id = o.approved_by
       LEFT JOIN users u4 ON u4.id = o.confirmed_by
       LEFT JOIN users u5 ON u5.id = o.cancelled_by
       LEFT JOIN users u6 ON u6.id = o.completed_by
       LEFT JOIN users u7 ON u7.id = o.rejected_by
       WHERE o.id=?`, [id]
    );
    if (!o) return null;

    const [items] = await db.query(
      `SELECT oi.*, p.name AS product_name, p.sku, p.unit, p.stock_qty, c.name AS category_name
       FROM import_order_items oi
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id AND c.deleted = FALSE
       WHERE oi.order_id=?
       ORDER BY p.name`, [id]
    );
    return { ...o, items };
  }

  async generateImportCode(conn) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(order_code, -4) AS UNSIGNED)), 0) AS maxSeq
       FROM import_orders WHERE order_code LIKE ?`,
      [`PN-${today}-%`]
    );
    return `PN-${today}-${String(maxSeq + 1).padStart(4, '0')}`;
  }

  async createImport(conn, { orderCode, supplierId, warehouseId, totalAmount, note, createdBy }) {
    const [r] = await conn.query(
      'INSERT INTO import_orders (order_code, supplier_id, warehouse_id, status, total_amount, note, created_by) VALUES(?,?,?,?,?,?,?)',
      [orderCode, supplierId || null, warehouseId || null, 'DRAFT', totalAmount, note || null, createdBy]
    );
    return r.insertId;
  }

  async insertImportItems(conn, orderId, items) {
    for (const item of items) {
      const qty = parseInt(item.quantity);
      const price = Number(item.unitPrice || 0);
      await conn.query(
        'INSERT INTO import_order_items (order_id, product_id, quantity, unit_price, total_price) VALUES(?,?,?,?,?)',
        [orderId, parseInt(item.productId), qty, price, qty * price]
      );
    }
  }

  async updateImport(conn, id, { supplierId, note, totalAmount }) {
    await conn.query(
      'UPDATE import_orders SET supplier_id=?, note=?, total_amount=?, updated_at=NOW() WHERE id=?',
      [supplierId || null, note || null, totalAmount, id]
    );
    await conn.query('DELETE FROM import_order_items WHERE order_id=?', [id]);
  }

  async updateImportStatus(conn, id, { status, userId, reason = null }) {
    const fieldMap = {
      PENDING:   { status: 'PENDING',   by: 'submitted_by', at: 'submitted_at' },
      APPROVED:  { status: 'APPROVED',  by: 'approved_by',  at: 'approved_at' },
      CANCELLED: { status: 'CANCELLED', by: 'cancelled_by', at: 'cancelled_at' },
      REJECTED:  { status: 'REJECTED',  by: 'rejected_by',  at: 'rejected_at' },
      COMPLETED: { status: 'COMPLETED', by: 'completed_by', at: 'completed_at' },
    };
    const conf = fieldMap[status];
    if (!conf) throw new Error('Invalid status transition: ' + status);

    let sql = `UPDATE import_orders SET status = ?, ${conf.by} = ?, ${conf.at} = NOW(), updated_at = NOW()`;
    const params = [conf.status, userId];
    
    if (reason) {
      sql += `, note = CONCAT(COALESCE(note,""), " [Reason: ", ?, "]")`;
      params.push(reason);
    }
    sql += ` WHERE id = ?`;
    params.push(id);
    
    await conn.query(sql, params);
  }

  // ══════════════════════════════════════════════════════════════════
  // EXPORT ORDERS (Phiếu xuất kho)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Tìm export order + lock FOR UPDATE NOWAIT.
   * @param {object} conn
   * @param {number} id
   * @returns {Promise<{id,order_code,warehouse_id,status,requisition_id}|null>}
   */
  async findExportOrderForUpdate(conn, id) {
    const [[row]] = await conn.query(
      `SELECT id, order_code, warehouse_id, status, requisition_id
       FROM export_orders WHERE id = ? FOR UPDATE NOWAIT`,
      [id]
    );
    return row || null;
  }

  /**
   * Lấy danh sách items của export order.
   * @param {object} conn
   * @param {number} orderId
   * @returns {Promise<Array<{product_id,quantity,unit_id,lot_id}>>}
   */
  async findExportOrderItems(conn, orderId) {
    const [rows] = await conn.query(
      `SELECT product_id, quantity, unit_id, lot_id
       FROM export_order_items WHERE order_id = ?`,
      [orderId]
    );
    return rows;
  }

  /**
   * Đánh dấu export order là COMPLETED.
   * @param {object} conn
   * @param {number} id
   * @param {number} userId
   */
  async markExportCompleted(conn, id, userId) {
    await conn.query(
      `UPDATE export_orders
       SET status = 'COMPLETED', completed_by = ?, completed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [userId, id]
    );
  }

  async findAllExport(db, { status, search, dateFrom, dateTo, warehouseFilter, limit, offset }) {
    const conds = [];
    const params = [];
    if (status) { conds.push('e.status = ?'); params.push(status); }
    if (search) {
      conds.push('(e.order_code LIKE ? OR e.recipient_name LIKE ? OR e.department LIKE ?)');
      params.push(search, search, search);
    }
    if (dateFrom) { conds.push('DATE(e.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo)   { conds.push('DATE(e.created_at) <= ?'); params.push(dateTo); }
    
    if (warehouseFilter && warehouseFilter.clause !== '1=1') {
      conds.push(warehouseFilter.clause);
      params.push(...warehouseFilter.params);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM export_orders e ${where}`, params);
    const [rows] = await db.query(
      `SELECT e.*,
              u1.full_name AS created_by_name,   u2.full_name AS submitted_by_name,
              u3.full_name AS approved_by_name,  u4.full_name AS completed_by_name,
              u5.full_name AS cancelled_by_name, u6.full_name AS rejected_by_name,
              w.name AS warehouse_name,
              r.req_code AS requisition_code
       FROM export_orders e
       LEFT JOIN users u1 ON u1.id=e.created_by    LEFT JOIN users u2 ON u2.id=e.submitted_by
       LEFT JOIN users u3 ON u3.id=e.approved_by   LEFT JOIN users u4 ON u4.id=e.completed_by
       LEFT JOIN users u5 ON u5.id=e.cancelled_by  LEFT JOIN users u6 ON u6.id=e.rejected_by
       LEFT JOIN warehouses w ON w.id=e.warehouse_id
       LEFT JOIN requisitions r ON r.id=e.requisition_id
       ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { total: Number(total), rows };
  }

  async findExportById(db, id) {
    const [[order]] = await db.query(
      `SELECT e.*,
              u1.full_name AS created_by_name,   u2.full_name AS submitted_by_name,
              u3.full_name AS approved_by_name,  u4.full_name AS completed_by_name,
              u5.full_name AS cancelled_by_name, u6.full_name AS rejected_by_name, 
              w.name AS warehouse_name,
              r.req_code AS requisition_code
       FROM export_orders e
       LEFT JOIN users u1 ON u1.id=e.created_by    LEFT JOIN users u2 ON u2.id=e.submitted_by
       LEFT JOIN users u3 ON u3.id=e.approved_by   LEFT JOIN users u4 ON u4.id=e.completed_by
       LEFT JOIN users u5 ON u5.id=e.cancelled_by  LEFT JOIN users u6 ON u6.id=e.rejected_by
       LEFT JOIN warehouses w ON w.id=e.warehouse_id
       LEFT JOIN requisitions r ON r.id=e.requisition_id
       WHERE e.id=?`, [id]
    );
    if (!order) return null;

    const [items] = await db.query(
      `SELECT ei.*, p.name AS product_name, p.sku, p.unit, p.stock_qty, p.base_unit_id, un.name AS unit_name
       FROM export_order_items ei
       JOIN products p ON p.id = ei.product_id
       LEFT JOIN units un ON un.id = ei.unit_id
       WHERE ei.order_id = ? ORDER BY p.name`, [id]
    );
    return { ...order, items };
  }

  async generateExportCode(conn) {
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `XK-${ym}-`;
    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(order_code, -4) AS UNSIGNED)), 0) AS maxSeq
       FROM export_orders WHERE order_code LIKE ?`,
      [`${prefix}%`]
    );
    return `${prefix}${String(Number(maxSeq) + 1).padStart(4, '0')}`;
  }

  async createExport(conn, { orderCode, recipientName, department, warehouseId, note, totalQty, createdBy, status = 'DRAFT', requisitionId = null }) {
    const [r] = await conn.query(
      `INSERT INTO export_orders (order_code, status, recipient_name, department, warehouse_id, note, total_qty, created_by, requisition_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderCode, status, recipientName || null, department || null, warehouseId || null, note || null, totalQty, createdBy, requisitionId]
    );
    return r.insertId;
  }

  async insertExportItems(conn, orderId, items) {
    for (const item of items) {
      await conn.query(
        `INSERT INTO export_order_items (order_id, product_id, quantity, unit_id, lot_id, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.productId, parseInt(item.quantity), item.unitId || null, item.lotId || null, item.note || null]
      );
    }
  }

  async updateExport(conn, id, { recipientName, department, warehouseId, note, totalQty }) {
    await conn.query(
      'UPDATE export_orders SET recipient_name=?, department=?, warehouse_id=?, note=?, total_qty=?, updated_at=NOW() WHERE id=?',
      [recipientName || null, department || null, warehouseId || null, note || null, totalQty, id]
    );
    await conn.query('DELETE FROM export_order_items WHERE order_id=?', [id]);
  }

  async updateExportStatus(conn, id, { status, userId, reason = null }) {
    const fieldMap = {
      PENDING:   { status: 'PENDING',   by: 'submitted_by', at: 'submitted_at' },
      APPROVED:  { status: 'APPROVED',  by: 'approved_by',  at: 'approved_at' },
      CANCELLED: { status: 'CANCELLED', by: 'cancelled_by', at: 'cancelled_at' },
      REJECTED:  { status: 'REJECTED',  by: 'rejected_by',  at: 'rejected_at' },
    };
    const conf = fieldMap[status];
    if (!conf) throw new Error('Invalid status transition: ' + status);

    let sql = `UPDATE export_orders SET status = ?, ${conf.by} = ?, ${conf.at} = NOW(), updated_at = NOW()`;
    const params = [conf.status, userId];
    sql += ` WHERE id = ?`;
    params.push(id);
    await conn.query(sql, params);
  }

  async updateFulfilledQuantity(conn, orderId, productId, qty) {
    await conn.query(
      `UPDATE export_order_items SET quantity_fulfilled = COALESCE(quantity_fulfilled, 0) + ?
       WHERE order_id = ? AND product_id = ?`,
      [qty, orderId, productId]
    );
  }

  async checkAndMarkExportFulfillment(conn, id, userId) {
    const [items] = await conn.query(
      `SELECT SUM(quantity) as total_qty, SUM(quantity_fulfilled) as total_fulfilled
       FROM export_order_items WHERE order_id = ?`,
      [id]
    );
    const { total_qty, total_fulfilled } = items[0];
    
    let status = 'PARTIAL';
    if (Number(total_fulfilled) >= Number(total_qty)) {
      status = 'COMPLETED';
    }

    await conn.query(
      `UPDATE export_orders
       SET status = ?, completed_by = IF(?, ?, completed_by), completed_at = IF(?, NOW(), completed_at), updated_at = NOW()
       WHERE id = ?`,
      [status, status === 'COMPLETED', userId, status === 'COMPLETED', id]
    );
    return status;
  }

  // ══════════════════════════════════════════════════════════════════
  // STOCK TRANSFERS (Phiếu điều chuyển)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Tìm transfer + lock FOR UPDATE NOWAIT.
   * @param {object} conn
   * @param {number} id
   * @returns {Promise<{id,transfer_code,from_warehouse_id,to_warehouse_id,status}|null>}
   */
  async findTransferForUpdate(conn, id) {
    const [[row]] = await conn.query(
      `SELECT id, transfer_code, from_warehouse_id, to_warehouse_id, status
       FROM stock_transfers WHERE id = ? FOR UPDATE NOWAIT`,
      [id]
    );
    return row || null;
  }

  /**
   * Lấy danh sách items của transfer.
   * @param {object} conn
   * @param {number} transferId
   * @returns {Promise<Array<{product_id,quantity,unit_id,lot_id}>>}
   */
  async findTransferItems(conn, transferId) {
    const [rows] = await conn.query(
      `SELECT product_id, quantity, unit_id, lot_id
       FROM stock_transfer_items WHERE transfer_id = ?`,
      [transferId]
    );
    return rows;
  }

  /**
   * Đánh dấu transfer là COMPLETED.
   * @param {object} conn
   * @param {number} id
   * @param {number} userId
   */
  async markTransferCompleted(conn, id, userId) {
    await conn.query(
      `UPDATE stock_transfers
       SET status = 'COMPLETED', completed_by = ?, completed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [userId, id]
    );
  }

  async findAllTransfers(db, { status, search, warehouseFilter, limit, offset }) {
    const conds = [];
    const params = [];
    if (status) { conds.push('t.status = ?'); params.push(status); }
    if (search) {
      conds.push('(t.transfer_code LIKE ? OR t.from_location LIKE ? OR t.to_location LIKE ?)');
      params.push(search, search, search);
    }
    
    if (warehouseFilter && warehouseFilter.clause !== '1=1') {
      // User can see if they are in from OR to warehouse
      // This is handled in the controller by building a custom filter
      conds.push(warehouseFilter.clause);
      params.push(...warehouseFilter.params);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM stock_transfers t ${where}`, params);
    const [rows] = await db.query(
      `SELECT t.*,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_name,
              u3.full_name AS completed_by_name,
              u4.full_name AS cancelled_by_name
       FROM stock_transfers t
       LEFT JOIN users u1 ON u1.id = t.created_by
       LEFT JOIN users u2 ON u2.id = t.approved_by
       LEFT JOIN users u3 ON u3.id = t.completed_by
       LEFT JOIN users u4 ON u4.id = t.cancelled_by
       ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { total: Number(total), rows };
  }

  async findTransferById(db, id) {
    const [[t]] = await db.query(
      `SELECT t.*,
              u1.full_name AS created_by_name,
              u2.full_name AS approved_by_name,
              u3.full_name AS completed_by_name,
              u4.full_name AS cancelled_by_name,
              w1.name AS from_warehouse_name,
              w2.name AS to_warehouse_name
       FROM stock_transfers t
       LEFT JOIN users u1 ON u1.id = t.created_by
       LEFT JOIN users u2 ON u2.id = t.approved_by
       LEFT JOIN users u3 ON u3.id = t.completed_by
       LEFT JOIN users u4 ON u4.id = t.cancelled_by
       LEFT JOIN warehouses w1 ON w1.id = t.from_warehouse_id
       LEFT JOIN warehouses w2 ON w2.id = t.to_warehouse_id
       WHERE t.id=?`, [id]
    );
    if (!t) return null;

    const [items] = await db.query(
      `SELECT ti.*, p.name AS product_name, p.sku, p.unit, p.stock_qty, p.base_unit_id, un.name AS unit_name
       FROM stock_transfer_items ti
       JOIN products p ON p.id = ti.product_id
       LEFT JOIN units un ON un.id = ti.unit_id
       WHERE ti.transfer_id = ?`, [id]
    );
    return { ...t, items };
  }

  async createTransfer(conn, { transferCode, fromLocation, toLocation, fromWarehouseId, toWarehouseId, note, createdBy }) {
    const [r] = await conn.query(
      `INSERT INTO stock_transfers (transfer_code, status, from_location, to_location, from_warehouse_id, to_warehouse_id, note, created_by)
       VALUES (?, 'DRAFT', ?, ?, ?, ?, ?, ?)`,
      [transferCode, fromLocation || null, toLocation || null, fromWarehouseId || null, toWarehouseId || null, note || null, createdBy]
    );
    return r.insertId;
  }

  async insertTransferItems(conn, transferId, items) {
    for (const item of items) {
      await conn.query(
        `INSERT INTO stock_transfer_items (transfer_id, product_id, quantity, unit_id, lot_id, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [transferId, item.productId, parseInt(item.quantity), item.unitId || null, item.lotId || null, item.note || null]
      );
    }
  }

  async updateTransfer(conn, id, { fromLocation, toLocation, fromWarehouseId, toWarehouseId, note }) {
    await conn.query(
      'UPDATE stock_transfers SET from_location=?, to_location=?, from_warehouse_id=?, to_warehouse_id=?, note=?, updated_at=NOW() WHERE id=?',
      [fromLocation || null, toLocation || null, fromWarehouseId || null, toWarehouseId || null, note || null, id]
    );
    await conn.query('DELETE FROM stock_transfer_items WHERE transfer_id=?', [id]);
  }

  async updateTransferStatus(conn, id, { status, userId }) {
    const fieldMap = {
      PENDING:   { status: 'PENDING',    by: 'submitted_by', at: 'submitted_at' }, // Wait, transfers might not have submitted_by
      APPROVED:  { status: 'APPROVED',   by: 'approved_by',  at: 'approved_at' },
      CANCELLED: { status: 'CANCELLED',  by: 'cancelled_by', at: 'cancelled_at' },
      IN_TRANSIT:{ status: 'IN_TRANSIT', by: 'shipped_by',   at: 'shipped_at' },
    };
    // Let's check stock_transfers table schema for these fields.
    // Actually, I'll just use a generic update if fields are missing.
    
    let sql = `UPDATE stock_transfers SET status = ?, updated_at = NOW()`;
    const params = [status];
    
    if (status === 'APPROVED') { sql += `, approved_by = ?, approved_at = NOW()`; params.push(userId); }
    if (status === 'CANCELLED') { sql += `, cancelled_by = ?, cancelled_at = NOW()`; params.push(userId); }
    if (status === 'IN_TRANSIT') { sql += `, shipped_by = ?, shipped_at = NOW()`; params.push(userId); }
    
    sql += ` WHERE id = ?`;
    params.push(id);
    await conn.query(sql, params);
  }
}

module.exports = new OrderRepository()