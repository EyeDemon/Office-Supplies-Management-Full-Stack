// src/middleware/rbac.js — BUG 7: Data-level RBAC v1.0
// Spec XV: Manager → WHERE warehouse_id IN (:user_warehouses)
//          User    → WHERE warehouse_id IN (:user_warehouses)
//          Admin   → no filter (sees all)
//
// Usage:
//   router.get('/', requireLogin, attachUserWarehouses, async (req, res) => {
//     // req.userWarehouseIds = [1, 2] hoặc null (Admin = thấy tất cả)
//     const filter = buildWarehouseFilter(req, 'o.warehouse_id');
//     const [rows] = await db.query(`SELECT ... FROM orders o WHERE ${filter.clause}`, filter.params);
//   });

'use strict';
const db = require('../config/db');

/**
 * Middleware: Load danh sách warehouse_id mà user được phép truy cập.
 * - ADMIN: req.userWarehouseIds = null (không filter)
 * - MANAGER / USER: req.userWarehouseIds = [1, 2, ...]
 *
 * Gắn vào route sau requireLogin.
 */
const attachUserWarehouses = async (req, res, next) => {
  try {
    if (req.session.role === 'ADMIN') {
      req.userWarehouseIds = null;
      req.userDepartmentId = null;
      return next();
    }

    // Get user's assigned warehouses and department
    const [userRows] = await db.query(
      'SELECT department_id FROM users WHERE id = ?',
      [req.session.userId]
    );
    req.userDepartmentId = userRows[0]?.department_id || null;

    const [rows] = await db.query(
      'SELECT warehouse_id FROM user_warehouses WHERE user_id = ?',
      [req.session.userId]
    );

    // BUG-08 Fix: Do not grant full access to MANAGER if no warehouses are assigned.
    // Managers must be assigned to warehouses explicitly like Users.
    req.userWarehouseIds = rows.map(r => r.warehouse_id);

    // [BUG-6] Notification for managers with no warehouse assignment
    if (req.userWarehouseIds.length === 0 && req.session.role === 'MANAGER') {
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (data && typeof data === 'object' && !data.error && !data.errors) {
          data.rbac_warning = 'Bạn chưa được gán quyền truy cập bất kỳ kho nào. Vui lòng liên hệ ADMIN để được phân bổ.';
        }
        return originalJson(data);
      };
    }

    next();
  } catch (e) {
    console.error('[rbac/attachUserWarehouses]', e.message);
    req.userWarehouseIds = [];
    next();
  }
};

/**
 * Build WHERE clause fragment để filter theo warehouse của user.
 *
 * @param {Object} req             - Express request (đã qua attachUserWarehouses)
 * @param {string} column          - Tên cột warehouse, vd: 'o.warehouse_id'
 * @param {boolean} [allowNull=false] - Cho phép NULL warehouse_id (records chưa gán kho)
 * @returns {{ clause: string, params: any[] }}
 *
 * Examples:
 *   buildWarehouseFilter(req, 'ws.warehouse_id')
 *   → { clause: 'ws.warehouse_id IN (?,?)', params: [1, 2] }
 *
 *   Admin:
 *   → { clause: '1=1', params: [] }
 *
 *   User có 0 kho:
 *   → { clause: '1=0', params: [] } (không thấy gì)
 */
function buildWarehouseFilter(req, column, allowNull = false) {
  // Admin: không filter
  if (req.userWarehouseIds === null) {
    return { clause: '1=1', params: [] };
  }

  const ids = req.userWarehouseIds;

  // User chưa được gán kho nào
  if (ids.length === 0) {
    if (allowNull) {
      return { clause: `(${column} IS NULL)`, params: [] };
    }
    return { clause: '1=0', params: [] };
  }

  if (allowNull) {
    return {
      clause: `(${column} IS NULL OR ${column} IN (${ids.map(() => '?').join(',')}))`,
      params: ids,
    };
  }

  return {
    clause: `${column} IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  };
}

/**
 * Middleware: Kiểm tra user có quyền truy cập warehouse_id cụ thể không.
 * Dùng cho các endpoint cần xác nhận 1 kho cụ thể: ?warehouseId=X hoặc req.body.warehouseId
 *
 * @param {Function} getWarehouseId - Hàm lấy warehouse_id từ req, vd: (req) => req.params.warehouseId
 */
function requireWarehouseAccess(getWarehouseId) {
  return async (req, res, next) => {
    // Admin có full access
    if (req.session.role === 'ADMIN') return next();

    const warehouseId = parseInt(getWarehouseId(req));
    if (!warehouseId || isNaN(warehouseId)) return next(); // Không có warehouse_id → không cần check

    try {
      const [rows] = await db.query(
        'SELECT warehouse_id FROM user_warehouses WHERE user_id=? AND warehouse_id=?',
        [req.session.userId, warehouseId]
      );
      if (rows.length === 0) {
        return res.status(403).json({
          errors: [{ code: 'FORBIDDEN', message: 'Bạn không có quyền truy cập kho này' }],
        });
      }
      next();
    } catch (e) {
      console.error('[rbac/requireWarehouseAccess]', e.message);
      res.status(500).json({ errors: [{ code: 'INTERNAL_ERROR', message: 'Lỗi kiểm tra quyền truy cập' }] });
    }
  };
}

/**
 * Lấy danh sách warehouse_id user được phép (dùng trong queries thủ công).
 * Returns null nếu Admin (không filter).
 */
async function getUserWarehouseIds(userId, role) {
  if (role === 'ADMIN') return null;
  const [rows] = await db.query(
    'SELECT warehouse_id FROM user_warehouses WHERE user_id=?', [userId]
  );
  return rows.map(r => r.warehouse_id);
}

/**
 * Build WHERE clause fragment để filter theo department của user.
 * Spec X.2: Lọc dữ liệu theo department_id.
 */
function buildDepartmentFilter(req, column) {
  if (!req.session || req.session.role === 'ADMIN') {
    return { clause: '1=1', params: [] };
  }
  // Nếu không phải Admin, bắt buộc phải lọc theo phòng ban (nếu có)
  if (req.userDepartmentId) {
    return { clause: `${column} = ?`, params: [req.userDepartmentId] };
  }
  return { clause: '1=1', params: [] };
}

module.exports = {
  attachUserWarehouses,
  buildWarehouseFilter,
  buildDepartmentFilter,
  requireWarehouseAccess,
  getUserWarehouseIds,
};
