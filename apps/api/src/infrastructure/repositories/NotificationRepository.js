'use strict';
/**
 * NotificationRepository.js — Clean Architecture Layer 4
 */

class NotificationRepository {
  async getNotifications(db, { userId, isMA, showAll }) {
    const readCond = showAll ? '' : 'AND n.is_read = FALSE';
    let rows, unreadRows;

    if (isMA) {
      [rows] = await db.query(
        `SELECT n.id, n.type, n.title, n.message, n.is_read, n.read_at,
                n.created_at, n.user_id, n.ref_id,
                p.name AS product_name, p.sku, p.stock_qty, p.min_stock_qty
         FROM notifications n
         LEFT JOIN products p ON p.id = n.product_id
         WHERE (n.user_id IS NULL OR n.user_id = ?) ${readCond}
         ORDER BY n.created_at DESC LIMIT 100`,
        [userId]
      );
      [unreadRows] = await db.query(
        `SELECT COUNT(*) AS unread FROM notifications
         WHERE (user_id IS NULL OR user_id = ?) AND is_read = FALSE`,
        [userId]
      );
    } else {
      [rows] = await db.query(
        `SELECT n.id, n.type, n.title, n.message, n.is_read, n.read_at,
                n.created_at, n.user_id, n.ref_id,
                p.name AS product_name, p.sku, p.stock_qty, p.min_stock_qty
         FROM notifications n
         LEFT JOIN products p ON p.id = n.product_id
         WHERE n.user_id = ? ${readCond}
         ORDER BY n.created_at DESC LIMIT 100`,
        [userId]
      );
      [unreadRows] = await db.query(
        `SELECT COUNT(*) AS unread FROM notifications
         WHERE user_id = ? AND is_read = FALSE`,
        [userId]
      );
    }
    return { rows, unread: unreadRows?.[0]?.unread ?? 0 };
  }

  async readAll(db, { userId, isMA }) {
    if (isMA) {
      await db.query(
        'UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE is_read=FALSE AND (user_id IS NULL OR user_id=?)',
        [userId]
      );
    } else {
      await db.query(
        'UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE is_read=FALSE AND user_id=?',
        [userId]
      );
    }
  }

  async clearRead(db, days) {
    const [result] = await db.query(
      'DELETE FROM notifications WHERE is_read=TRUE AND read_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days]
    );
    return result.affectedRows || 0;
  }

  async readOne(db, id) {
    await db.query('UPDATE notifications SET is_read=TRUE, read_at=NOW() WHERE id=?', [id]);
  }

  async getLowStockProducts(db) {
    const [lowProds] = await db.query(
      `SELECT p.id, p.name, p.stock_qty, p.min_stock_qty, (p.stock_qty=0) AS out_of_stock
       FROM products p WHERE p.deleted=FALSE AND p.stock_qty<=p.min_stock_qty
         AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.product_id=p.id AND n.is_read=FALSE
           AND n.type IN ('LOW_STOCK','OUT_OF_STOCK') AND n.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR))`
    );
    return lowProds;
  }

  async createStockNotification(db, { type, title, message, productId }) {
    await db.query('INSERT INTO notifications (type,title,message,product_id) VALUES(?,?,?,?)', [
      type, title, message, productId
    ]).catch(() => {});
  }

  async getAdminEmails(db) {
    const [admins] = await db.query(
      "SELECT email FROM users WHERE role IN ('ADMIN','MANAGER') AND deleted=0 AND email IS NOT NULL AND email != ''"
    );
    return admins;
  }

  async getHighStockProducts(db) {
    const [highProds] = await db.query(
      `SELECT p.id, p.name, p.stock_qty, p.min_stock_qty
       FROM products p
       WHERE p.deleted=FALSE AND p.min_stock_qty > 0 AND p.stock_qty > p.min_stock_qty * 5
         AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.product_id=p.id AND n.is_read=FALSE
           AND n.type='HIGH_STOCK' AND n.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR))`
    );
    return highProds;
  }

  async getManagerIds(db) {
    const [managers] = await db.query("SELECT id FROM users WHERE role IN ('MANAGER','ADMIN') AND deleted=0");
    return managers;
  }

  async createNotification(db, { type, title, message, userId, refId = null, productId = null }) {
    await db.query(
      "INSERT INTO notifications (type,title,message,user_id,ref_id,product_id) VALUES (?,?,?,?,?,?)",
      [type, title, message, userId, refId, productId]
    );
  }
}

module.exports = new NotificationRepository();
