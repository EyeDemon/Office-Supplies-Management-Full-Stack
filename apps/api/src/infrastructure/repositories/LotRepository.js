'use strict';
/**
 * LotRepository.js — Clean Architecture Layer 4
 */

class LotRepository {
  async findWithFilters(db, { search, productId, expiringSoon, expired, size, offset }) {
    const where = ['1=1'];
    const params = [];

    if (search) {
      where.push('(l.batch_code LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)');
      params.push(search, search, search);
    }
    if (productId) {
      where.push('l.product_id = ?');
      params.push(productId);
    }
    if (expiringSoon) {
      where.push('l.expiry_date IS NOT NULL AND DATEDIFF(l.expiry_date, CURDATE()) BETWEEN 0 AND 30');
    }
    if (expired) {
      where.push('l.expiry_date IS NOT NULL AND l.expiry_date < CURDATE()');
    }

    const w = where.join(' AND ');

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM lots l
       LEFT JOIN products p ON p.id = l.product_id
       WHERE ${w}`, params
    );

    const [rows] = await db.query(
      `SELECT l.*,
              p.name  AS product_name, p.sku AS product_sku,
              u.full_name AS created_by_name,
              DATEDIFF(l.expiry_date, CURDATE()) AS days_to_expiry
       FROM lots l
       LEFT JOIN products p ON p.id = l.product_id
       LEFT JOIN users u    ON u.id = l.created_by
       WHERE ${w}
       ORDER BY CASE WHEN l.expiry_date IS NULL THEN 1 ELSE 0 END, l.expiry_date ASC, l.created_at DESC
       LIMIT ? OFFSET ?`, [...params, size, offset]
    );

    return { total: Number(total), rows };
  }

  async findExpiring(db, days) {
    const [rows] = await db.query(
      `SELECT l.*, p.name AS product_name, p.sku AS product_sku, u.full_name AS created_by_name,
              DATEDIFF(l.expiry_date, CURDATE()) AS days_to_expiry
       FROM lots l
       JOIN products p ON p.id = l.product_id AND p.deleted = 0
       LEFT JOIN users u ON u.id = l.created_by
       WHERE l.expiry_date IS NOT NULL AND DATEDIFF(l.expiry_date, CURDATE()) BETWEEN 0 AND ?
       ORDER BY l.expiry_date ASC`, [days]
    );
    return rows;
  }

  async findExpired(db) {
    const [rows] = await db.query(
      `SELECT l.*, p.name AS product_name, p.sku AS product_sku, u.full_name AS created_by_name,
              DATEDIFF(CURDATE(), l.expiry_date) AS days_expired
       FROM lots l
       JOIN products p ON p.id = l.product_id AND p.deleted = 0
       LEFT JOIN users u ON u.id = l.created_by
       WHERE l.expiry_date IS NOT NULL AND l.expiry_date < CURDATE()
       ORDER BY l.expiry_date ASC`
    );
    return rows;
  }

  async findByProductId(db, productId) {
    const [rows] = await db.query(
      `SELECT l.*, p.name AS product_name, p.sku AS product_sku, u.full_name AS created_by_name,
              DATEDIFF(l.expiry_date, CURDATE()) AS days_to_expiry
       FROM lots l
       LEFT JOIN products p ON p.id = l.product_id
       LEFT JOIN users u    ON u.id = l.created_by
       WHERE l.product_id = ?
       ORDER BY CASE WHEN l.expiry_date IS NULL THEN 1 ELSE 0 END, l.expiry_date ASC`, [productId]
    );
    return rows;
  }

  async findById(db, id) {
    const [[row]] = await db.query(
      `SELECT l.*, p.name AS product_name, p.sku AS product_sku, u.full_name AS created_by_name,
              DATEDIFF(l.expiry_date, CURDATE()) AS days_to_expiry
       FROM lots l
       LEFT JOIN products p ON p.id = l.product_id
       LEFT JOIN users u    ON u.id = l.created_by
       WHERE l.id = ?`, [id]
    );
    return row;
  }

  async findByIdForUpdate(conn, id) {
    const [[row]] = await conn.query('SELECT * FROM lots WHERE id=? FOR UPDATE', [id]);
    return row;
  }

  async findTransactionsByLot(db, lotId) {
    const [txs] = await db.query(
      `SELECT t.id, t.type, t.quantity, t.stock_before, t.stock_after,
              t.note, t.created_at, u.full_name AS created_by_name
       FROM stock_transactions t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.lot_id = ?
       ORDER BY t.created_at DESC LIMIT 50`, [lotId]
    );
    return txs;
  }

  async checkDuplicateBatch(db, productId, batchCode) {
    const [[dup]] = await db.query('SELECT id FROM lots WHERE product_id=? AND batch_code=?', [productId, batchCode]);
    return dup;
  }

  async create(conn, { productId, batchCode, expiryDate, quantityIn, note, createdBy }) {
    const [result] = await conn.query(
      `INSERT INTO lots (product_id, batch_code, expiry_date, quantity_in, note, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [productId, batchCode, expiryDate, quantityIn, note, createdBy]
    );
    return result.insertId;
  }

  async update(conn, id, { expiryDate, note }) {
    await conn.query('UPDATE lots SET expiry_date=?, note=?, updated_at=NOW() WHERE id=?', [expiryDate, note, id]);
  }

  async delete(conn, id) {
    await conn.query('DELETE FROM lots WHERE id=?', [id]);
  }

  async checkUsage(db, id) {
    const [[{ used }]] = await db.query('SELECT COUNT(*) AS used FROM stock_transactions WHERE lot_id=?', [id]);
    return Number(used);
  }
}

module.exports = new LotRepository();
