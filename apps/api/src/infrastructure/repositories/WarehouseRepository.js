'use strict';
/**
 * WarehouseRepository.js — Clean Architecture Layer 4
 */

class WarehouseRepository {
  async generateCode(conn) {
    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(code, -3) AS UNSIGNED)), 0) AS maxSeq
       FROM warehouses FOR UPDATE`
    );
    return `WH-${String(Number(maxSeq) + 1).padStart(3, '0')}`;
  }

  async findWithFilters(db, { search, active, warehouseFilter, size, offset }) {
    const conds  = ['w.deleted = 0'];
    const params = [];

    if (search) {
      conds.push('(w.code LIKE ? OR w.name LIKE ? OR w.location LIKE ?)');
      params.push(search, search, search);
    }
    if (active === true)  { conds.push('w.is_active = 1'); }
    if (active === false) { conds.push('w.is_active = 0'); }

    if (warehouseFilter && warehouseFilter.clause !== '1=1') {
      conds.push(warehouseFilter.clause);
      params.push(...warehouseFilter.params);
    }

    const where = conds.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM warehouses w WHERE ${where}`, params);
    const [rows] = await db.query(
      `SELECT w.*,
              u1.full_name AS created_by_name,
              u2.full_name AS updated_by_name
       FROM warehouses w
       LEFT JOIN users u1 ON u1.id = w.created_by
       LEFT JOIN users u2 ON u2.id = w.updated_by
       WHERE ${where}
       ORDER BY w.is_active DESC, w.name ASC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    return { total: Number(total), rows };
  }

  async findAllActive(db, warehouseFilter) {
    const whereExtra = warehouseFilter.clause !== '1=1' ? ` AND ${warehouseFilter.clause}` : '';
    const [rows] = await db.query(
      `SELECT id, code, name, location FROM warehouses WHERE deleted=0 AND is_active=1${whereExtra} ORDER BY name`,
      warehouseFilter.params
    );
    return rows;
  }

  async findById(db, id) {
    const [[w]] = await db.query(
      `SELECT w.*, u1.full_name AS created_by_name, u2.full_name AS updated_by_name
       FROM warehouses w
       LEFT JOIN users u1 ON u1.id = w.created_by
       LEFT JOIN users u2 ON u2.id = w.updated_by
       WHERE w.id = ? AND w.deleted = 0`, [id]
    );
    return w;
  }

  async findByIdForUpdate(conn, id) {
    const [[w]] = await conn.query('SELECT * FROM warehouses WHERE id=? AND deleted=0 FOR UPDATE', [id]);
    return w;
  }

  async findByName(db, name) {
    const [[w]] = await db.query('SELECT id FROM warehouses WHERE name=? AND deleted=0', [name]);
    return w;
  }

  async findByNameExcludeId(db, name, excludeId) {
    const [[w]] = await db.query('SELECT id FROM warehouses WHERE name=? AND deleted=0 AND id<>?', [name, excludeId]);
    return w;
  }

  async create(conn, data) {
    const [r] = await conn.query(
      `INSERT INTO warehouses (code, name, location, description, is_active, created_by) VALUES (?,?,?,?,?,?)`,
      [data.code, data.name, data.location, data.description, data.isActive, data.createdBy]
    );
    return r.insertId;
  }

  async update(conn, id, data) {
    await conn.query(
      `UPDATE warehouses SET name=?,location=?,description=?,is_active=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [data.name, data.location, data.description, data.isActive, data.updatedBy, id]
    );
  }

  async softDelete(conn, id, deletedBy) {
    await conn.query('UPDATE warehouses SET deleted=1, updated_by=?, updated_at=NOW() WHERE id=?', [deletedBy, id]);
  }

  async toggleActive(conn, id, isActive, updatedBy) {
    await conn.query('UPDATE warehouses SET is_active=?, updated_by=?, updated_at=NOW() WHERE id=?', [isActive, updatedBy, id]);
  }

  async checkTransferTransactions(db, warehouseId) {
    const [[txCheck]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM stock_transfers
       WHERE (from_warehouse_id = ? OR to_warehouse_id = ?) AND status NOT IN ('CANCELLED')`,
      [warehouseId, warehouseId]
    );
    return Number(txCheck.cnt);
  }

  async checkStockLevels(db, warehouseId) {
    const [[stockCheck]] = await db.query(
      `SELECT COALESCE(SUM(stock_qty), 0) AS total FROM warehouse_stock WHERE warehouse_id = ?`,
      [warehouseId]
    );
    return Number(stockCheck.total);
  }

  async getStockByWarehouse(db, warehouseId, { search, catId, lowStock, size, offset }) {
    const conds  = ['p.deleted = 0'];
    const params = [];
    if (search)  { conds.push('(p.name LIKE ? OR p.sku LIKE ?)'); params.push(search, search); }
    if (catId)   { conds.push('p.category_id = ?'); params.push(catId); }
    if (lowStock){ conds.push('COALESCE(ws.stock_qty, 0) <= p.min_stock_qty'); }

    const where = conds.join(' AND ');

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM products p
       LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = ?
       WHERE ${where}`,
      [warehouseId, ...params]
    );

    const [rows] = await db.query(
      `SELECT p.id, p.sku, p.name, p.unit, p.price, p.min_stock_qty,
              COALESCE(ws.stock_qty, 0) AS warehouse_qty,
              p.stock_qty               AS total_qty,
              c.name                    AS category_name,
              ws.updated_at             AS last_movement
       FROM products p
       LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = ?
       LEFT JOIN categories c ON c.id = p.category_id AND c.deleted = FALSE
       WHERE ${where}
       ORDER BY p.name ASC
       LIMIT ? OFFSET ?`,
      [warehouseId, ...params, size, offset]
    );

    return { total: Number(total), rows };
  }
}

module.exports = new WarehouseRepository();
