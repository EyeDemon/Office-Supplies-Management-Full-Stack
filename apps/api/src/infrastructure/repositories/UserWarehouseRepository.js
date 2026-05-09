'use strict';
/**
 * UserWarehouseRepository.js — Clean Architecture Layer 4
 */

class UserWarehouseRepository {
  async findByUserId(db, userId) {
    const [rows] = await db.query(
      `SELECT w.id, w.code, w.name, w.location, w.is_active,
              uw.created_at AS assigned_at
       FROM user_warehouses uw
       JOIN warehouses w ON w.id = uw.warehouse_id AND w.deleted = 0
       WHERE uw.user_id = ?
       ORDER BY w.name`, [userId]
    );
    return rows;
  }

  async findAssignedWithAssigner(db, userId) {
    const [rows] = await db.query(
      `SELECT w.id, w.code, w.name, w.location, w.is_active,
              uw.created_at AS assigned_at, cb.full_name AS assigned_by_name
       FROM user_warehouses uw
       JOIN warehouses w ON w.id = uw.warehouse_id AND w.deleted = 0
       LEFT JOIN users cb ON cb.id = uw.created_by
       WHERE uw.user_id = ?
       ORDER BY w.name`, [userId]
    );
    return rows;
  }

  async findAllWarehouses(db) {
    const [rows] = await db.query('SELECT id, code, name, location, is_active FROM warehouses WHERE deleted=0 ORDER BY name');
    return rows;
  }

  async findWarehouseById(db, warehouseId) {
    const [[row]] = await db.query('SELECT id, name FROM warehouses WHERE id=? AND deleted=0', [warehouseId]);
    return row;
  }

  async checkAssigned(db, userId, warehouseId) {
    const [[row]] = await db.query('SELECT id FROM user_warehouses WHERE user_id=? AND warehouse_id=?', [userId, warehouseId]);
    return row;
  }

  async assign(conn, userId, warehouseId, createdBy) {
    await conn.query(
      'INSERT INTO user_warehouses (user_id, warehouse_id, created_by) VALUES (?, ?, ?)',
      [userId, warehouseId, createdBy]
    );
  }

  async getAssignedWarehouseIds(conn, userId) {
    const [rows] = await conn.query('SELECT warehouse_id FROM user_warehouses WHERE user_id=?', [userId]);
    return rows.map(r => r.warehouse_id);
  }

  async removeAllAssignments(conn, userId) {
    await conn.query('DELETE FROM user_warehouses WHERE user_id=?', [userId]);
  }

  async bulkAssign(conn, values) {
    await conn.query('INSERT INTO user_warehouses (user_id, warehouse_id, created_by) VALUES ?', [values]);
  }

  async validateWarehouseIds(conn, warehouseIds) {
    const [validWhs] = await conn.query(
      `SELECT id FROM warehouses WHERE id IN (${warehouseIds.map(() => '?').join(',')}) AND deleted=0`,
      warehouseIds
    );
    return validWhs.length === warehouseIds.length;
  }

  async findAssignmentDetails(db, userId, warehouseId) {
    const [[row]] = await db.query(
      `SELECT uw.id, u.username, w.name AS wh_name
       FROM user_warehouses uw
       JOIN users u ON u.id = uw.user_id
       JOIN warehouses w ON w.id = uw.warehouse_id
       WHERE uw.user_id=? AND uw.warehouse_id=?`, [userId, warehouseId]
    );
    return row;
  }

  async removeAssignment(conn, userId, warehouseId) {
    await conn.query('DELETE FROM user_warehouses WHERE user_id=? AND warehouse_id=?', [userId, warehouseId]);
  }
}

module.exports = new UserWarehouseRepository();
