'use strict';
/**
 * user-warehouse.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/UserWarehouseRepository');
const userRepo = require('../infrastructure/repositories/UserRepository');
const { requireLogin, requireAdmin, getClientIp } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { AssignWarehouseSchema, BulkAssignWarehouseSchema } = require('../shared/dto/user-warehouse.dto');
const { ValidationError, NotFoundError, ConflictError, UnauthorizedError } = require('../domain/errors');



function mapWarehouse(w) {
  return {
    id:          w.id,
    code:        w.code,
    name:        w.name,
    location:    w.location    || null,
    isActive:    Boolean(w.is_active),
    assignedAt:  w.assigned_at || null,
    assignedBy:  w.assigned_by_name || null,
  };
}

router.get('/my', requireLogin, async (req, res, next) => {
  try {
    const rows = await repo.findByUserId(db, req.session.userId);
    res.json({ success: true, message: 'OK', data: rows.map(mapWarehouse) });
  } catch (e) { next(e); }
});

router.get('/:userId', requireLogin, requireAdmin, async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return next(new ValidationError('userId không hợp lệ'));

  try {
    const user = await userRepo.findById(userId); // already clean
    if (!user) throw new NotFoundError('User', userId);

    const assigned = await repo.findAssignedWithAssigner(db, userId);
    const allWarehouses = await repo.findAllWarehouses(db);

    res.json({
      success: true, message: 'OK',
      data: {
        user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
        assignedWarehouses: assigned.map(mapWarehouse),
        allWarehouses: allWarehouses.map(w => ({
          id:       w.id,
          code:     w.code,
          name:     w.name,
          location: w.location || null,
          isActive: Boolean(w.is_active),
          assigned: assigned.some(a => a.id === w.id),
        })),
      },
    });
  } catch (e) { next(e); }
});

router.post('/:userId', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return next(new ValidationError('userId không hợp lệ'));

  const validation = AssignWarehouseSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const { warehouseId } = validation.data.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const user = await userRepo.findByIdForUpdate(conn, userId);
    if (!user) throw new NotFoundError('User', userId);

    const wh = await repo.findWarehouseById(conn, warehouseId);
    if (!wh) throw new NotFoundError('Warehouse', warehouseId);

    const dup = await repo.checkAssigned(conn, userId, warehouseId);
    if (dup) {
      throw new ConflictError(`User "${user.username}" đã được gán kho "${wh.name}"`);
    }

    await repo.assign(conn, userId, warehouseId, req.session.userId);

    await writeAuditLog(conn, {
      entityType: 'user_warehouse', entityId: userId, action: 'ASSIGN_WAREHOUSE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { userId, warehouseId, warehouseName: wh.name },
    });

    await conn.commit();
    res.status(201).json({ success: true, message: `Đã gán kho "${wh.name}" cho user "${user.username}"` });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.post('/:userId/bulk', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return next(new ValidationError('userId không hợp lệ'));

  const validation = BulkAssignWarehouseSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));

  const { warehouseIds } = validation.data.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const user = await userRepo.findByIdForUpdate(conn, userId);
    if (!user) throw new NotFoundError('User', userId);

    if (warehouseIds.length > 0) {
      const allValid = await repo.validateWarehouseIds(conn, warehouseIds);
      if (!allValid) {
        throw new ValidationError('Một hoặc nhiều kho không hợp lệ');
      }
    }

    const oldIds = await repo.getAssignedWarehouseIds(conn, userId);
    await repo.removeAllAssignments(conn, userId);

    if (warehouseIds.length > 0) {
      const values = warehouseIds.map(wid => [userId, wid, req.session.userId]);
      await repo.bulkAssign(conn, values);
    }

    await writeAuditLog(conn, {
      entityType: 'user_warehouse', entityId: userId, action: 'BULK_ASSIGN_WAREHOUSE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { warehouseIds: oldIds },
      afterData:  { warehouseIds },
    });

    await conn.commit();
    res.json({
      success: true,
      message: `Đã cập nhật ${warehouseIds.length} kho cho user "${user.username}"`,
      data: { userId, assignedCount: warehouseIds.length },
    });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.delete('/:userId/:warehouseId', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  const warehouseId = parseInt(req.params.warehouseId);
  if (isNaN(userId) || isNaN(warehouseId)) return next(new ValidationError('ID không hợp lệ'));

  if (req.session.userId === userId) {
    throw new ValidationError('Không thể thu hồi quyền kho của chính mình');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const assignment = await repo.findAssignmentDetails(conn, userId, warehouseId);
    if (!assignment) {
      throw new NotFoundError('Assignment', `${userId}-${warehouseId}`);
    }

    await repo.removeAssignment(conn, userId, warehouseId);

    await writeAuditLog(conn, {
      entityType: 'user_warehouse', entityId: userId, action: 'REVOKE_WAREHOUSE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { userId, warehouseId, warehouseName: assignment.wh_name },
    });

    await conn.commit();
    res.json({
      success: true, message: `Đã thu hồi quyền kho "${assignment.wh_name}" của user "${assignment.username}"`,
    });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
