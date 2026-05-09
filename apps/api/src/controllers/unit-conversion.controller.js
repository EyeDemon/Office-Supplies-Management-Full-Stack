'use strict';
/**
 * unit-conversion.controller.js — CRUD for Unit Conversions
 */
const router = require('express').Router();
const db     = require('../shared/config/db');
const unitRepo = require('../infrastructure/repositories/UnitRepository');
const { requireLogin, requireAdmin, requireManagerOrAdmin, getClientIp } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { NotFoundError, ValidationError, ConflictError } = require('../domain/errors');

const { UnitConversionSchema, UpdateUnitConversionSchema } = require('../shared/dto/unit-conversion.dto');

// 1. GET ALL
router.get('/', requireLogin, async (req, res, next) => {
  try {
    const rows = await unitRepo.findAllConversions(db);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// 2. CREATE
router.post('/', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = UnitConversionSchema.safeParse(req.body);
  if (!validation.success) {
    return next(new ValidationError(validation.error.errors[0].message));
  }
  const { fromUnitId, toUnitId, ratio, note } = validation.data;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    // Check if exists
    const existing = await unitRepo.findConversionByPair(conn, fromUnitId, toUnitId);
    if (existing) throw new ConflictError('Quy tắc chuyển đổi này đã tồn tại');

    const id = await unitRepo.createConversion(conn, { fromUnitId, toUnitId, ratio, note });
    
    await writeAuditLog(conn, {
      entityType: 'unit_conversion', entityId: id, action: 'CREATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { fromUnitId, toUnitId, ratio, note }
    });

    await conn.commit();
    res.status(201).json({ success: true, data: { id } });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// 3. UPDATE
router.put('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const validation = UpdateUnitConversionSchema.safeParse(req.body);
  if (!validation.success) {
    return next(new ValidationError(validation.error.errors[0].message));
  }
  const { ratio, note } = validation.data;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    const uc = await unitRepo.findConversionByIdForUpdate(conn, id);
    if (!uc) throw new NotFoundError('UnitConversion', id);

    await unitRepo.updateConversion(conn, id, { ratio, note });
    
    await writeAuditLog(conn, {
      entityType: 'unit_conversion', entityId: id, action: 'UPDATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { ratio: uc.ratio, note: uc.note },
      afterData: { ratio, note }
    });

    await conn.commit();
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// 4. DELETE
router.delete('/:id', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    const uc = await unitRepo.findConversionByIdForUpdate(conn, id);
    if (!uc) throw new NotFoundError('UnitConversion', id);

    await unitRepo.deleteConversion(conn, id);
    
    await writeAuditLog(conn, {
      entityType: 'unit_conversion', entityId: id, action: 'DELETE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: uc
    });

    await conn.commit();
    res.json({ success: true, message: 'Xoá thành công' });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

module.exports = router;
