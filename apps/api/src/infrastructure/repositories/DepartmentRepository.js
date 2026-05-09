'use strict';

class DepartmentRepository {
  async findAll(db) {
    const [rows] = await db.query('SELECT * FROM departments ORDER BY name ASC');
    return rows;
  }

  async findById(db, id) {
    const [[row]] = await db.query('SELECT * FROM departments WHERE id = ?', [id]);
    return row;
  }

  async create(db, { name, description }) {
    const [result] = await db.query(
      'INSERT INTO departments (name, description) VALUES (?, ?)',
      [name, description]
    );
    return result.insertId;
  }

  async update(db, id, { name, description }) {
    await db.query(
      'UPDATE departments SET name = ?, description = ?, updated_at = NOW() WHERE id = ?',
      [name, description, id]
    );
  }

  async delete(db, id) {
    await db.query('DELETE FROM departments WHERE id = ?', [id]);
  }
}

module.exports = new DepartmentRepository();
