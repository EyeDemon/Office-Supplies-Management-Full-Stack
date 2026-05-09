'use strict';
/**
 * unit.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/UnitRepository');
const { requireLogin, requireManagerOrAdmin, requireAdmin, sanitizeLike, getClientIp } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { CreateUnitSchema } = require('../shared/dto/unit.dto');
const { ValidationError, NotFoundError, ConflictError } = require('../domain/errors');



function mapUnit(u) {
  return {
    id:        u.id,
    name:      u.name,
    symbol:    u.symbol || null,
    isBase:    Boolean(u.is_base),
    deleted:   Boolean(u.deleted),
    createdAt: u.created_at,
  };
}



// ─────────────────────────────────────────────────────────────────
// UNITS
// ─────────────────────────────────────────────────────────────────

router.get('/', requireLogin, async (req, res, next) => {
  const { page, size } = parsePage(req.query, { defaultSize: 50, maxSize: 500 });
  const search = req.query.search?.trim();
  try {
    const s = search ? `%${sanitizeLike(search)}%` : null;
    const { total, rows } = await repo.findWithFilters(db, { search: s, size, offset: (page - 1) * size });
    res.json({
      success: true, message: 'OK', data: {
        items: rows.map(mapUnit),
        totalCount: total,
        totalPages: Math.ceil(total / size),
        page,
        size
      }
    });
  } catch (e) { next(e); }
});


router.get('/:id', requireLogin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const unit = await repo.findById(db, id);
    if (!unit) throw new NotFoundError('Unit', id);
    const conversions = await repo.findConversionsByUnitId(db, id);
    res.json({ success: true, message: 'OK', data: { ...mapUnit(unit), conversions: conversions.map(mapConversion) } });
  } catch (e) { next(e); }
});

router.post('/', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = CreateUnitSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const { name, symbol, isBase } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const dup = await repo.findByName(conn, name.trim());
    if (dup) throw new ConflictError(`Đơn vị "${name}" đã tồn tại`);
    
    const newId = await repo.create(conn, { name: name.trim(), symbol: symbol?.trim() || null, isBase: isBase ? 1 : 0 });
    
    await writeAuditLog(conn, {
      entityType: 'unit', entityId: newId, action: 'CREATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { name: name.trim(), symbol, isBase },
    });
    
    await conn.commit();
    const created = await repo.findById(db, newId);
    res.status(201).json({ success: true, message: 'Tạo đơn vị thành công', data: mapUnit(created) });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.put('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const { name, symbol, isBase } = req.body || {};
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('Unit', id);
    
    if (name?.trim() && name.trim() !== existing.name) {
      const dup = await repo.findByNameExcludeId(conn, name.trim(), id);
      if (dup) throw new ConflictError(`Tên "${name}" đã được dùng bởi đơn vị khác`);
    }
    
    const newName   = name?.trim() || existing.name;
    const newSymbol = symbol !== undefined ? (symbol?.trim() || null) : existing.symbol;
    const newIsBase = isBase !== undefined ? (isBase ? 1 : 0) : existing.is_base;
    
    await repo.update(conn, id, { name: newName, symbol: newSymbol, isBase: newIsBase });
    await repo.syncProductsUnit(conn, id, newName);
    
    await writeAuditLog(conn, {
      entityType: 'unit', entityId: id, action: 'UPDATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { name: existing.name, symbol: existing.symbol, isBase: existing.is_base },
      afterData:  { name: newName, symbol: newSymbol, isBase: newIsBase },
    });
    
    await conn.commit();
    const updated = await repo.findById(db, id);
    res.json({ success: true, message: 'Cập nhật đơn vị thành công', data: mapUnit(updated) });
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
    if (!existing) throw new NotFoundError('Unit', id);
    
    const used = await repo.countUsageInProducts(conn, id);
    if (used > 0) {
      throw new ConflictError(`Đơn vị "${existing.name}" đang được dùng bởi ${used} sản phẩm, không thể xóa`);
    }
    
    await repo.softDelete(conn, id);
    await writeAuditLog(conn, {
      entityType: 'unit', entityId: id, action: 'DELETE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { name: existing.name },
    });
    
    await conn.commit();
    res.json({ success: true, message: 'Xóa đơn vị thành công' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});



module.exports = router;
