'use strict';
/**
 * QuotaRepository.js
 * Infrastructure Layer (Clean Architecture — Layer 4)
 *
 * MISS-04: Department Quota Management
 */

class QuotaRepository {
  /**
   * Lấy quota của phòng ban trong tháng/năm cụ thể.
   * @param {object|Pool} connOrPool
   * @param {number} departmentId
   * @param {number} year
   * @param {number} month
   */
  async getQuota(connOrPool, departmentId, year, month) {
    const [[row]] = await connOrPool.query(
      `SELECT * FROM department_quotas 
       WHERE department_id = ? AND year = ? AND month = ?`,
      [departmentId, year, month]
    );
    return row || null;
  }

  /**
   * Kiểm tra quota cho một giao dịch.
   * @param {object} conn
   * @param {number} departmentId
   * @param {number} amount
   * @returns {Promise<boolean>}
   */
  async hasEnoughQuota(conn, departmentId, amount) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const quota = await this.getQuota(conn, departmentId, year, month);
    if (!quota) return true; // Nếu không cài quota thì mặc định cho phép (hoặc có thể đổi thành false tùy policy)

    const remaining = Number(quota.monthly_limit) - Number(quota.spent_amount);
    return remaining >= amount;
  }

  /**
   * Cập nhật số tiền đã chi tiêu.
   * @param {object} conn
   * @param {number} departmentId
   * @param {number} amount
   */
  async incrementSpent(conn, departmentId, amount) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    await conn.query(
      `UPDATE department_quotas 
       SET spent_amount = spent_amount + ? 
       WHERE department_id = ? AND year = ? AND month = ?`,
      [amount, departmentId, year, month]
    );
  }

  /**
   * Cập nhật hoặc tạo mới quota.
   */
  async upsertQuota(conn, { departmentId, year, month, limit }) {
    await conn.query(
      `INSERT INTO department_quotas (department_id, year, month, monthly_limit, spent_amount)
       VALUES (?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE monthly_limit = ?`,
      [departmentId, year, month, limit, limit]
    );
  }

  /**
   * Lấy lịch sử quota của phòng ban.
   */
  async findAllQuotas(connOrPool, departmentId) {
    const [rows] = await connOrPool.query(
      `SELECT * FROM department_quotas WHERE department_id = ? ORDER BY year DESC, month DESC`,
      [departmentId]
    );
    return rows;
  }
}

module.exports = new QuotaRepository();
