'use strict';
/**
 * ProductRepository.js — Data access cho bảng `products`.
 */
const db = require('../../shared/config/db');

class ProductRepository {
  async findAll({ page = 1, size = 20, search, categoryId, lowStock, warehouseId } = {}) {
    const p = Math.max(1, page);
    const offset = (p - 1) * size;
    const params  = [];
    const where   = ['p.deleted = FALSE'];

    if (search) {
      where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (categoryId) { where.push('p.category_id = ?'); params.push(categoryId); }
    if (lowStock === true || lowStock === 'true' || lowStock === '1') {
      where.push('p.stock_qty <= p.min_stock_qty');
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const joinSQL = warehouseId
      ? `LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = ${Number(warehouseId)}`
      : '';

    const selectExtra = warehouseId
      ? ', COALESCE(ws.stock_qty, 0) AS wh_stock_qty, COALESCE(ws.reserved_quantity, 0) AS wh_reserved'
      : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM products p ${joinSQL} ${whereSQL}`,
      params
    );

    const [rows] = await db.query(
      `SELECT p.id, p.sku, p.barcode, p.name, p.category_id, p.base_unit_id,
              p.unit, p.price, p.avg_unit_price, p.stock_qty, p.reserved_quantity,
              p.min_stock_qty, p.reorder_point, p.description,
              p.created_at, p.updated_at,
              c.name AS category_name${selectExtra}
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         ${joinSQL}
         ${whereSQL}
         ORDER BY p.name ASC
         LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    return { rows, total };
  }

  async findById(conn, id, lock = false) {
    const lockClause = lock ? 'FOR UPDATE NOWAIT' : '';
    const [[row]] = await conn.query(
      `SELECT id, sku, barcode, name, category_id, base_unit_id,
              unit, price, avg_unit_price, stock_qty, reserved_quantity,
              min_stock_qty, reorder_point, description,
              deleted, created_at, updated_at
         FROM products
        WHERE id = ? AND deleted = FALSE ${lockClause}`,
      [id]
    );
    return row || null;
  }

  async findBySku(sku) {
    const [[row]] = await db.query(
      'SELECT id, sku, name, deleted FROM products WHERE sku = ? LIMIT 1',
      [sku]
    );
    return row || null;
  }

  async create(conn, { sku, barcode, name, categoryId, baseUnitId, unit, price,
    minStockQty, reorderPoint, description, imageUrl, createdBy }) {
    const [r] = await conn.query(
      `INSERT INTO products
         (sku, barcode, name, category_id, base_unit_id, unit, price,
          min_stock_qty, reorder_point, description, image_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sku, barcode || null, name, categoryId || null, baseUnitId || null,
       unit || null, price ?? 0, minStockQty ?? 0, reorderPoint || null,
       description || null, imageUrl || null, createdBy || null]
    );
    return r.insertId;
  }

  async update(conn, id, { name, categoryId, baseUnitId, unit, price,
    minStockQty, reorderPoint, description, imageUrl, updatedBy }) {
    await conn.query(
      `UPDATE products
          SET name         = ?, category_id  = ?, base_unit_id = ?,
              unit         = ?, price        = ?, min_stock_qty = ?,
              reorder_point = ?, description = ?, image_url    = ?,
              updated_by   = ?
        WHERE id = ? AND deleted = FALSE`,
      [name, categoryId || null, baseUnitId || null, unit || null,
       price ?? 0, minStockQty ?? 0, reorderPoint || null,
       description || null, imageUrl || null, updatedBy || null, id]
    );
  }

  async softDelete(conn, id, deletedBy) {
    const [[p]] = await conn.query(
      'SELECT stock_qty FROM products WHERE id = ? AND deleted = FALSE FOR UPDATE NOWAIT',
      [id]
    );
    if (!p) throw Object.assign(new Error('Sản phẩm không tồn tại'), { code: 'NOT_FOUND' });
    if (p.stock_qty > 0) {
      throw Object.assign(
        new Error('Không thể xóa sản phẩm còn tồn kho'),
        { code: 'CONFLICT' }
      );
    }
    await conn.query(
      'UPDATE products SET deleted = TRUE, updated_by = ? WHERE id = ?',
      [deletedBy, id]
    );
  }

  async getStats() {
    const [[row]] = await db.query('SELECT * FROM stock_summary');
    return {
      totalProducts:   Number(row?.total_products   || 0),
      totalStockValue: Number(row?.total_stock_value || 0),
      lowStockCount:   Number(row?.low_stock_count   || 0),
      outOfStockCount: Number(row?.out_of_stock_count|| 0),
    };
  }

  async getRecentTransactions(limit = 20) {
    const [rows] = await db.query(
      `SELECT t.id, t.type, t.quantity, t.stock_before, t.stock_after, t.note, t.created_at,
              p.name AS product_name, p.sku,
              u.full_name AS created_by_name
       FROM stock_transactions t
       LEFT JOIN products p ON t.product_id = p.id
       LEFT JOIN users u ON t.created_by = u.id
       ORDER BY t.created_at DESC LIMIT ?`, [limit]
    );
    return rows;
  }

  async getProductTransactions(productId, { page = 1, size = 20 } = {}) {
    const p = Math.max(1, page);
    const offset = (p - 1) * size;
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM stock_transactions WHERE product_id=?', [productId]);
    const [rows] = await db.query(
      `SELECT t.id, t.type, t.quantity, t.stock_before, t.stock_after, t.note, t.created_at,
              u.full_name AS created_by_name
       FROM stock_transactions t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.product_id = ?
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [productId, size, offset]
    );
    return { items: rows, totalCount: total, totalPages: Math.ceil(total / size), page: p, size };
  }

  async getDeletedProducts() {
    const [rows] = await db.query(
      `SELECT id, sku, barcode, name, unit, price, stock_qty, min_stock_qty, description, updated_at
         FROM products
        WHERE deleted = TRUE
        ORDER BY updated_at DESC`
    );
    return rows;
  }

  async restore(conn, id) {
    await conn.query(
      'UPDATE products SET deleted = FALSE WHERE id = ?',
      [id]
    );
  }

  async insertPriceHistory(conn, { productId, oldPrice, newPrice, unitPrice, quantity, supplierId, purchaseOrderId, changedBy, note }) {
    await conn.query(
      `INSERT INTO price_history 
        (product_id, supplier_id, purchase_order_id, unit_price, quantity, old_price, new_price, changed_by, note) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, 
        supplierId || null, 
        purchaseOrderId || null, 
        unitPrice || newPrice || 0, 
        quantity || 0, 
        oldPrice || null, 
        newPrice || null, 
        changedBy || null, 
        note || null
      ]
    );
  }

  async findActive(conn) {
    const [rows] = await conn.query(
      `SELECT id, name, sku, stock_qty, min_stock_qty, reorder_point, avg_unit_price 
       FROM products WHERE deleted = FALSE`
    );
    return rows;
  }

  async findByIds(conn, ids) {
    if (!ids || ids.length === 0) return [];
    const [rows] = await conn.query(
      'SELECT id, base_unit_id, avg_unit_price FROM products WHERE id IN (?) AND deleted=FALSE',
      [ids]
    );
    return rows;
  }
}

module.exports = new ProductRepository();