'use strict';
/**
 * lot.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/LotRepository');
const { requireLogin, requireManagerOrAdmin, requireAdmin, sanitizeLike, parsePage, requireWarehouseOrAdmin, getClientIp } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { CreateLotSchema, UpdateLotSchema } = require('../shared/dto/lot.dto');
const { ValidationError, NotFoundError, ConflictError } = require('../domain/errors');



function mapLot(r) {
  return {
    id:           r.id,
    productId:    r.product_id,
    productName:  r.product_name  || null,
    productSku:   r.product_sku   || null,
    batchCode:    r.batch_code,
    expiryDate:   r.expiry_date   || null,
    quantityIn:   Number(r.quantity_in || 0),
    daysToExpiry: r.days_to_expiry != null ? Number(r.days_to_expiry) : null,
    isExpired:    r.expiry_date ? new Date(r.expiry_date) < new Date() : false,
    note:         r.note          || null,
    createdBy:    r.created_by_name || null,
    createdAt:    r.created_at,
  };
}

router.get('/', requireLogin, async (req, res, next) => {
  const { page, size } = parsePage(req.query, { defaultSize: 20 });
  const { search, productId, expiringSoon, expired } = req.query;
  
  try {
    const s = search?.trim() ? `%${sanitizeLike(search.trim())}%` : null;
    const { total, rows } = await repo.findWithFilters(db, {
      search: s, productId: productId ? parseInt(productId) : null,
      expiringSoon: expiringSoon === '1', expired: expired === '1',
      size, offset: (page - 1) * size
    });
    
    res.json({
      success: true, message: 'OK',
      data: {
        items: rows.map(mapLot),
        totalCount: total, totalPages: Math.ceil(total / size), page, size,
      },
    });
  } catch (e) { next(e); }
});

router.get('/expiring', requireLogin, async (req, res, next) => {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 30);
    const rows = await repo.findExpiring(db, days);
    res.json({ success: true, message: 'OK', data: rows.map(mapLot) });
  } catch (e) { next(e); }
});

router.get('/expired', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  try {
    const rows = await repo.findExpired(db);
    res.json({ success: true, message: 'OK', data: rows.map(r => ({ ...mapLot(r), daysExpired: Number(r.days_expired || 0) })) });
  } catch (e) { next(e); }
});

router.get('/by-product/:productId', requireLogin, async (req, res, next) => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) return next(new ValidationError('Product ID không hợp lệ'));
  try {
    const rows = await repo.findByProductId(db, productId);
    res.json({ success: true, message: 'OK', data: rows.map(mapLot) });
  } catch (e) { next(e); }
});

router.get('/:id', requireLogin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const row = await repo.findById(db, id);
    if (!row) throw new NotFoundError('Lot', id);
    const txs = await repo.findTransactionsByLot(db, id);
    res.json({ success: true, message: 'OK', data: { ...mapLot(row), transactions: txs } });
  } catch (e) { next(e); }
});

router.post('/', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = CreateLotSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const { productId, batchCode, expiryDate, quantityIn, note } = validation.data.body;
  
  if (expiryDate && isNaN(Date.parse(expiryDate))) return next(new ValidationError('Ngày hết hạn không hợp lệ'));
  if (expiryDate && new Date(expiryDate) < new Date()) {
    return next(new ValidationError(`Lô hàng đã hết hạn (${expiryDate}). Không thể tạo lô hết hạn.`));
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[product]] = await conn.query('SELECT id, name FROM products WHERE id=? AND deleted=0', [productId]);
    if (!product) throw new NotFoundError('Product', productId);

    const dup = await repo.checkDuplicateBatch(conn, productId, batchCode.trim());
    if (dup) throw new ConflictError(`Mã lô "${batchCode}" đã tồn tại cho sản phẩm này`);

    const newId = await repo.create(conn, {
      productId, batchCode: batchCode.trim(), expiryDate: expiryDate || null,
      quantityIn: quantityIn || 0, note: note?.trim() || null, createdBy: req.session.userId
    });

    await writeAuditLog(conn, {
      entityType: 'lot', entityId: newId, action: 'CREATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { productId, batchCode: batchCode.trim(), expiryDate: expiryDate || null, quantityIn },
    });

    await conn.commit();
    const created = await repo.findById(db, newId);
    res.status(201).json({ success: true, message: 'Tạo lô hàng thành công', data: mapLot(created) });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.put('/:id', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const validation = UpdateLotSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const { expiryDate, note } = validation.data.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('Lot', id);

    const newExpiry = expiryDate !== undefined ? (expiryDate || null) : existing.expiry_date;
    const newNote   = note !== undefined ? (note?.trim() || null) : existing.note;

    if (newExpiry && isNaN(Date.parse(newExpiry))) {
      throw new ValidationError('Ngày hết hạn không hợp lệ');
    }

    await repo.update(conn, id, { expiryDate: newExpiry, note: newNote });

    await writeAuditLog(conn, {
      entityType: 'lot', entityId: id, action: 'UPDATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { expiryDate: existing.expiry_date, note: existing.note },
      afterData:  { expiryDate: newExpiry, note: newNote },
    });

    await conn.commit();
    const updated = await repo.findById(db, id);
    res.json({ success: true, message: 'Cập nhật lô thành công', data: mapLot(updated) });
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
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('Lot', id);

    const used = await repo.checkUsage(conn, id);
    if (used > 0) {
      throw new ConflictError(`Lô "${existing.batch_code}" đã có ${used} giao dịch, không thể xóa`);
    }

    await repo.delete(conn, id);
    
    await writeAuditLog(conn, {
      entityType: 'lot', entityId: id, action: 'DELETE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { batchCode: existing.batch_code, productId: existing.product_id },
    });

    await conn.commit();
    res.json({ success: true, message: 'Xóa lô hàng thành công' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
