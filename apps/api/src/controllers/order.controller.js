'use strict';
/**
 * order.controller.js — Clean Architecture Layer 1
 * Handles Import Orders (Phiếu nhập kho)
 */
const router = require('express').Router();
const db = require('../shared/config/db');
const repo = require('../infrastructure/repositories/OrderRepository');
const { requireLogin, requireWarehouseOrAdmin, parsePage, getClientIp } = require('../shared/middleware/authenticate');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { streamToCsv } = require('../shared/utils/csv/csvStream');
const { assertValidTransition } = require('../domain/rules');
const { CreateImportOrderSchema, UpdateImportOrderSchema } = require('../shared/dto/order.dto');

const { ValidationError, NotFoundError } = require('../domain/errors');
const ProcessInbound = require('../use-cases/inventory/ProcessInbound');
const FindOrders = require('../use-cases/order/FindOrders');
const GetOrderById = require('../use-cases/order/GetOrderById');
const CreateOrder = require('../use-cases/order/CreateOrder');
const UpdateOrder = require('../use-cases/order/UpdateOrder');
const UpdateStatus = require('../use-cases/order/UpdateOrderStatus');


// Repositories & Services for DI
const stockRepo = require('../infrastructure/repositories/StockRepository');
const unitService = require('../domain/services/UnitService');
const stocktakingRepo = require('../infrastructure/repositories/StocktakingRepository');
const inboundUC = new ProcessInbound({
  stockRepository: stockRepo,
  stocktakingRepository: stocktakingRepo, // ← thêm dòng này
  unitService: unitService
});
const findUC = new FindOrders({ orderRepository: repo });
const getByIdUC = new GetOrderById({ orderRepository: repo });
const createUC = new CreateOrder({ orderRepository: repo });
const updateUC = new UpdateOrder({ orderRepository: repo });
const updateStatusUC = new UpdateStatus({ orderRepository: repo });




function mapOrder(o) {
  return {
    id: o.id,
    orderCode: o.order_code,
    status: o.status,
    totalAmount: Number(o.total_amount || 0),
    note: o.note || null,
    itemCount: Number(o.item_count || 0),
    supplierId: o.supplier_id || null,
    supplierName: o.supplier_name || null,
    supplierCode: o.supplier_code || null,
    warehouseId: o.warehouse_id || null,
    warehouseName: o.warehouse_name || null,
    createdByName: o.created_by_name || null,
    submittedByName: o.submitted_by_name || null,
    submittedAt: o.submitted_at || null,
    approvedByName: o.approved_by_name || null,
    approvedAt: o.approved_at || null,
    confirmedByName: o.confirmed_by_name || null,
    confirmedAt: o.confirmed_at || null,
    completedAt: o.completed_at || null,
    completedByName: o.completed_by_name || null,
    rejectedByName: o.rejected_by_name || null,
    rejectedAt: o.rejected_at || null,
    cancelledByName: o.cancelled_by_name || null,
    cancelledAt: o.cancelled_at || null,
    createdAt: o.created_at,
    updatedAt: o.updated_at || null,
  };
}

// ── GET / — Danh sách phiếu nhập ──────────────────────────────────
router.get('/', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { page, size } = parsePage(req.query);
  const { status, supplierId, dateFrom, dateTo } = req.query;
  try {
    const whFilter = buildWarehouseFilter(req, 'o.warehouse_id', true);
    const { total, rows } = await findUC.execute(db, {
      type: 'IMPORT',
      status, supplierId: parseInt(supplierId) || null, dateFrom, dateTo,
      warehouseFilter: whFilter, size, offset: (page - 1) * size
    });
    res.json({
      success: true, message: 'OK', data: {
        items: rows.map(mapOrder), totalCount: total,
        totalPages: Math.ceil(total / size), page, size,
      }
    });
  } catch (e) { next(e); }
});

// ── GET /export — Xuất CSV ────────────────────────────────────────
router.get('/export', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { status, supplierId, dateFrom, dateTo } = req.query;
  const conn = await db.getConnection();
  try {
    const whFilter = buildWarehouseFilter(req, 'o.warehouse_id', true);
    
    let sql = `SELECT o.order_code, s.name AS supplier_name, s.supplier_code,
                      o.item_count, o.total_amount, o.status, o.note,
                      u.full_name AS created_by_name, o.created_at
               FROM import_orders o
               LEFT JOIN suppliers s ON s.id = o.supplier_id
               LEFT JOIN users u ON u.id = o.created_by
               WHERE o.type = 'IMPORT' AND ${whFilter.clause}`;
    
    const params = [...whFilter.params];
    if (status) { sql += ' AND o.status = ?'; params.push(status); }
    if (supplierId) { sql += ' AND o.supplier_id = ?'; params.push(parseInt(supplierId)); }
    if (dateFrom) { sql += ' AND DATE(o.created_at) >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND DATE(o.created_at) <= ?'; params.push(dateTo); }
    
    sql += ' ORDER BY o.created_at DESC LIMIT 5000';

    const STATUS_VI = {
      DRAFT: 'Nháp', PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt',
      COMPLETED: 'Hoàn tất', CANCELLED: 'Đã huỷ', CONFIRMED: 'Hoàn tất', REJECTED: 'Từ chối'
    };

    const headers = ['Mã phiếu', 'Nhà cung cấp', 'Mã NCC', 'Số dòng', 'Tổng tiền (đ)', 'Trạng thái', 'Ghi chú', 'Tạo bởi', 'Ngày tạo'];
    const filename = `phieu-nhap-kho-${new Date().toISOString().slice(0, 10)}.csv`;

    const queryStream = conn.connection.query(sql, params).stream();

    streamToCsv(res, filename, headers, queryStream, (o) => [
      o.order_code, o.supplier_name, o.supplier_code, o.item_count, 
      Number(o.total_amount || 0).toFixed(0),
      STATUS_VI[o.status] || o.status, o.note, o.created_by_name, o.created_at
    ]);

    res.on('finish', () => conn.release());
  } catch (e) {
    conn.release();
    next(e);
  }
});

// ── GET /:id — Chi tiết ──────────────────────────────────────────
router.get('/:id', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const data = await getByIdUC.execute(db, { type: 'IMPORT', id });
    res.json({ success: true, message: 'OK', data: mapOrder(data) });
  } catch (e) { next(e); }
});

// ── POST / — Tạo mới (DRAFT) ──────────────────────────────────────
router.post('/', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try {
    dto = CreateImportOrderSchema.parse(req.body);
  } catch (e) {
    return next(e);
  }
  const { supplierId, note, items, warehouseId } = dto;

  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);
    const result = await createUC.execute(conn, {
      type: 'IMPORT',
      dto,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.status(201).json({ success: true, message: `Tạo phiếu nhập ${result.orderCode} thành công`, data: result });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

// ── PUT /:id — Cập nhật (DRAFT) ───────────────────────────────────
router.put('/:id', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));

  let dto;
  try {
    dto = UpdateImportOrderSchema.parse(req.body);
  } catch (e) {
    return next(e);
  }

  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);
    await updateUC.execute(conn, {
      type: 'IMPORT',
      id,
      dto,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Cập nhật phiếu nhập thành công' });

  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

// ── Status Changes ─────────────────────────────────────────────────
router.post('/:id/submit', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);
    await updateStatusUC.execute(conn, {
      type: 'IMPORT', id, status: 'PENDING',
      userId: req.session.userId, ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã gửi duyệt phiếu nhập' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/approve', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);
    await updateStatusUC.execute(conn, {
      type: 'IMPORT', id, status: 'APPROVED',
      userId: req.session.userId, ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã duyệt phiếu nhập' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/reject', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);
    await updateStatusUC.execute(conn, {
      type: 'IMPORT', id, status: 'REJECTED', reason,
      userId: req.session.userId, ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã từ chối phiếu nhập' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/cancel', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);
    const existing = await repo.findImportOrderForUpdate(conn, id);
    if (!existing) throw new NotFoundError('Phiếu nhập kho', id);
    assertValidTransition('import_order', existing.status, 'CANCELLED');
    await repo.updateImportStatus(conn, id, { status: 'CANCELLED', userId: req.session.userId });
    await writeAuditLog(conn, {
      entityType: 'import_order', entityId: id, action: 'CANCEL',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { status: existing.status },
      afterData: { status: 'CANCELLED' }
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã huỷ phiếu nhập' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── POST /:id/complete — Nhập kho (APPROVED -> COMPLETED) ──────────
router.post('/:id/complete', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);
    const order = await repo.findImportById(conn, id);
    if (!order) throw new NotFoundError('Phiếu nhập kho', id);
    assertValidTransition('import_order', order.status, 'COMPLETED');

    await inboundUC.execute(conn, {
      orderId: id,
      orderCode: order.order_code,
      warehouseId: order.warehouse_id,
      items: order.items.map(i => ({
        productId: i.product_id,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        totalPrice: i.total_price,
        unitId: i.unit_id,
        lotId: i.lot_id || null
      })),
      completedBy: req.session.userId
    });

    await repo.updateImportStatus(conn, id, { status: 'COMPLETED', userId: req.session.userId });
    await writeAuditLog(conn, {
      entityType: 'import_order', entityId: id, action: 'COMPLETE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { status: order.status },
      afterData: { status: 'COMPLETED' }
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã hoàn tất nhập kho' });
  } catch (e) {
    await conn.rollback();
    if (e.code && e.code !== 'INTERNAL_ERROR') return next(e);
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
