'use strict';
/**
 * stocktaking.controller.js — Handles Stocktaking sessions
 */
const router = require('express').Router();
const db = require('../shared/config/db');
const repo = require('../infrastructure/repositories/StocktakingRepository');
const { requireLogin, requireWarehouseOrAdmin, parsePage, getClientIp } = require('../shared/middleware/authenticate');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { ValidationError, NotFoundError } = require('../domain/errors');

const stockRepo = require('../infrastructure/repositories/StockRepository');
const ConfirmStocktaking = require('../use-cases/inventory/ConfirmStocktaking');

const confirmUC = new ConfirmStocktaking({
  stockRepository: stockRepo
});
const CreateStocktakingSession = require('../use-cases/inventory/CreateStocktakingSession');
const InputStocktakingItems = require('../use-cases/inventory/InputStocktakingItems');
const CancelStocktaking = require('../use-cases/inventory/CancelStocktaking');

const createUC = new CreateStocktakingSession({ stocktakingRepository: repo });
const inputUC = new InputStocktakingItems({ stocktakingRepository: repo });
const cancelUC = new CancelStocktaking({ stocktakingRepository: repo });

const {
  CreateStocktakingSessionSchema,
  InputStocktakingResultsSchema
} = require('../shared/dto/stocktaking.dto');

const StartCountingStocktaking = require('../use-cases/inventory/StartCountingStocktaking');
const startCountingUC = new StartCountingStocktaking({ stocktakingRepository: repo });

function parseId(req) {
  const id = parseInt(req.params.id);
  return isNaN(id) ? null : id;
}

// ── GET / ───────────────────────────────────────────────────────────────────
router.get('/', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { page, size } = parsePage(req.query);
  const status = req.query.status || null;
  try {
    const whFilter = buildWarehouseFilter(req, 's.warehouse_id', true);
    const { total, rows } = await repo.getSessions(db, {
      status, whClause: whFilter.clause, whParams: whFilter.params, limit: size, offset: (page - 1) * size
    });
    res.json({
      success: true, message: 'OK', data: {
        items: rows, total, page, limit: size, totalPages: Math.ceil(total / size),
      }
    });
  } catch (e) { next(e); }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const id = parseId(req);
  if (!id) return next(new ValidationError('ID không hợp lệ'));
  try {
    const data = await repo.getSessionById(db, id);
    if (!data) throw new NotFoundError('StocktakingSession', id);
    res.json({ success: true, message: 'OK', data: { ...data.session, items: data.items } });
  } catch (e) { next(e); }
});

// ── POST / ──────────────────────────────────────────────────────────────────
router.post('/', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try { dto = CreateStocktakingSessionSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await createUC.execute(conn, {
      note: dto.note, 
      productIds: dto.productIds, 
      warehouseId: dto.warehouseId, 
      createdBy: req.session.userId, 
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.status(201).json({ success: true, message: `Đã tạo đợt kiểm kê ${result.sessionCode}`, data: result });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── PUT /:id/items ──────────────────────────────────────────────────────────
router.put('/:id/items', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseId(req);
  if (!id) return next(new ValidationError('ID không hợp lệ'));

  let dto;
  try { dto = InputStocktakingResultsSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await inputUC.execute(conn, { sessionId: id, updates: dto.items });
    await conn.commit();
    res.json({ success: true, message: 'Đã cập nhật số lượng thực tế' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── PUT /:id/start-counting ───────────────────────────────────────────
router.put('/:id/start-counting', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseId(req);
  if (!id) return next(new ValidationError('ID không hợp lệ'));
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await startCountingUC.execute(conn, { sessionId: id, actorId: req.session.userId, ipAddress: getClientIp(req) });
    await conn.commit();
    res.json({ success: true, message: 'Đã bắt đầu kiểm kê. Kho đã được khoá cho các giao dịch khác.' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── POST /:id/complete ───────────────────────────────────────────────────────
router.post('/:id/complete', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseId(req);
  if (!id) return next(new ValidationError('ID không hợp lệ'));
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await confirmUC.execute(conn, {
      sessionId: id, confirmedBy: req.session.userId, ipAddress: getClientIp(req),
    });
    await conn.commit();
    res.json({ success: true, message: `Xác nhận kiểm kê thành công. Đã điều chỉnh ${result.adjustedCount} sản phẩm.`, data: result });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── DELETE /:id/cancel ──────────────────────────────────────────────────────
router.delete('/:id/cancel', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseId(req);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await cancelUC.execute(conn, { sessionId: id, cancelledBy: req.session.userId, ipAddress: getClientIp(req) });
    await conn.commit();
    res.json({ success: true, message: 'Đã huỷ đợt kiểm kê' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

module.exports = router;
