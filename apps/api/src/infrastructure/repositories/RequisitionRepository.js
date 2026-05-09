'use strict';
/**
 * RequisitionRepository.js — Data access cho bảng requisitions + requisition_items.
 *
 * Clean Architecture — Layer 4 (Infrastructure):
 *   - Biết MySQL. KHÔNG chứa business logic.
 *   - UseCase (Layer 2) gọi vào đây. Controller (Layer 1) KHÔNG gọi trực tiếp.
 *
 * Spec IX.3: Request & Reservation Flow
 *   PENDING → APPROVED (reserve stock) → WAREHOUSE_CONFIRMED (xuất hàng) | REJECTED | CANCELLED
 *
 * Tất cả write methods nhận `conn` (MySQL connection trong transaction).
 * Read methods có thể dùng `db` pool trực tiếp.
 */
const db = require('../../shared/config/db');

class RequisitionRepository {
  // ─── Requisition header ────────────────────────────────────────

  /**
   * Tìm requisition theo ID, với optional lock.
   * @param {object} conn - MySQL connection (trong transaction)
   * @param {number} id
   * @param {boolean} [lock=false] - có FOR UPDATE NOWAIT không
   * @returns {Promise<object|null>}
   */
  async findById(conn, id, lock = false) {
    const lockClause = lock ? 'FOR UPDATE NOWAIT' : '';
    const [[row]] = await conn.query(
      `SELECT r.*,
              u1.full_name AS requester_name,
              u2.full_name AS approved_by_name,
              u3.full_name AS rejected_by_name,
              u4.full_name AS warehouse_confirmed_by_name,
              w.name       AS warehouse_name
       FROM requisitions r
       LEFT JOIN users u1      ON u1.id = r.requester_id
       LEFT JOIN users u2      ON u2.id = r.approved_by
       LEFT JOIN users u3      ON u3.id = r.rejected_by
       LEFT JOIN users u4      ON u4.id = r.warehouse_confirmed_by
       LEFT JOIN warehouses w  ON w.id  = r.warehouse_id
       WHERE r.id = ? ${lockClause}`,
      [id]
    );
    return row || null;
  }

  /** Alias cho findById(conn, id, true) */
  async findByIdForUpdate(conn, id) {
    return this.findById(conn, id, true);
  }

  /**
   * Tìm max sequence trong cùng prefix (dùng nội bộ bởi genReqCode).
   * @param {object} conn
   * @param {string} codePrefix - VD: 'YC-20260428-%'
   * @param {boolean} [lock=false]
   */
  async findMaxSeqByPrefix(conn, codePrefix, lock = false) {
    const lockClause = lock ? 'FOR UPDATE' : '';
    const [[{ maxSeq }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(req_code, -4) AS UNSIGNED)), 0) AS maxSeq
       FROM requisitions WHERE req_code LIKE ? ${lockClause}`,
      [codePrefix]
    );
    return Number(maxSeq);
  }

  /**
   * Sinh req_code race-condition-safe.
   * Pattern: YC-YYYYMMDD-0001
   * FOR UPDATE serialize concurrent inserts trong cùng transaction.
   *
   * @param {object} conn - MySQL connection đang trong transaction (bắt buộc)
   * @returns {Promise<string>} VD: 'YC-20260430-0001'
   */
  async genReqCode(conn) {
    const d   = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = `YC-${ymd}-`;

    const maxSeq = await this.findMaxSeqByPrefix(conn, `${prefix}%`, true);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  /**
   * Kiểm tra danh sách productId tồn tại và không bị xoá.
   * Ném Error nếu thiếu hoặc đã bị xoá.
   *
   * @param {object} conn
   * @param {number[]} productIds
   * @returns {Promise<void>} — throw nếu không hợp lệ
   */
  async validateProductsExist(conn, productIds) {
    if (!productIds.length) return;

    const placeholders = productIds.map(() => '?').join(',');
    const [products]   = await conn.query(
      `SELECT id, name, deleted FROM products WHERE id IN (${placeholders})`,
      productIds
    );

    if (products.length !== productIds.length) {
      const foundIds   = products.map(p => p.id);
      const missingIds = productIds.filter(id => !foundIds.includes(id));
      const err = new Error(`Sản phẩm không tồn tại: ID ${missingIds.join(', ')}`);
      err.code  = 'NOT_FOUND';
      throw err;
    }

    const deleted = products.filter(p => p.deleted);
    if (deleted.length > 0) {
      const err = new Error(`Sản phẩm đã ngừng kinh doanh: ${deleted.map(p => p.name).join(', ')}`);
      err.code  = 'INVALID_STATE';
      throw err;
    }
  }

  /**
   * Tạo requisition mới (PENDING).
   * @param {object} conn
   * @param {object} data - { reqCode, requesterId, warehouseId, note }
   * @returns {Promise<number>} insertId
   */
  async create(conn, { reqCode, requesterId, warehouseId, note }) {
    const [r] = await conn.query(
      `INSERT INTO requisitions
         (req_code, requester_id, warehouse_id, status, note)
       VALUES (?, ?, ?, 'PENDING', ?)`,
      [reqCode, requesterId, warehouseId || null, note?.trim() || null]
    );
    return r.insertId;
  }

  /**
   * Cập nhật trạng thái requisition.
   * @param {object} conn
   * @param {number} id
   * @param {object} update - { status, approvedBy?, rejectedBy?, warehouseConfirmedBy?,
   *                           rejectReason?, approvedAt?, rejectedAt?,
   *                           cancelledAt?, warehouseConfirmedAt? }
   */
  async updateStatus(conn, id, update) {
    const {
      status,
      approvedBy              = null,
      rejectedBy              = null,
      warehouseConfirmedBy    = null,
      rejectReason            = null,
      approvedAt              = null,
      rejectedAt              = null,
      cancelledAt             = null,
      warehouseConfirmedAt    = null,
    } = update;

    const sets  = ['status = ?'];
    const params = [status];

    if (approvedBy !== null)           { sets.push('approved_by = ?');             params.push(approvedBy); }
    if (rejectedBy !== null)           { sets.push('rejected_by = ?');             params.push(rejectedBy); }
    if (warehouseConfirmedBy !== null) { sets.push('warehouse_confirmed_by = ?'); params.push(warehouseConfirmedBy); }
    if (rejectReason !== null)         { sets.push('reject_reason = ?');           params.push(rejectReason); }
    if (approvedAt === 'NOW()')        { sets.push('approved_at = NOW()'); }
    if (rejectedAt === 'NOW()')        { sets.push('rejected_at = NOW()'); }
    if (cancelledAt === 'NOW()')       { sets.push('cancelled_at = NOW()'); }
    if (warehouseConfirmedAt === 'NOW()') { sets.push('warehouse_confirmed_at = NOW()'); }

    params.push(id);
    await conn.query(
      `UPDATE requisitions SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
  }

  async findByIdForUpdate(conn, id) {
    const [[row]] = await conn.query(
      `SELECT id, status, warehouse_id, req_code, requester_id, note
       FROM requisitions WHERE id = ? FOR UPDATE NOWAIT`,
      [id]
    );
    return row || null;
  }

  async updateItemApprovedQty(conn, itemId, qty) {
    await conn.query(
      'UPDATE requisition_items SET quantity_approved = ? WHERE id = ?',
      [qty, itemId]
    );
  }

  // ─── Requisition items ─────────────────────────────────────────

  /**
   * Lấy tất cả items của 1 requisition kèm thông tin sản phẩm.
   * @param {object|Pool} connOrPool
   * @param {number} requisitionId
   */
  async findItems(connOrPool, requisitionId) {
    const [rows] = await connOrPool.query(
      `SELECT ri.*,
              p.name       AS product_name,
              p.sku,
              p.unit,
              p.stock_qty  AS current_stock,
              u.name       AS unit_name
       FROM requisition_items ri
       JOIN products p         ON p.id = ri.product_id
       LEFT JOIN units u       ON u.id = ri.unit_id
       WHERE ri.requisition_id = ?
       ORDER BY p.name`,
      [requisitionId]
    );
    return rows;
  }

  /**
   * Thêm items vào requisition.
   * @param {object} conn
   * @param {number} requisitionId
   * @param {Array}  items - [{ productId, quantity, unitId?, note? }]
   */
  async createItems(conn, requisitionId, items) {
    for (const item of items) {
      await conn.query(
        `INSERT INTO requisition_items
           (requisition_id, product_id, quantity_requested, unit_id, note)
         VALUES (?, ?, ?, ?, ?)`,
        [
          requisitionId,
          item.productId,
          item.quantity,
          item.unitId   || null,
          item.note?.trim() || null,
        ]
      );
    }
  }

  /**
   * Cập nhật quantity_approved cho từng item khi Manager duyệt.
   * @param {object} conn
   * @param {number} requisitionId
   * @param {Array}  approvedItems - [{ productId, quantityApproved }]
   */
  async approveItems(conn, requisitionId, approvedItems) {
    for (const { productId, quantityApproved } of approvedItems) {
      await conn.query(
        `UPDATE requisition_items
           SET quantity_approved = ?
         WHERE requisition_id = ? AND product_id = ?`,
        [quantityApproved, requisitionId, productId]
      );
    }
  }

  /**
   * Từ chối requisition (PENDING → REJECTED).
   * Caller đã lock row trước (findById với lock=true).
   * @param {object} conn
   * @param {number} id
   * @param {number} userId
   * @param {string} reason
   */
  async rejectById(conn, id, userId, reason) {
    await conn.query(
      `UPDATE requisitions
       SET status='REJECTED', rejected_by=?, rejected_at=NOW(),
           reject_reason=?, updated_at=NOW()
       WHERE id=?`,
      [userId, reason, id]
    );
  }

  /**
   * Tìm requisition để thực hiện warehouse-confirm, với lock FOR UPDATE NOWAIT.
   * Chỉ trả về các field cần cho logic xuất kho.
   * @param {object} conn
   * @param {number} id
   * @returns {Promise<{id,req_code,status,warehouse_id}|null>}
   */
  async findForWarehouseConfirm(conn, id) {
    const [[row]] = await conn.query(
      `SELECT id, req_code, status, warehouse_id
       FROM requisitions WHERE id = ? FOR UPDATE NOWAIT`,
      [id]
    );
    return row || null;
  }

  async findApprovedItemsForDispense(conn, requisitionId) {
    const [rows] = await conn.query(
      `SELECT ri.id, ri.product_id, ri.quantity_approved,
              p.name        AS product_name,
              p.avg_unit_price
       FROM requisition_items ri
       JOIN products p ON p.id = ri.product_id
       WHERE ri.requisition_id = ? AND ri.quantity_approved > 0`,
      [requisitionId]
    );
    return rows;
  }

  /**
   * Cập nhật requisition → WAREHOUSE_CONFIRMED.
   * @param {object} conn
   * @param {number} id
   * @param {number} userId
   */
  async markWarehouseConfirmed(conn, id, userId) {
    await conn.query(
      `UPDATE requisitions
       SET status='WAREHOUSE_CONFIRMED',
           warehouse_confirmed_by=?, warehouse_confirmed_at=NOW(), updated_at=NOW()
       WHERE id=?`,
      [userId, id]
    );
  }

  // ─── Pagination / listing (read-only, dùng pool) ──────────────

  /**
   * Danh sách phân trang (không cần transaction).
   * @param {object} opts - { page, size, status?, requesterId?, warehouseIds? }
   */
  async findAll({ page = 0, size = 20, status, requesterId, warehouseFilter, dateFrom, dateTo, search, departmentId } = {}) {
    const where  = [];
    const params = [];

    if (status)      { where.push('r.status = ?');        params.push(status.toUpperCase()); }
    if (requesterId) { where.push('r.requester_id = ?');  params.push(requesterId); }
    if (dateFrom)    { where.push('DATE(r.created_at) >= ?'); params.push(dateFrom); }
    if (dateTo)      { where.push('DATE(r.created_at) <= ?'); params.push(dateTo); }
    if (search)      {
      where.push('(r.req_code LIKE ? OR r.note LIKE ? OR u.full_name LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (warehouseFilter && warehouseFilter.clause !== '1=1') {
      where.push(warehouseFilter.clause);
      params.push(...warehouseFilter.params);
    }
    
    // [FIX MISS-03] Thêm bộ lọc phòng ban
    if (departmentId) {
      where.push('u1.department_id = ?');
      params.push(departmentId);
    }

    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM requisitions r LEFT JOIN users u1 ON u1.id = r.requester_id ${w}`, params
    );

    const p = Math.max(1, page);
    const offset = (p - 1) * size;

    const [rows] = await db.query(
      `SELECT r.id, r.req_code, r.status, r.note, r.reject_reason,
              r.requester_id, r.warehouse_id,
              u1.full_name AS requester_name,   u1.username AS requester_username,
              u2.full_name AS approved_by_name,
              u3.full_name AS rejected_by_name,
              u4.full_name AS warehouse_confirmed_by_name,
              u5.full_name AS cancelled_by_name,
              w.name       AS warehouse_name,
              r.approved_at, r.rejected_at, r.cancelled_at, r.warehouse_confirmed_at,
              r.created_at, r.updated_at,
              COUNT(ri.id)                          AS item_count,
              SUM(ri.quantity_requested)             AS total_qty_requested,
              SUM(COALESCE(ri.quantity_approved, 0)) AS total_qty_approved
       FROM requisitions r
       LEFT JOIN users u1         ON u1.id  = r.requester_id
       LEFT JOIN users u2         ON u2.id  = r.approved_by
       LEFT JOIN users u3         ON u3.id  = r.rejected_by
       LEFT JOIN users u4         ON u4.id  = r.warehouse_confirmed_by
       LEFT JOIN users u5         ON u5.id  = r.cancelled_by
       LEFT JOIN warehouses w    ON w.id  = r.warehouse_id
       LEFT JOIN requisition_items ri ON ri.requisition_id = r.id
       ${w}
       GROUP BY r.id
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    return {
      items: rows,
      totalCount: total,
      totalPages: Math.ceil(total / size),
      page: p,
      size,
    };
  }

  async deleteItemsByReqId(conn, requisitionId) {
    await conn.query('DELETE FROM requisition_items WHERE requisition_id = ?', [requisitionId]);
  }

  async updateHeader(conn, id, { note, warehouseId, status }) {
    const sets = [];
    const params = [];
    if (note !== undefined) { sets.push('note = ?'); params.push(note?.trim() || null); }
    if (warehouseId !== undefined) { sets.push('warehouse_id = ?'); params.push(warehouseId || null); }
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    
    if (sets.length === 0) return;
    sets.push('updated_at = NOW()');
    params.push(id);
    await conn.query(`UPDATE requisitions SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  /**
   * Lấy req_code + requester_id — dùng cho notification fire-and-forget.
   * @param {number} id
   * @returns {Promise<{req_code:string, requester_id:number}|null>}
   */
  async findMeta(id) {
    const [[row]] = await db.query(
      'SELECT req_code, requester_id FROM requisitions WHERE id = ?', [id]
    );
    return row || null;
  }
}

module.exports = new RequisitionRepository();
