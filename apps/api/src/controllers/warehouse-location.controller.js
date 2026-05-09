'use strict';
/**
 * warehouse-location.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/WarehouseLocationRepository');
const { requireLogin, requireWarehouseOrAdmin, requireManagerOrAdmin, getClientIp } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { CreateWarehouseLocationSchema, UpdateWarehouseLocationSchema } = require('../shared/dto/warehouse-location.dto');
const { ValidationError, NotFoundError, ConflictError } = require('../domain/errors');



function mapLoc(l) {
  return {
    id: l.id,
    warehouseId: l.warehouse_id,
    warehouseName: l.warehouse_name,
    code: l.code,
    name: l.name,
    description: l.description,
    capacity: l.capacity,
    isActive: Boolean(l.is_active),
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  };
}

router.get('/', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const warehouseId = parseInt(req.query.warehouseId) || null;
  const onlyActive  = req.query.active !== 'false';
  try {
    const rows = await repo.findWithFilters(db, { warehouseId, onlyActive });
    res.json({ success: true, message: 'OK', data: rows.map(mapLoc) });
  } catch (e) { next(e); }
});

router.get('/:id', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const row = await repo.findById(db, id);
    if (!row) throw new NotFoundError('WarehouseLocation', id);
    res.json({ success: true, message: 'OK', data: mapLoc(row) });
  } catch (e) { next(e); }
});

router.post('/', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = CreateWarehouseLocationSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const { warehouseId, code, name, description, capacity } = validation.data.body;
  const codeTrimmed = code.trim().toUpperCase();

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const wh = await repo.findWarehouseById(conn, warehouseId);
    if (!wh) throw new NotFoundError('Warehouse', warehouseId);

    const dup = await repo.checkCodeExists(conn, warehouseId, codeTrimmed);
    if (dup) throw new ConflictError(`Mã vị trí '${codeTrimmed}' đã tồn tại trong kho này`);

    const newId = await repo.create(conn, {
      warehouseId, code: codeTrimmed, name: name?.trim() || null,
      description: description?.trim() || null, capacity: capacity || null,
      createdBy: req.session.userId
    });

    await writeAuditLog(conn, {
      entityType: 'warehouse_location', entityId: newId, action: 'CREATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { warehouse_id: warehouseId, code: codeTrimmed, name },
    });

    await conn.commit();
    const created = await repo.findById(db, newId);
    res.status(201).json({ success: true, message: 'Tạo vị trí thành công', data: mapLoc(created) });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.put('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));

  const validation = UpdateWarehouseLocationSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const { name, description, capacity, isActive } = validation.data.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('WarehouseLocation', id);

    const newName = name?.trim() ?? existing.name;
    const newDesc = description?.trim() ?? existing.description;
    const newCap  = capacity !== undefined ? capacity || null : existing.capacity;
    const newAct  = isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active;

    await repo.update(conn, id, { name: newName, description: newDesc, capacity: newCap, isActive: newAct });

    await writeAuditLog(conn, {
      entityType: 'warehouse_location', entityId: id, action: 'UPDATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { name: existing.name, is_active: existing.is_active },
      afterData: { name: newName, is_active: newAct },
    });

    await conn.commit();
    const updated = await repo.findById(db, id);
    res.json({ success: true, message: 'Cập nhật vị trí thành công', data: mapLoc(updated) });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.delete('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('WarehouseLocation', id);

    await repo.deactivate(conn, id);

    // write audit log for delete
    await writeAuditLog(conn, {
      entityType: 'warehouse_location', entityId: id, action: 'DEACTIVATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { is_active: existing.is_active },
      afterData: { is_active: 0 },
    });

    await conn.commit();
    res.json({ success: true, message: 'Đã vô hiệu hoá vị trí kho' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
