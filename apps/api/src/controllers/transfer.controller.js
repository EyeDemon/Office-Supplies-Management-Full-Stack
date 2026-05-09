'use strict';
/**
 * transfer.controller.js — Handles Stock Transfers (Điều chuyển kho)
 */
const router = require('express').Router();
const db = require('../shared/config/db');
const repo = require('../infrastructure/repositories/OrderRepository');
const { requireLogin, requireWarehouseOrAdmin, parsePage, getClientIp } = require('../shared/middleware/authenticate');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { convertToBaseUnit, adjustWarehouseStock } = require('../shared/utils/stockHelper');
const { TransferSchema } = require('../shared/dto/transfer.dto');
const { assertValidTransition } = require('../domain/rules');
const stockRepo = require('../infrastructure/repositories/StockRepository');
const ProcessTransfer = require('../use-cases/inventory/ProcessTransfer');
const { ValidationError, NotFoundError } = require('../domain/errors');

const stocktakingRepo = require('../infrastructure/repositories/StocktakingRepository');
const unitService = require('../domain/services/UnitService');

const transferUC = new ProcessTransfer({
  stockRepository: stockRepo,
  stocktakingRepository: stocktakingRepo,
  unitService
});



// ── GET / ───────────────────────────────────────────────────────────────────
router.get('/', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit) || 20));
  const { status, search } = req.query;

  try {
    // Custom filter: from OR to warehouse
    const whFilter = buildWarehouseFilter(req, 't.from_warehouse_id', false);
    let filter;
    if (whFilter.clause !== '1=1' && whFilter.clause !== '1=0') {
      const toFilter = buildWarehouseFilter(req, 't.to_warehouse_id', false);
      filter = {
        clause: `(${whFilter.clause} OR ${toFilter.clause})`,
        params: [...whFilter.params, ...toFilter.params]
      };
    } else {
      filter = whFilter;
    }

    const { total, rows } = await repo.findAllTransfers(db, {
      status, search: search ? `%${search}%` : null,
      warehouseFilter: filter, limit, offset: (page - 1) * limit
    });
    res.json({
      success: true, message: 'OK', data: {
        items: rows, total, page, limit, totalPages: Math.ceil(total / limit)
      }
    });
  } catch (e) { next(e); }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  try {
    const data = await repo.findTransferById(db, id);
    if (!data) throw new NotFoundError('StockTransfer', id);
    res.json({ success: true, message: 'OK', data });
  } catch (e) { next(e); }
});

// ── POST / ──────────────────────────────────────────────────────────────────
router.post('/', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try {
    dto = TransferSchema.parse(req.body);
  } catch (e) {
    return next(e);
  }

  const { fromLocation, toLocation, fromWarehouseId, toWarehouseId, note, items } = dto;
  if (fromWarehouseId === toWarehouseId) {
    return next(new ValidationError('Kho đi và kho đến không được trùng nhau'));
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    // Generate code with lock
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `DC-${ym}-`;
    const lockName = `qlvpp_transfer_code_${ym}`;
    const [[{ lockAcq }]] = await conn.query(`SELECT GET_LOCK(?, 10) AS lockAcq`, [lockName]);
    if (!lockAcq) throw new Error('Lock timeout');
    
    let transferCode;
    try {
      const [[{ maxSeq }]] = await conn.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(transfer_code, -4) AS UNSIGNED)), 0) AS maxSeq
         FROM stock_transfers WHERE transfer_code LIKE ? FOR UPDATE`,
        [`${prefix}%`]
      );
      transferCode = `${prefix}${String(Number(maxSeq) + 1).padStart(4, '0')}`;
    } finally { await conn.query(`SELECT RELEASE_LOCK(?)`, [lockName]); }

    const orderId = await repo.createTransfer(conn, {
      transferCode, fromLocation, toLocation, fromWarehouseId, toWarehouseId, note, createdBy: req.session.userId
    });
    await repo.insertTransferItems(conn, orderId, items);

    await writeAuditLog(conn, {
      entityType: 'stock_transfer', entityId: orderId, action: 'CREATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { transfer_code: transferCode, status: 'DRAFT' },
    });
    await conn.commit();
    res.status(201).json({ success: true, message: `Tạo phiếu điều chuyển ${transferCode} thành công`, data: { id: orderId, transferCode } });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});



// ── Status Transitions ──────────────────────────────────────────────────────
router.post('/:id/submit', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await repo.findTransferForUpdate(conn, id);
    if (!existing) throw new NotFoundError('Phiếu điều chuyển', id);
    assertValidTransition('transfer', existing.status, 'PENDING');
    await repo.updateTransferStatus(conn, id, { status: 'PENDING', userId: req.session.userId });
    await conn.commit();
    res.json({ success: true, message: 'Đã gửi duyệt phiếu điều chuyển' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/approve', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await repo.findTransferForUpdate(conn, id);
    if (!existing) throw new NotFoundError('Phiếu điều chuyển', id);
    assertValidTransition('transfer', existing.status, 'APPROVED');
    await repo.updateTransferStatus(conn, id, { status: 'APPROVED', userId: req.session.userId });
    await conn.commit();
    res.json({ success: true, message: 'Đã duyệt phiếu điều chuyển' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── Phase 1: Dispatch (Xuất kho nguồn) ──────────────────────────────────────
router.post('/:id/dispatch', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const tf = await repo.findTransferById(conn, id);
    if (!tf) throw new NotFoundError('Phiếu điều chuyển', id);
    assertValidTransition('transfer', tf.status, 'IN_TRANSIT');

    await transferUC.dispatch(conn, {
      transferId: tf.id, transferCode: tf.transfer_code,
      fromWarehouseId: tf.from_warehouse_id, items: tf.items,
      userId: req.session.userId
    });

    await repo.updateTransferStatus(conn, id, { status: 'IN_TRANSIT', userId: req.session.userId });
    await writeAuditLog(conn, {
      entityType: 'stock_transfer', entityId: id, action: 'DISPATCH',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { status: 'IN_TRANSIT' },
    });
    await conn.commit();
    res.json({ success: true, message: `Hàng đang vận chuyển đến ${tf.to_location}.` });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── Phase 2: Complete (Nhập kho đích) ───────────────────────────────────────
router.post('/:id/complete', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const tf = await repo.findTransferById(conn, id);
    if (!tf) throw new NotFoundError('Phiếu điều chuyển', id);
    assertValidTransition('transfer', tf.status, 'COMPLETED');

    await transferUC.complete(conn, {
      transferId: tf.id, transferCode: tf.transfer_code,
      toWarehouseId: tf.to_warehouse_id, items: tf.items,
      userId: req.session.userId
    });

    await repo.markTransferCompleted(conn, id, req.session.userId);
    await writeAuditLog(conn, {
      entityType: 'stock_transfer', entityId: id, action: 'COMPLETE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { status: 'COMPLETED' },
    });
    await conn.commit();
    res.json({ success: true, message: `Điều chuyển ${tf.transfer_code} hoàn tất.` });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── Cancel — Undo Phase 1 if needed ─────────────────────────────────────────
router.post('/:id/cancel', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const tf = await repo.findTransferById(conn, id);
    if (!tf) throw new NotFoundError('Phiếu điều chuyển', id);
    assertValidTransition('transfer', tf.status, 'CANCELLED');

    if (tf.status === 'IN_TRANSIT') {
      await transferUC.cancel(conn, {
        transferId: tf.id,
        transferCode: tf.transfer_code,
        items: tf.items,
        fromWarehouseId: tf.from_warehouse_id,
        userId: req.session.userId
      });
    }

    await repo.updateTransferStatus(conn, id, { status: 'CANCELLED', userId: req.session.userId });
    await writeAuditLog(conn, {
      entityType: 'stock_transfer', entityId: id, action: 'CANCEL',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { status: tf.status }, afterData: { status: 'CANCELLED' }
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã huỷ phiếu điều chuyển' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

module.exports = router;
