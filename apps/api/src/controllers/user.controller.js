'use strict';
/**
 * user.controller.js — Clean Architecture Layer 1
 */
const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/UserRepository');
const useCase = require('../use-cases/master-data/ManageUser');
const {
  requireLogin,
  requireAdmin,
  requireSelfOrAdmin,
  getClientIp,
  parsePage,
} = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { attachUserWarehouses, buildDepartmentFilter } = require('../shared/middleware/rbac');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { CreateUserSchema, UpdateUserSchema, ChangePasswordSchema } = require('../shared/dto/user.dto');
const { ValidationError, NotFoundError, UnauthorizedError, ForbiddenError } = require('../domain/errors');

router.get('/departments', requireLogin, async (req, res, next) => {
  try {
    const rows = await repo.getDepartments();
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

router.get('/', requireLogin, attachUserWarehouses, async (req, res, next) => {
  const { page, size } = parsePage(req.query);
  const { role, department, search } = req.query;
  const deptFilter = buildDepartmentFilter(req, 'u.department_id');

  try {
    const { total, users } = await repo.findWithFilters({
      search: search ? `%${search}%` : null,
      role,
      department,
      departmentFilter: deptFilter,
      size,
      offset: (page - 1) * size
    });
    res.json({
      success: true,
      message: 'OK',
      data: {
        users: users.map(repo.mapUser),
        totalCount: total,
        totalPages: Math.ceil(total / size),
        page,
        size
      }
    });
  } catch (e) { next(e); }
});

router.get('/deleted', requireLogin, requireAdmin, async (req, res, next) => {
  try {
    const users = await repo.findDeleted();
    res.json({ success: true, message: 'OK', data: users.map(repo.mapUser) });
  } catch (e) { next(e); }
});

router.get('/:id', requireLogin, requireSelfOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const user = await repo.findById(id);
    if (!user) throw new NotFoundError('User', id);
    res.json({ success: true, message: 'OK', data: user });
  } catch (e) { next(e); }
});

router.post('/', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = CreateUserSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const newId = await useCase.createUser(conn, validation.data.body, req.session.userId);
    
    await writeAuditLog(conn, {
      entityType: 'user', entityId: newId, action: 'CREATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: {
        username: validation.data.body.username,
        email: validation.data.body.email,
        role: validation.data.body.role,
        departmentId: validation.data.body.departmentId
      },
    });
    
    await conn.commit();
    const newUser = await repo.findById(newId);
    res.status(201).json({ success: true, message: 'Tạo user thành công', data: newUser });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.put('/:id', requireLogin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const isAdmin = req.session.role === 'ADMIN';
  if (!isAdmin && req.session.userId !== id) {
    throw new ForbiddenError('Không có quyền cập nhật profile của người khác');
  }
  
  const validation = UpdateUserSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { before, after } = await useCase.updateUser(conn, id, validation.data.body, req.session.userId, isAdmin);
    
    await writeAuditLog(conn, {
      entityType: 'user', entityId: id, action: 'UPDATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: {
        email: before.email,
        fullName: before.full_name,
        role: before.role,
        departmentId: before.department_id
      },
      afterData: {
        email: after.email,
        fullName: after.fullName,
        role: after.role,
        departmentId: after.departmentId,
        passwordChanged: Boolean(validation.data.body.password)
      },
    });
    
    await conn.commit();
    const updated = await repo.findById(id);
    res.json({ success: true, message: 'Cập nhật user thành công', data: updated });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.delete('/:id', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await useCase.deleteUser(conn, id, req.session.userId);
    
    await writeAuditLog(conn, {
      entityType: 'user', entityId: id, action: 'DELETE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { username: existing.username, role: existing.role, deleted: false },
      afterData:  { deleted: true },
    });
    
    await conn.commit();
    res.json({ success: true, message: 'Xóa user thành công' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.post('/:id/restore', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await repo.findDeletedByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('DeletedUser', id);
    
    await repo.restore(conn, id);
    
    await writeAuditLog(conn, {
      entityType: 'user', entityId: id, action: 'RESTORE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { deleted: true },
      afterData: { username: existing.username, role: existing.role, deleted: false },
    });
    
    await conn.commit();
    res.json({ success: true, message: 'Khôi phục user thành công' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
