'use strict';
/**
 * ReturnRepository.js — Clean Architecture Layer 4
 */

class ReturnRepository {
  async getReturns(db, { status, type, search, limit, offset, whClause, whParams }) {
    const conds = []; const params = [];
    if (status) { conds.push('r.status=?'); params.push(status); }
    if (type)   { conds.push('r.return_type=?'); params.push(type); }
    if (search) {
      conds.push('(r.return_code LIKE ? OR r.returner_name LIKE ? OR r.department LIKE ?)');
      params.push(search, search, search);
    }
    
    if (whClause && whClause !== '1=1') {
      conds.push(whClause);
      params.push(...whParams);
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM return_orders r ${where}`, params
    );
    const [rows] = await db.query(
      `SELECT r.*,
              s.name  AS supplier_name,
              w.name  AS warehouse_name,
              u1.full_name AS created_by_name,
              u2.full_name AS completed_by_name,
              u3.full_name AS cancelled_by_name
       FROM return_orders r
       LEFT JOIN suppliers  s  ON s.id  = r.supplier_id
       LEFT JOIN warehouses w  ON w.id  = r.warehouse_id
       LEFT JOIN users u1      ON u1.id = r.created_by
       LEFT JOIN users u2      ON u2.id = r.completed_by
       LEFT JOIN users u3      ON u3.id = r.cancelled_by
       ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { total: Number(total), rows };
  }

  async getReturnsForExport(db, { status, type, whClause, whParams }) {
    const conds = []; const params = [];
    if (status) { conds.push('r.status=?'); params.push(status); }
    if (type)   { conds.push('r.return_type=?'); params.push(type); }
    if (whClause && whClause !== '1=1') {
      conds.push(whClause);
      params.push(...whParams);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const [rows] = await db.query(
      `SELECT r.return_code, r.return_type, r.status,
              r.returner_name, r.department, s.name AS supplier_name,
              r.reason, r.total_qty, u1.full_name AS created_by,
              r.created_at, u2.full_name AS completed_by, r.completed_at
       FROM return_orders r
       LEFT JOIN suppliers s ON s.id=r.supplier_id
       LEFT JOIN users u1 ON u1.id=r.created_by
       LEFT JOIN users u2 ON u2.id=r.completed_by
       ${where} ORDER BY r.created_at DESC`, params
    );
    return rows;
  }

  async getReturnById(db, id) {
    const [[rtn]] = await db.query(
      `SELECT r.*,
              s.name AS supplier_name, s.phone AS supplier_phone,
              w.name AS warehouse_name,
              u1.full_name AS created_by_name,
              u2.full_name AS completed_by_name,
              u3.full_name AS cancelled_by_name
       FROM return_orders r
       LEFT JOIN suppliers  s  ON s.id  = r.supplier_id
       LEFT JOIN warehouses w  ON w.id  = r.warehouse_id
       LEFT JOIN users u1      ON u1.id = r.created_by
       LEFT JOIN users u2      ON u2.id = r.completed_by
       LEFT JOIN users u3      ON u3.id = r.cancelled_by
       WHERE r.id=?`, [id]
    );
    if (!rtn) return null;

    const [items] = await db.query(
      `SELECT ri.*, p.name AS product_name, p.sku,
              p.stock_qty AS stock_quantity,
              c.name AS category_name
       FROM return_items ri
       JOIN products p ON p.id = ri.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ri.return_id=?`, [id]
    );
    return { ...rtn, items };
  }

  async getReturnForUpdate(conn, id) {
    const [[rtn]] = await conn.query('SELECT * FROM return_orders WHERE id=? FOR UPDATE', [id]);
    return rtn;
  }

  async getReturnItems(conn, returnId) {
    const [items] = await conn.query('SELECT ri.product_id, ri.quantity, ri.unit_id FROM return_items ri WHERE ri.return_id=?', [returnId]);
    return items;
  }

  async genCode(conn) {
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`;
    const prefix = `RTN-${ym}-`;
    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(return_code, -4) AS UNSIGNED)), 0) AS maxSeq
       FROM return_orders WHERE return_code LIKE ? FOR UPDATE`,
      [`${prefix}%`]
    );
    return `${prefix}${String(Number(maxSeq) + 1).padStart(4, '0')}`;
  }

  async create(conn, data) {
    const [r] = await conn.query(
      `INSERT INTO return_orders
         (return_code, return_type, status, returner_name, department,
          supplier_id, warehouse_id, reason, note, total_qty, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [data.code, data.returnType, 'DRAFT', data.returnerName || null, data.department || null,
       data.supplierId || null, data.warehouseId || null, data.reason, data.note || null,
       data.totalQty, data.createdBy]
    );
    return r.insertId;
  }

  async insertItems(conn, returnId, items) {
    for (const item of items) {
      await conn.query(
        'INSERT INTO return_items (return_id,product_id,quantity,condition_note) VALUES (?,?,?,?)',
        [returnId, item.productId, item.quantity, item.conditionNote || null]
      );
    }
  }

  async clearItems(conn, returnId) {
    await conn.query('DELETE FROM return_items WHERE return_id=?', [returnId]);
  }

  async update(conn, id, data) {
    await conn.query(
      `UPDATE return_orders SET
         returner_name = COALESCE(?,returner_name),
         department    = ?,
         supplier_id   = COALESCE(?,supplier_id),
         reason        = COALESCE(?,reason),
         note          = ?,
         total_qty     = COALESCE(?,total_qty),
         updated_at    = NOW()
       WHERE id=?`,
      [data.returnerName || null, data.department || null, data.supplierId || null,
       data.reason || null, data.note || null, data.totalQty ?? null, id]
    );
  }

  async complete(conn, id, userId) {
    await conn.query(
      "UPDATE return_orders SET status='COMPLETED', completed_by=?, completed_at=NOW(), updated_at=NOW() WHERE id=?",
      [userId, id]
    );
  }

  async cancel(conn, id, userId) {
    await conn.query(
      "UPDATE return_orders SET status='CANCELLED', cancelled_by=?, cancelled_at=NOW(), updated_at=NOW() WHERE id=?",
      [userId, id]
    );
  }

  async getProductForUpdate(conn, productId) {
    const [[prod]] = await conn.query(
      'SELECT id, name, stock_qty, avg_unit_price, base_unit_id FROM products WHERE id=? FOR UPDATE', [productId]
    );
    return prod;
  }

  async updateProductStock(conn, productId, newStockQty) {
    await conn.query('UPDATE products SET stock_qty = ? WHERE id=?', [newStockQty, productId]);
  }

  async updateProductStockAndPrice(conn, productId, newStockQty, newAvgPrice) {
    await conn.query(
      'UPDATE products SET stock_qty = ?, avg_unit_price = ? WHERE id=?',
      [newStockQty, newAvgPrice, productId]
    );
  }

  async recordTransaction(conn, txData) {
    const [tx] = await conn.query(
      `INSERT INTO stock_transactions
         (product_id, warehouse_id, lot_id, reference_type, reference_id,
          type, quantity, unit_price, stock_before, stock_after, note, created_by)
       VALUES (?, ?, NULL, 'return_order', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [txData.productId, txData.warehouseId || null, txData.returnId,
       txData.type, txData.quantity, txData.unitPrice, txData.stockBefore, txData.stockAfter,
       txData.note, txData.createdBy]
    );
    return tx.insertId;
  }
}

module.exports = new ReturnRepository();
