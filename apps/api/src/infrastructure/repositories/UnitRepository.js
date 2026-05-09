'use strict';
/**
 * UnitRepository.js — Clean Architecture Layer 4
 */

class UnitRepository {
  async findWithFilters(db, { search, size = 50, offset = 0 }) {
    const where = ['deleted = 0'];
    const params = [];
    if (search) {
      where.push('(name LIKE ? OR symbol LIKE ?)');
      params.push(search, search);
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM units WHERE ${where.join(' AND ')}`,
      params
    );

    const [rows] = await db.query(
      `SELECT id, name, symbol, is_base, created_at
       FROM units 
       WHERE ${where.join(' AND ')} 
       ORDER BY is_base DESC, name ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(size), Number(offset)]
    );
    return { total, rows };
  }


  async findById(db, id) {
    const [[unit]] = await db.query('SELECT * FROM units WHERE id=? AND deleted=0', [id]);
    return unit;
  }

  async findByIdForUpdate(conn, id) {
    const [[unit]] = await conn.query('SELECT * FROM units WHERE id=? AND deleted=0 FOR UPDATE', [id]);
    return unit;
  }

  async findByName(db, name) {
    const [[unit]] = await db.query('SELECT id FROM units WHERE name=? AND deleted=0', [name]);
    return unit;
  }

  async findByNameExcludeId(db, name, excludeId) {
    const [[unit]] = await db.query('SELECT id FROM units WHERE name=? AND id!=? AND deleted=0', [name, excludeId]);
    return unit;
  }

  async create(conn, { name, symbol, isBase }) {
    const [result] = await conn.query(
      'INSERT INTO units (name, symbol, is_base) VALUES (?, ?, ?)',
      [name, symbol, isBase]
    );
    return result.insertId;
  }

  async update(conn, id, { name, symbol, isBase }) {
    await conn.query(
      'UPDATE units SET name=?, symbol=?, is_base=?, updated_at=NOW() WHERE id=?',
      [name, symbol, isBase, id]
    );
  }

  async syncProductsUnit(conn, oldUnitId, newUnitName) {
    await conn.query('UPDATE products SET unit=? WHERE unit_id=?', [newUnitName, oldUnitId]);
  }

  async softDelete(conn, id) {
    await conn.query('UPDATE units SET deleted=1 WHERE id=?', [id]);
  }

  async countUsageInProducts(db, id) {
    const [[{ used }]] = await db.query(
      'SELECT COUNT(*) AS used FROM products WHERE unit_id=? AND deleted=0', [id]
    );
    return Number(used);
  }

  // --- UNIT CONVERSIONS ---
  async findAllConversions(db) {
    const [rows] = await db.query(
      `SELECT uc.*, u1.name AS from_unit_name, u2.name AS to_unit_name
       FROM unit_conversions uc
       JOIN units u1 ON u1.id = uc.from_unit_id AND u1.deleted = 0
       JOIN units u2 ON u2.id = uc.to_unit_id   AND u2.deleted = 0
       ORDER BY u1.name, u2.name`
    );
    return rows;
  }

  async findConversionsByUnitId(db, unitId) {
    const [conversions] = await db.query(
      `SELECT uc.*, u1.name AS from_unit_name, u2.name AS to_unit_name
       FROM unit_conversions uc
       JOIN units u1 ON u1.id = uc.from_unit_id
       JOIN units u2 ON u2.id = uc.to_unit_id
       WHERE uc.from_unit_id=? OR uc.to_unit_id=?`,
      [unitId, unitId]
    );
    return conversions;
  }

  async findConversionById(db, id) {
    const [[uc]] = await db.query(
      `SELECT uc.*, u1.name AS from_unit_name, u2.name AS to_unit_name
       FROM unit_conversions uc
       JOIN units u1 ON u1.id = uc.from_unit_id
       JOIN units u2 ON u2.id = uc.to_unit_id
       WHERE uc.id=?`, [id]
    );
    return uc;
  }

  async findConversionByIdForUpdate(conn, id) {
    const [[uc]] = await conn.query(
      `SELECT uc.*, u1.name AS from_unit_name, u2.name AS to_unit_name
       FROM unit_conversions uc
       JOIN units u1 ON u1.id = uc.from_unit_id
       JOIN units u2 ON u2.id = uc.to_unit_id
       WHERE uc.id=? FOR UPDATE`, [id]
    );
    return uc;
  }

  async findConversionByPair(db, fromUnitId, toUnitId) {
    const [[uc]] = await db.query(
      'SELECT id, ratio FROM unit_conversions WHERE from_unit_id=? AND to_unit_id=?',
      [fromUnitId, toUnitId]
    );
    return uc;
  }

  async createConversion(conn, { fromUnitId, toUnitId, ratio, note }) {
    const [result] = await conn.query(
      'INSERT INTO unit_conversions (from_unit_id, to_unit_id, ratio, note) VALUES (?, ?, ?, ?)',
      [fromUnitId, toUnitId, ratio, note]
    );
    return result.insertId;
  }

  async updateConversion(conn, id, { ratio, note }) {
    await conn.query('UPDATE unit_conversions SET ratio=?, note=? WHERE id=?', [ratio, note, id]);
  }

  async deleteConversion(conn, id) {
    await conn.query('DELETE FROM unit_conversions WHERE id=?', [id]);
  }
}

module.exports = new UnitRepository();
