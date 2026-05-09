'use strict';
/**
 * UserRepository — Data access cho bảng users.
 * Layer 4: CHỈ file này được import mysql2. UseCase KHÔNG gọi DB trực tiếp.
 * Dependency Inversion: UseCase phụ thuộc interface UserRepository, không phụ thuộc mysql2.
 */
const db = require('../../shared/config/db');

const USER_FIELDS = 'id, username, role, full_name, email, phone_number, department_id';

/**
 * Map DB row → clean User object (không lộ password).
 */
function mapUser(u) {
  return {
    id:          u.id,
    username:    u.username,
    role:        u.role,
    fullName:    u.full_name,
    email:       u.email,
    phoneNumber: u.phone_number || null,
    departmentId: u.department_id || null,
  };
}

class UserRepository {
  /**
   * Tìm user theo username (active, not deleted).
   * @param {string} username
   * @returns {Promise<object|null>} raw DB row (gồm password hash)
   */
  async findByUsername(username) {
    const [[row]] = await db.query(
      'SELECT id, username, password, role, full_name, email, phone_number, department_id FROM users WHERE username=? AND deleted=0',
      [username]
    );
    return row || null;
  }

  /**
   * Tìm user theo email.
   */
  async findByEmail(email) {
    const [[row]] = await db.query(
      'SELECT id, email FROM users WHERE email=? AND deleted=0',
      [email.toLowerCase()]
    );
    return row || null;
  }

  /**
   * Tìm user theo ID (trả về clean user, không có password).
   */
  async findById(id) {
    const [[row]] = await db.query(
      `SELECT ${USER_FIELDS} FROM users WHERE id=? AND deleted=0`,
      [id]
    );
    return row ? mapUser(row) : null;
  }

  /**
   * Kiểm tra username đã tồn tại chưa.
   */
  async existsByUsername(username) {
    const [[{ n }]] = await db.query(
      'SELECT COUNT(*) AS n FROM users WHERE username=? AND deleted=0', [username]
    );
    return n > 0;
  }

  /**
   * Kiểm tra email đã tồn tại chưa.
   */
  async existsByEmail(email) {
    const [[{ n }]] = await db.query(
      'SELECT COUNT(*) AS n FROM users WHERE email=? AND deleted=0', [email.toLowerCase()]
    );
    return n > 0;
  }

  /**
   * Tạo user mới.
   * @returns {Promise<object>} clean user object
   */
  async create(conn, data) {
    const [result] = await conn.query(
      `INSERT INTO users (username, password, full_name, email, phone_number, role, department_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.username, data.password, data.fullName, data.email, data.phoneNumber, data.role, data.departmentId]
    );
    return result.insertId;
  }

  /**
   * Cập nhật password (hash đã bcrypt sẵn).
   */
  async updatePassword(userId, hashedPassword) {
    await db.query('UPDATE users SET password=? WHERE id=?', [hashedPassword, userId]);
  }

  /**
   * Tạo password reset token.
   */
  async createResetToken(userId, hashedToken, expiresAt) {
    await db.query('DELETE FROM password_reset_tokens WHERE user_id=?', [userId]);
    await db.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?,?,?)',
      [userId, hashedToken, expiresAt]
    );
  }

  /**
   * Tìm valid reset token (read-only).
   */
  async findValidResetToken(hashedToken) {
    const [[row]] = await db.query(
      'SELECT id, user_id FROM password_reset_tokens WHERE token=? AND used=0 AND expires_at > NOW()',
      [hashedToken]
    );
    return row || null;
  }

  /**
   * Tìm valid reset token với FOR UPDATE NOWAIT (dùng trong transaction).
   * @param {object} conn - MySQL connection đang trong transaction
   * @param {string} hashedToken
   * @returns {Promise<{id: number, user_id: number}|null>}
   */
  async findValidResetTokenForUpdate(conn, hashedToken) {
    const [[row]] = await conn.query(
      'SELECT id, user_id FROM password_reset_tokens WHERE token=? AND used=0 AND expires_at > NOW() FOR UPDATE',
      [hashedToken]
    );
    return row || null;
  }

  /**
   * Lấy password hash của user (dùng cho ChangePasswordUseCase).
   * Trả về null nếu user không tồn tại.
   * @param {number} userId
   * @returns {Promise<string|null>}
   */
  async findPasswordHash(userId) {
    const [[row]] = await db.query(
      'SELECT password FROM users WHERE id=? AND deleted=0',
      [userId]
    );
    return row ? row.password : null;
  }

  /**
   * Consume reset token VÀ cập nhật password trong cùng 1 transaction.
   * Caller đã beginTransaction + sẽ commit/rollback.
   * @param {object} conn   - MySQL connection đang trong transaction
   * @param {number} tokenId
   * @param {number} userId
   * @param {string} hashedPassword - bcrypt hash mới
   */
  async consumeResetTokenAndUpdatePassword(conn, tokenId, userId, hashedPassword) {
    await conn.query('DELETE FROM password_reset_tokens WHERE id=?', [tokenId]);
    await conn.query('UPDATE users SET password=? WHERE id=?', [hashedPassword, userId]);
  }

  /**
   * Consume reset token trong transaction.
   */
  async consumeResetToken(conn, tokenId) {
    await conn.query('DELETE FROM password_reset_tokens WHERE id=?', [tokenId]);
  }

  /**
   * Ghi login audit log (fire-and-forget).
   */
  logLoginAttempt(username, ip, success, userAgent) {
    db.query(
      'INSERT INTO login_audit_log (username, ip_address, success, user_agent) VALUES (?,?,?,?)',
      [username.substring(0, 50), ip, success ? 1 : 0, (userAgent || '').substring(0, 255)]
    ).catch(() => {});
  }

  /**
   * Lấy full_name của user — dùng cho notification fire-and-forget.
   * @param {number} userId
   * @returns {Promise<string>} chuỗi rỗng nếu không tìm thấy
   */
  async findNameById(userId) {
    const [[row]] = await db.query('SELECT full_name FROM users WHERE id = ?', [userId]);
    return row?.full_name || '';
  }

  /** Map DB row → clean user (exposed for auth use-cases) */
  mapUser = mapUser;

  // --- METHODS CHO USER CRUD (Batch 2) ---

  async getDepartments() {
    const [rows] = await db.query('SELECT name FROM departments ORDER BY name ASC');
    return rows.map(r => r.name);
  }

  async findWithFilters({ search, role, department, size, offset }) {
    const where = ['u.deleted=0'];
    const params = [];
    if (search) {
      where.push('(u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(search, search, search);
    }
    if (role) { where.push('u.role=?'); params.push(role); }
    
    // Support filtering by department name
    if (department) {
      where.push('d.name = ?');
      params.push(department);
    }

    if (arguments[0].departmentFilter) {
      where.push(arguments[0].departmentFilter.clause);
      params.push(...arguments[0].departmentFilter.params);
    }

    const whereStr = where.join(' AND ');
    const queryBase = `
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE ${whereStr}
    `;

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${queryBase}`, params);
    const [users] = await db.query(
      `SELECT u.id, u.username, u.role, u.full_name, u.email, u.phone_number, u.department_id, 
              d.name as department_name, u.created_at, u.updated_at 
       ${queryBase} 
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    return { total: Number(total), users };
  }

  async findDeleted() {
    const [users] = await db.query(
      `SELECT id,username,email,full_name,phone_number,department_id,role,created_at,updated_at
       FROM users WHERE deleted=1 ORDER BY updated_at DESC`
    );
    return users;
  }

  async findByIdForUpdate(conn, id) {
    const [[row]] = await conn.query('SELECT * FROM users WHERE id = ? AND deleted = 0 FOR UPDATE', [id]);
    return row;
  }

  async findDeletedByIdForUpdate(conn, id) {
    const [[user]] = await conn.query('SELECT id, username, role FROM users WHERE id=? AND deleted=1 FOR UPDATE', [id]);
    return user;
  }

  async checkUsernameExists(conn, username) {
    const [[{ count }]] = await conn.query('SELECT COUNT(*) as count FROM users WHERE username = ?', [username]);
    return count > 0;
  }

  async checkEmailExists(conn, email) {
    const [[{ count }]] = await conn.query('SELECT COUNT(*) as count FROM users WHERE email = ?', [email]);
    return count > 0;
  }

  async checkEmailExistsExcludeId(conn, email, excludeId) {
    const [[{ count }]] = await conn.query('SELECT COUNT(*) as count FROM users WHERE email = ? AND id != ?', [email, excludeId]);
    return count > 0;
  }

  async update(conn, id, data) {
    await conn.query(
      `UPDATE users SET
        full_name = ?, email = ?, phone_number = ?, role = ?, department_id = ?, password = ?, updated_at = NOW()
       WHERE id = ?`,
      [data.fullName, data.email, data.phoneNumber, data.role, data.departmentId, data.password, id]
    );
  }

  async softDelete(conn, id) {
    await conn.query('UPDATE users SET deleted = 1, active = 0 WHERE id = ?', [id]);
  }

  async restore(conn, id) {
    await conn.query('UPDATE users SET deleted=0 WHERE id=?', [id]);
  }
}

module.exports = new UserRepository();