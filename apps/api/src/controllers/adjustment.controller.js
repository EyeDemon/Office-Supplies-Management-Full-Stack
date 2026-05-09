'use strict';
/**
 * adjustment.controller.js — Handles Manual Stock Adjustments
 */
const router = require('express').Router();
const db = require('../shared/config/db');
const repo = require('../infrastructure/repositories/AdjustmentRepository');
const { requireLogin, requireManagerOrAdmin, parsePage, sanitizeLike } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { AdjustmentSchema } = require('../shared/dto/adjustment.dto');
const { ValidationError, NotFoundError } = require('../domain/errors');
const ProcessAdjustment = require('../use-cases/inventory/ProcessAdjustment');
const ApproveAdjustment = require('../use-cases/inventory/ApproveAdjustment');
const stockRepo = require('../infrastructure/repositories/StockRepository');
const stocktakingRepo = require('../infrastructure/repositories/StocktakingRepository');
const adjustmentUC = new ProcessAdjustment({ stockRepository: stockRepo, adjustmentRepository: repo, stocktakingRepository: stocktakingRepo });
const approveUC = new ApproveAdjustment({ stockRepository: stockRepo, adjustmentRepository: repo });



// ── GET / ───────────────────────────────────────────────────────────────────
router.get('/', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  const { page, size } = parsePage(req.query, { defaultSize: 20, maxSize: 100 });
  const productId = parseInt(req.query.productId) || null;
  const changedBy = parseInt(req.query.changedBy) || null;
  const { dateFrom, dateTo, search } = req.query;
  const searchParams = search ? `%${sanitizeLike(search.trim())}%` : null;

  try {
    const { total, rows } = await repo.getAdjustments(db, {
      page, size, productId, changedBy, dateFrom, dateTo, searchParams
    });
    res.json({
      success: true, message: 'OK', data: {
        items: rows, total, page, size, totalPages: Math.ceil(total / size)
      }
    });
  } catch (e) { next(e); }
});

// ── POST / ──────────────────────────────────────────────────────────────────
router.post('/', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try { dto = AdjustmentSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);

    const result = await adjustmentUC.execute(conn, {
      warehouseId: dto.warehouseId,
      productId: dto.productId,
      locationId: dto.locationId || null,
      newQuantity: dto.newQuantity,
      reason: dto.reason,
      note: dto.note || null,
      adjustedBy: req.session.userId,
      referenceId: null,
      referenceType: 'adjustment',
    });
    await conn.commit();

    if (result === null) return res.json({ success: true, message: 'Tồn kho không thay đổi (delta = 0)' });
    res.status(201).json({
      success: true, message: `Điều chỉnh tồn kho thành công (delta: ${result.delta > 0 ? '+' : ''}${result.delta})`, data: result,
    });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/approve', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await approveUC.execute(conn, { adjId: id, actorId: req.session.userId, action: 'APPROVE' });
    await conn.commit();
    res.json({ success: true, message: 'Đã phê duyệt điều chỉnh', data: result });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/reject', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await approveUC.execute(conn, { adjId: id, actorId: req.session.userId, action: 'REJECT' });
    await conn.commit();
    res.json({ success: true, message: 'Đã từ chối điều chỉnh', data: result });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.get('/export', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  const productId = parseInt(req.query.productId) || null;
  const { dateFrom, dateTo, search } = req.query;
  const searchParams = search ? `%${sanitizeLike(search.trim())}%` : null;

  try {
    const rows = await repo.getAdjustmentsForExport(db, { productId, dateFrom, dateTo, searchParams });
    const headers = ['Mã', 'Sản phẩm', 'SKU', 'Tồn cũ', 'Tồn mới', 'Chênh lệch', 'Lý do', 'Trạng thái', 'Người tạo', 'Ngày tạo'];
    const fmtD = d => d ? new Date(d).toLocaleString('vi-VN') : '';
    const esc = v => { const s = String(v || ''); return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g, '""')}"` : s; };

    let csv = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(r => {
      csv += [
        r.adj_code, esc(r.product_name), r.sku, r.old_qty, r.new_qty, r.delta,
        esc(r.reason), r.status, esc(r.changed_by_name), fmtD(r.created_at)
      ].join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lich-su-dieu-chinh.csv"');
    res.send(csv);
  } catch (e) { next(e); }
});

module.exports = router;