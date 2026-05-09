'use strict';
/**
 * StocktakingRepository.js
 * Infrastructure layer for stocktaking operations
 */
const db = require('../../shared/config/db');

class StocktakingRepository {
  async getSessions(db, { status, whClause, whParams, limit, offset }) {
    const conds = []; const params = [];
    if (status) { conds.push('s.status = ?'); params.push(status); }
    if (whClause && whClause !== '1=1') { conds.push(whClause); params.push(...whParams); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM stocktaking_sessions s ${where}`, params
    );
    const [rows] = await db.query(
      `SELECT s.*, u1.full_name AS created_by_name, u2.full_name AS completed_by_name,
              (SELECT COUNT(*) FROM stocktaking_items si WHERE si.session_id=s.id) AS item_count,
              (SELECT COUNT(*) FROM stocktaking_items si WHERE si.session_id=s.id AND si.actual_qty IS NOT NULL) AS checked_count
       FROM stocktaking_sessions s
       LEFT JOIN users u1 ON u1.id=s.created_by
       LEFT JOIN users u2 ON u2.id=s.completed_by
       ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { total: Number(total), rows };
  }

  async getSessionById(db, id) {
    const [[session]] = await db.query(
      `SELECT s.*, u1.full_name AS created_by_name, u2.full_name AS completed_by_name
       FROM stocktaking_sessions s
       LEFT JOIN users u1 ON u1.id=s.created_by
       LEFT JOIN users u2 ON u2.id=s.completed_by
       WHERE s.id=?`, [id]
    );
    if (!session) return null;

    const [items] = await db.query(
      `SELECT si.*, p.name AS product_name, p.sku, p.unit
       FROM stocktaking_items si
       JOIN products p ON p.id=si.product_id
       WHERE si.session_id=? ORDER BY p.name`, [id]
    );
    return { session, items };
  }

  async genSessionCode(conn) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = `KK-${ymd}-`;
    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(session_code, -4) AS UNSIGNED)), 0) AS maxSeq
       FROM stocktaking_sessions WHERE session_code LIKE ? FOR UPDATE`,
      [`${prefix}%`]
    );
    return `${prefix}${String(Number(maxSeq) + 1).padStart(4, '0')}`;
  }

  async createSession(conn, { sessionCode, note, warehouseId, createdBy }) {
    const [r] = await conn.query(
      'INSERT INTO stocktaking_sessions (session_code,status,note,warehouse_id,created_by) VALUES (?,?,?,?,?)',
      [sessionCode, 'OPEN', note || null, warehouseId || null, createdBy]
    );
    return r.insertId;
  }

  async getProductsForStocktaking(conn, { warehouseId, productIds }) {
    const whId = warehouseId ? parseInt(warehouseId) : null;
    let prods;
    if (productIds && productIds.length > 0) {
      if (whId) {
        [prods] = await conn.query(
          `SELECT p.id, COALESCE(ws.stock_qty, 0) AS stock_qty
           FROM products p
           LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = ?
           WHERE p.id IN (?) AND p.deleted = FALSE`,
          [whId, productIds]
        );
      } else {
        [prods] = await conn.query(
          'SELECT id, stock_qty FROM products WHERE id IN (?) AND deleted=FALSE', [productIds]
        );
      }
    } else {
      if (whId) {
        [prods] = await conn.query(
          `SELECT p.id, COALESCE(ws.stock_qty, 0) AS stock_qty
           FROM products p
           LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = ?
           WHERE p.deleted = FALSE ORDER BY p.name`,
          [whId]
        );
      } else {
        [prods] = await conn.query(
          'SELECT id, stock_qty FROM products WHERE deleted=FALSE ORDER BY name'
        );
      }
    }
    return prods;
  }

  async insertSessionItems(conn, sessionId, prods) {
    if (prods.length > 0) {
      const vals = prods.map(p => [sessionId, p.id, p.stock_qty]);
      await conn.query(
        'INSERT INTO stocktaking_items (session_id,product_id,system_qty) VALUES ?', [vals]
      );
    }
  }

  async getSessionStatus(conn, id) {
    const [[session]] = await conn.query('SELECT status FROM stocktaking_sessions WHERE id=?', [id]);
    return session ? session.status : null;
  }

  async getSessionStatusForUpdate(conn, id) {
    const [[session]] = await conn.query('SELECT status FROM stocktaking_sessions WHERE id=? FOR UPDATE', [id]);
    return session ? session.status : null;
  }

  async getItemSystemQty(conn, sessionId, productId) {
    const [[item]] = await conn.query(
      'SELECT system_qty FROM stocktaking_items WHERE session_id=? AND product_id=?',
      [sessionId, productId]
    );
    return item ? Number(item.system_qty) : null;
  }

  async updateItemActualQty(conn, { sessionId, productId, actualQty, difference, note }) {
    await conn.query(
      `UPDATE stocktaking_items
       SET actual_qty=?, difference=?, note=?
       WHERE session_id=? AND product_id=?`,
      [actualQty, difference, note, sessionId, productId]
    );
  }

  async cancelSession(conn, id) {
    await conn.query("UPDATE stocktaking_sessions SET status='CANCELLED' WHERE id=?", [id]);
  }

  async hasActiveSession(conn, warehouseId) {
    const [[row]] = await conn.query(
      `SELECT id FROM stocktaking_sessions WHERE warehouse_id = ? AND status IN ('OPEN', 'COUNTING') LIMIT 1`,
      [warehouseId]
    );
    return !!row;
  }

  async findById(conn, id, lock = false) {
    const lockClause = lock ? 'FOR UPDATE' : '';
    const [[row]] = await conn.query(
      `SELECT * FROM stocktaking_sessions WHERE id = ? ${lockClause}`, [id]
    );
    return row || null;
  }

  async getItems(conn, sessionId) {
    const [rows] = await conn.query(
      `SELECT si.*, p.name AS product_name, p.avg_unit_price AS global_avg
       FROM stocktaking_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.session_id = ?`, [sessionId]
    );
    return rows;
  }

  async setStockQty(conn, warehouseId, productId, qty, resetAvg = false) {
    const sets = ['stock_qty = ?, updated_at = NOW()'];
    const params = [qty];
    if (resetAvg) {
      sets.push('avg_unit_price = 0');
    }
    params.push(warehouseId, productId);
    await conn.query(
      `UPDATE warehouse_stock SET ${sets.join(', ')} WHERE warehouse_id = ? AND product_id = ?`,
      params
    );
  }

  async updateStatus(conn, id, { status, confirmedBy }) {
    const sets = ['status = ?, updated_at = NOW()'];
    const params = [status];
    if (confirmedBy) {
      sets.push('completed_by = ?, confirmed_at = NOW()');
      params.push(confirmedBy);
    }
    params.push(id);
    await conn.query(`UPDATE stocktaking_sessions SET ${sets.join(', ')} WHERE id = ?`, params);
  }
}

module.exports = new StocktakingRepository();
