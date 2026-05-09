'use strict';
/**
 * AuditRepository.js — Clean Architecture Layer 4
 * Note: Export endpoints use direct streaming in audit.controller.js
 * (conn.connection.query(...).stream()) to avoid loading 10k rows into RAM.
 */

class AuditRepository {
  async getLogins(db, { w, params, size, offset }) {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM login_audit_log l ${w}`, params);
    const [rows] = await db.query(
      `SELECT l.id, l.username, l.ip_address, l.success, l.user_agent, l.created_at
       FROM login_audit_log l ${w}
       ORDER BY l.created_at DESC LIMIT ? OFFSET ?`, [...params, size, offset]
    );
    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) AS total_attempts,
        SUM(success) AS success_count,
        SUM(1-success) AS fail_count,
        COUNT(DISTINCT username) AS unique_users,
        COUNT(DISTINCT ip_address) AS unique_ips
      FROM login_audit_log l ${w}
    `, params);

    return { total: Number(total), rows, stats };
  }

  async getSuspiciousLogins(db) {
    const [rows] = await db.query(`
      SELECT username, ip_address,
             COUNT(*) AS attempts,
             MAX(created_at) AS last_attempt
      FROM login_audit_log
      WHERE success = FALSE
        AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY username, ip_address
      HAVING attempts >= 3
      ORDER BY attempts DESC
      LIMIT 20
    `);
    return rows;
  }

  async getGeneralLogs(db, { w, params, size, offset }) {
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM general_audit_log g LEFT JOIN users u ON u.id = g.changed_by ${w}`, params
    );
    const [rows] = await db.query(
      `SELECT g.id, g.entity_type, g.entity_id, g.action,
              g.changed_by, u.full_name AS changed_by_name,
              g.ip_address, g.before_data, g.after_data, g.note, g.created_at
       FROM general_audit_log g
       LEFT JOIN users u ON u.id = g.changed_by
       ${w}
       ORDER BY g.created_at DESC LIMIT ? OFFSET ?`, [...params, size, offset]
    );
    return { total: Number(total), rows };
  }

  async getEntityLogs(db, type, entityId) {
    const [rows] = await db.query(
      `SELECT g.id, g.entity_type, g.entity_id, g.action,
              g.changed_by, u.full_name AS changed_by_name,
              g.ip_address, g.before_data, g.after_data, g.note, g.created_at
       FROM general_audit_log g
       LEFT JOIN users u ON u.id = g.changed_by
       WHERE g.entity_type = ? AND g.entity_id = ?
       ORDER BY g.created_at ASC`, [type, entityId]
    );
    return rows;
  }
}

module.exports = new AuditRepository();
