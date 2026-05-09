'use strict';
/**
 * export-order.controller.js — Handles Export Orders (Phiếu xuất kho)
 */
const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/OrderRepository');
const { requireLogin, requireWarehouseOrAdmin, parsePage, getClientIp } = require('../shared/middleware/authenticate');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');
const { streamToCsv } = require('../shared/utils/csv/csvStream');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { assertValidTransition } = require('../domain/rules');
const { CreateExportOrderSchema, UpdateExportOrderSchema } = require('../shared/dto/order.dto');



const ProcessOutbound = require('../use-cases/inventory/ProcessOutbound');
const ReserveStock = require('../use-cases/inventory/ReserveStock');
const ReleaseStock = require('../use-cases/inventory/ReleaseReservation');
const FindOrders = require('../use-cases/order/FindOrders');
const GetOrderById = require('../use-cases/order/GetOrderById');
const CreateOrder = require('../use-cases/order/CreateOrder');
const UpdateOrder = require('../use-cases/order/UpdateOrder');
const UpdateStatus = require('../use-cases/order/UpdateOrderStatus');


// Repositories & Services for DI
const stockRepo = require('../infrastructure/repositories/StockRepository');
const reqRepo = require('../infrastructure/repositories/RequisitionRepository');
const lotRepo = require('../infrastructure/repositories/LotRepository');
const stocktakingRepo = require('../infrastructure/repositories/StocktakingRepository');
const unitService = require('../domain/services/UnitService');

// Instantiate Use Cases with DI
const outboundUC = new ProcessOutbound({
  stockRepository: stockRepo,
  requisitionRepository: reqRepo,
  lotRepository: lotRepo,
  orderRepository: repo,
  stocktakingRepository: stocktakingRepo,
  unitService
});
const reserveUC = new ReserveStock({ stockRepository: stockRepo });
const releaseUC = new ReleaseStock({ stockRepository: stockRepo });
const findUC = new FindOrders({ orderRepository: repo });
const getByIdUC = new GetOrderById({ orderRepository: repo });
const createUC = new CreateOrder({ orderRepository: repo });
const updateUC = new UpdateOrder({ orderRepository: repo });
const updateStatusUC = new UpdateStatus({
  orderRepository: repo,
  stockRepository: stockRepo,
  unitService,
  reserveStockUseCase: reserveUC,
  releaseReservationUseCase: releaseUC
});


const { ValidationError, NotFoundError } = require('../domain/errors');

// ── GET / ───────────────────────────────────────────────────────────────────
router.get('/', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit) || 20));
  const off = (page - 1) * limit;
  const { status, search, dateFrom, dateTo } = req.query;

  try {
    const whFilter = buildWarehouseFilter(req, 'e.warehouse_id', true);
    const { total, rows } = await findUC.execute(db, {
      type: 'EXPORT',
      status, search: search ? `%${search}%` : null, dateFrom, dateTo,
      warehouseFilter: whFilter, limit, offset: off
    });
    res.json({
      success: true, message: 'OK', data: {
        items: rows,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        page,
        size: limit,
      }
    });

  } catch (e) { next(e); }
});

// ── GET /export/csv ──────────────────────────────────────────────────────────
router.get('/export/csv', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { status, from, to } = req.query;
  const conn = await db.pool.getConnection();
  try {
    const whFilter = buildWarehouseFilter(req, 'o.warehouse_id', true);
    
    let sql = `SELECT o.order_code, o.status, o.recipient_name, o.department,
                      o.total_qty, o.note, u.full_name AS created_by_name, o.created_at
               FROM export_orders o
               LEFT JOIN users u ON u.id = o.created_by
               WHERE o.type = 'EXPORT' AND ${whFilter.clause}`;
    
    const params = [...whFilter.params];
    if (status) { sql += ' AND o.status = ?'; params.push(status); }
    if (from) { sql += ' AND DATE(o.created_at) >= ?'; params.push(from); }
    if (to) { sql += ' AND DATE(o.created_at) <= ?'; params.push(to); }
    
    sql += ' ORDER BY o.created_at DESC LIMIT 5000';

    const STATUS_VI = {
      DRAFT: 'Nháp', PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt',
      COMPLETED: 'Hoàn tất', CANCELLED: 'Đã huỷ', REJECTED: 'Bị từ chối',
    };

    const headers = ['Mã phiếu', 'Trạng thái', 'Người nhận', 'Phòng ban', 'Tổng SL', 'Ghi chú', 'Người tạo', 'Ngày tạo'];
    const filename = `phieu-xuat-kho-${new Date().toISOString().slice(0, 10)}.csv`;

    const queryStream = conn.connection.query(sql, params).stream();

    streamToCsv(res, filename, headers, queryStream, (r) => [
      r.order_code, STATUS_VI[r.status] || r.status, r.recipient_name, r.department,
      Number(r.total_qty || 0), r.note, r.created_by_name, r.created_at
    ]);

    res.on('finish', () => conn.release());
  } catch (e) {
    conn.release();
    next(e);
  }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const data = await getByIdUC.execute(db, { type: 'EXPORT', id });
    res.json({ success: true, message: 'OK', data });
  } catch (e) { next(e); }
});

// ── POST / ──────────────────────────────────────────────────────────────────
router.post('/', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try {
    dto = CreateExportOrderSchema.parse(req.body);
  } catch (e) {
    return next(e);
  }
  const { recipientName, department, note, items, warehouseId } = dto;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await createUC.execute(conn, {
      type: 'EXPORT',
      dto,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.status(201).json({ success: true, message: `Tạo phiếu xuất ${result.orderCode} thành công`, data: result });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── PUT /:id ─────────────────────────────────────────────────────────────────
router.put('/:id', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));

  let dto;
  try {
    dto = UpdateExportOrderSchema.parse(req.body);
  } catch (e) {
    return next(e);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await updateUC.execute(conn, {
      type: 'EXPORT',
      id,
      dto,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã cập nhật phiếu xuất' });

  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// ── Status Changes ──────────────────────────────────────────────────────────
router.post('/:id/submit', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await updateStatusUC.execute(conn, {
      type: 'EXPORT', id, status: 'PENDING',
      userId: req.session.userId, ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã gửi duyệt phiếu xuất' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/approve', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await updateStatusUC.execute(conn, {
      type: 'EXPORT', id, status: 'APPROVED',
      userId: req.session.userId, ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã duyệt phiếu xuất. Tồn kho đã được giữ chỗ.' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/reject', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await updateStatusUC.execute(conn, {
      type: 'EXPORT', id, status: 'REJECTED', reason,
      userId: req.session.userId, ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã từ chối phiếu xuất' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/cancel', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await updateStatusUC.execute(conn, {
      type: 'EXPORT', id, status: 'CANCELLED',
      userId: req.session.userId, ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã huỷ phiếu xuất' });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

router.post('/:id/complete', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const order = await repo.findExportById(conn, id);
    if (!order) throw new NotFoundError('Phiếu xuất', id);
    assertValidTransition('export_order', order.status, 'COMPLETED');

    const inputItems = req.body.items && Array.isArray(req.body.items) ? req.body.items : order.items;

    const result = await outboundUC.execute(conn, {
      orderId: order.id,
      orderCode: order.order_code,
      warehouseId: order.warehouse_id,
      items: inputItems.map(i => ({
        productId: i.productId || i.product_id,
        quantity: i.quantity,
        unitId: i.unitId || i.unit_id,
        lotId: i.lotId || i.lot_id || null,
      })),
      hasReservation: true,
      completedBy: req.session.userId,
      requisitionId: order.requisition_id,
    });

    await conn.commit();
    res.json({ success: true, message: `Xuất kho phiếu ${order.order_code} thành công`, data: result });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;