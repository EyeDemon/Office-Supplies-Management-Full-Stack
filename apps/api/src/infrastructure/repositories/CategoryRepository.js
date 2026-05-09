'use strict';
/**
 * CategoryRepository.js — Clean Architecture Layer 4
 */

class CategoryRepository {
  async findWithFilters(db, { search, size = 50, offset = 0 }) {
    const where  = ['c.deleted = 0'];
    const params = [];
    if (search?.trim()) {
      where.push('c.name LIKE ?');
      params.push(`%${search.trim().replace(/[%_\\]/g, '\\$&')}%`);
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM categories c WHERE ${where.join(' AND ')}`,
      params
    );

    const [rows] = await db.query(
      `SELECT c.id, c.name, c.description, c.created_at,
              COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.deleted = 0
       WHERE ${where.join(' AND ')}
       GROUP BY c.id, c.name, c.description, c.created_at
       ORDER BY c.name ASC
       LIMIT ? OFFSET ?`, [...params, Number(size), Number(offset)]
    );
    return { total, rows };
  }


  async findById(db, id) {
    const [[cat]] = await db.query(
      `SELECT c.id, c.name, c.description, c.created_at,
              COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id=c.id AND p.deleted=0
       WHERE c.id=? AND c.deleted=0
       GROUP BY c.id, c.name, c.description, c.created_at`, [id]
    );
    return cat;
  }

  async findByIdForUpdate(conn, id) {
    const [[cat]] = await conn.query(
      `SELECT c.id, c.name, COUNT(p.id) AS product_count
       FROM categories c LEFT JOIN products p ON p.category_id=c.id AND p.deleted=0
       WHERE c.id=? AND c.deleted=0 GROUP BY c.id, c.name FOR UPDATE`, [id]
    );
    return cat;
  }

  async findByName(db, name) {
    const [[cat]] = await db.query('SELECT COUNT(*) AS cnt FROM categories WHERE name=? AND deleted=0', [name]);
    return Number(cat.cnt) > 0;
  }

  async findByNameExcludeId(db, name, excludeId) {
    const [[cat]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM categories WHERE name=? AND id!=? AND deleted=0', [name, excludeId]
    );
    return Number(cat.cnt) > 0;
  }

  async create(conn, { name, description }) {
    const [result] = await conn.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [name, description]
    );
    return result.insertId;
  }

  async update(conn, id, { name, description }) {
    await conn.query('UPDATE categories SET name=?, description=? WHERE id=?', [name, description, id]);
  }

  async softDelete(conn, id) {
    await conn.query('UPDATE categories SET deleted=1 WHERE id=?', [id]);
  }
}

module.exports = new CategoryRepository();
