'use strict';
/**
 * WarehouseLocationRepository.js — Clean Architecture Layer 4
 */

class WarehouseLocationRepository {
  async findWithFilters(db, { warehouseId, onlyActive }) {
    const where  = ['1=1'];
    const params = [];
    if (warehouseId) { where.push('wl.warehouse_id = ?'); params.push(warehouseId); }
    if (onlyActive)  { where.push('wl.is_active = 1'); }

    const [rows] = await db.query(
      `SELECT wl.id, wl.warehouse_id, wl.code, wl.name, wl.description,
              wl.capacity, wl.is_active, wl.created_at, wl.updated_at,
              w.name AS warehouse_name,
              u.full_name AS created_by_name
       FROM warehouse_locations wl
       JOIN warehouses w ON w.id = wl.warehouse_id
       LEFT JOIN users u ON u.id = wl.created_by
       WHERE ${where.join(' AND ')}
       ORDER BY wl.warehouse_id, wl.code`, params
    );
    return rows;
  }

  async findById(db, id) {
    const [[row]] = await db.query(
      `SELECT wl.*, w.name AS warehouse_name FROM warehouse_locations wl
       JOIN warehouses w ON w.id = wl.warehouse_id WHERE wl.id = ?`, [id]
    );
    return row;
  }

  async findByIdForUpdate(conn, id) {
    const [[row]] = await conn.query('SELECT * FROM warehouse_locations WHERE id=? FOR UPDATE', [id]);
    return row;
  }

  async findWarehouseById(db, warehouseId) {
    const [[wh]] = await db.query('SELECT id FROM warehouses WHERE id=? AND deleted=0', [warehouseId]);
    return wh;
  }

  async checkCodeExists(db, warehouseId, code) {
    const [[dup]] = await db.query(
      'SELECT id FROM warehouse_locations WHERE warehouse_id=? AND code=?',
      [warehouseId, code]
    );
    return dup;
  }

  async create(conn, { warehouseId, code, name, description, capacity, createdBy }) {
    const [result] = await conn.query(
      'INSERT INTO warehouse_locations (warehouse_id, code, name, description, capacity, is_active, created_by) VALUES(?,?,?,?,?,1,?)',
      [warehouseId, code, name, description, capacity, createdBy]
    );
    return result.insertId;
  }

  async update(conn, id, { name, description, capacity, isActive }) {
    await conn.query(
      'UPDATE warehouse_locations SET name=?, description=?, capacity=?, is_active=? WHERE id=?',
      [name, description, capacity, isActive, id]
    );
  }

  async deactivate(conn, id) {
    await conn.query('UPDATE warehouse_locations SET is_active=0 WHERE id=?', [id]);
  }
}

module.exports = new WarehouseLocationRepository();
