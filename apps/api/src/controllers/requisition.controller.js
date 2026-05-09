'use strict';
/**
 * requisition.controller.js — Interface Adapter cho Phiếu yêu cầu cấp phát.
 *
 * Clean Architecture — Layer 3 (Interface Adapter):
 *   - ✅ KHÔNG chứa raw SQL. ✅ KHÔNG import db ngoài getConnection.
 *   - Mọi DB reads/writes qua RequisitionRepository (Layer 4).
 *   - Luồng warehouse-confirm đi qua WarehouseConfirmRequisitionUseCase (Layer 2).
 *
 * Mounting:
 *   app.use('/api/requisitions', requisitionController);  // POST/write — TRƯỚC fat route
 *   app.use('/api/requisitions', reqRoutes);              // GET listing — fat route
 */

const router = require('express').Router();
const db = require('../shared/config/db');

// ── Repositories ──────────────────────────────────────────────────
const reqRepo = require('../infrastructure/repositories/RequisitionRepository');
const userRepo = require('../infrastructure/repositories/UserRepository');
const stockRepo = require('../infrastructure/repositories/StockRepository');
const orderRepo = require('../infrastructure/repositories/OrderRepository');
const productRepo = require('../infrastructure/repositories/ProductRepository');
const quotaRepo = require('../infrastructure/repositories/QuotaRepository');



// ── Use-Cases ─────────────────────────────────────────────────────
const CreateRequisition = require('../use-cases/requisition/CreateRequisition');
const ApproveRequisition = require('../use-cases/requisition/ApproveRequisition');
const CancelRequisition = require('../use-cases/requisition/CancelRequisition');
const UpdateRequisition = require('../use-cases/requisition/UpdateRequisition');
const WarehouseConfirmRequisition = require('../use-cases/requisition/WarehouseConfirmRequisition');

const createRequisitionUC = new CreateRequisition({
  requisitionRepository: reqRepo,
  userRepository: userRepo,
  quotaRepository: quotaRepo,
  productRepository: productRepo
});

const approveRequisitionUC = new ApproveRequisition({
  requisitionRepository: reqRepo,
  orderRepository: orderRepo,
  userRepository: userRepo,
  stockRepository: stockRepo,
  quotaRepository: quotaRepo,
  productRepository: productRepo
});


const cancelRequisitionUC = new CancelRequisition({
  requisitionRepository: reqRepo,
  stockRepository: stockRepo
});

const warehouseConfirmUC = new WarehouseConfirmRequisition({
  stockRepository: stockRepo,
  requisitionRepository: reqRepo,
  orderRepository: orderRepo
});

const updateRequisitionUC = new UpdateRequisition({
  requisitionRepository: reqRepo
});

const BulkApproveRequisitions = require('../use-cases/requisition/BulkApproveRequisitions');
const bulkApproveUC = new BulkApproveRequisitions({ approveRequisitionUC });

// ── Middleware ────────────────────────────────────────────────────
const { requireLogin, requireManagerOrAdmin, requireWarehouseOrAdmin, getClientIp, parsePage: parseP }
  = require('../shared/middleware/authenticate');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { writeAuditLog } = require('../shared/utils/auditLogger');

// ── DTOs (Zod) ────────────────────────────────────────────────────
const {
  CreateRequisitionSchema,
  ApproveRequisitionSchema,
  RejectRequisitionSchema,
  WarehouseConfirmSchema,
} = require('../shared/dto/requisition.dto');

const { assertValidTransition } = require('../domain/rules');
const { emit: emitEvent } = require('../shared/infrastructure/EventBus');
const { ValidationError, NotFoundError, UnauthorizedError } = require('../domain/errors');

function mapReq(r) {
  return {
    id: r.id, reqCode: r.req_code, status: r.status, note: r.note || null,
    rejectReason: r.reject_reason || null, requesterId: r.requester_id,
    requesterName: r.requester_name || r.requester_username || null,
    approvedByName: r.approved_by_name || null, rejectedByName: r.rejected_by_name || null,
    warehouseConfirmedByName: r.warehouse_confirmed_by_name || null,
    cancelledByName: r.cancelled_by_name || null,
    itemCount: Number(r.item_count || 0),
    totalQtyRequested: Number(r.total_qty_requested || 0),
    totalQtyApproved: Number(r.total_qty_approved || 0),
    approvedAt: r.approved_at || null, rejectedAt: r.rejected_at || null,
    cancelledAt: r.cancelled_at || null, warehouseConfirmedAt: r.warehouse_confirmed_at || null,
    createdAt: r.created_at, updatedAt: r.updated_at,
    warehouseName: r.warehouse_name || null,
  };
}

// ══════════════════════════════════════════════════════════════════
// GET /api/requisitions — Danh sách phân trang
// ══════════════════════════════════════════════════════════════════
router.get('/', requireLogin, attachUserWarehouses, async (req, res, next) => {
  const { page, size } = parseP(req.query);
  const { status, dateFrom, dateTo, requesterId, search, departmentId } = req.query;
  const { userId, role } = req.session;

  try {
    const canSeeAll = ['ADMIN', 'MANAGER', 'WAREHOUSE'].includes(role);
    let filter;
    if (!canSeeAll) {
      filter = { clause: 'r.requester_id = ?', params: [userId] };
    } else {
      filter = buildWarehouseFilter(req, 'r.warehouse_id', true);
    }

    const result = await reqRepo.findAll({
      page, size, status, requesterId: !canSeeAll ? userId : requesterId,
      warehouseFilter: filter, dateFrom, dateTo, search,
      departmentId: departmentId ? parseInt(departmentId, 10) : null
    });

    res.json({
      success: true, message: 'OK',
      data: {
        items: result.items.map(mapReq),
        totalCount: result.totalCount,
        totalPages: result.totalPages,
        page, size
      }
    });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/requisitions/export — Xuất CSV
// ══════════════════════════════════════════════════════════════════
router.get('/export', requireLogin, requireManagerOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { status, dateFrom, dateTo, search } = req.query;
  try {
    const filter = buildWarehouseFilter(req, 'r.warehouse_id', true);
    const result = await reqRepo.findAll({
      status, dateFrom, dateTo, search, warehouseFilter: filter,
      page: 0, size: 5000 // Limit for export
    });

    const STATUS_VI = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', WAREHOUSE_CONFIRMED: 'Đã xuất kho', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' };
    const esc = v => { if (v == null) return ''; const s = String(v); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s; };
    const fmtD = d => d ? new Date(d).toLocaleDateString('vi-VN') : '';

    let csv = '\uFEFFMã phiếu,Trạng thái,Người yêu cầu,Ngày tạo,Số mặt hàng,Tổng SL yêu cầu,Người duyệt,Ngày duyệt,Thủ kho,Ngày xuất,Ghi chú\n';
    result.items.forEach(r => {
      csv += [
        esc(r.req_code), esc(STATUS_VI[r.status] || r.status), esc(r.requester_name), fmtD(r.created_at),
        r.item_count, Number(r.total_qty_requested || 0), esc(r.approved_by_name), fmtD(r.approved_at),
        esc(r.warehouse_confirmed_by_name), fmtD(r.warehouse_confirmed_at), esc(r.note)
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="phieu-yeu-cau-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/requisitions/:id — Chi tiết phiếu
// ══════════════════════════════════════════════════════════════════
router.get('/:id', requireLogin, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return next(new ValidationError('ID không hợp lệ'));

  try {
    const conn = await db.getConnection();
    try {
      const r = await reqRepo.findById(conn, id);
      if (!r) throw new NotFoundError('Phiếu yêu cầu', id);

      // Permission check (H4)
      const { userId, role } = req.session;
      if (!['ADMIN', 'MANAGER'].includes(role) && r.requester_id !== userId) {
        if (role === 'WAREHOUSE' && r.warehouse_id) {
          const [wRows] = await conn.query('SELECT 1 FROM user_warehouses WHERE user_id=? AND warehouse_id=?', [userId, r.warehouse_id]);
          if (wRows.length === 0) throw new UnauthorizedError('Không có quyền xem phiếu này');
        } else {
          throw new UnauthorizedError('Không có quyền xem phiếu này');
        }
      }

      const items = await reqRepo.findItems(conn, id);
      res.json({
        success: true, message: 'OK',
        data: {
          ...mapReq(r),
          items: items.map(i => ({
            id: i.id, productId: i.product_id, productName: i.product_name,
            sku: i.sku, unit: i.unit, currentStock: i.current_stock,
            quantityRequested: i.quantity_requested, quantityApproved: i.quantity_approved,
            note: i.note || null,
          })),
        }
      });
    } finally { conn.release(); }
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/requisitions — Tạo phiếu yêu cầu cấp phát
// ══════════════════════════════════════════════════════════════════
router.post('/', requireLogin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try { dto = CreateRequisitionSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 10);

    // Note: Requisition không có trạng thái DRAFT — được tạo thẳng ở PENDING.
    // Không cần assertValidTransition ở đây; CreateRequisitionUC tự đặt status=PENDING.
    const result = await createRequisitionUC.execute(conn, {
      requesterId: req.session.userId,
      warehouseId: dto.warehouseId,
      note: dto.note,
      items: dto.items.map(i => ({ productId: i.productId, quantity: i.quantityRequested, note: i.note })),
      ipAddress: getClientIp(req),
    });
    await conn.commit();
    res.status(201).json({ success: true, message: `Tạo phiếu yêu cầu ${result.reqCode} thành công`, data: result });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/requisitions/:id/approve — Manager duyệt phiếu
// ══════════════════════════════════════════════════════════════════
router.post('/:id/approve', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  let dto = {};
  try { dto = ApproveRequisitionSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await db.beginTransactionWithTimeout(conn, 15);

    const req_ = await reqRepo.findById(conn, id, true);
    if (!req_) throw new NotFoundError('Phiếu yêu cầu', id);
    assertValidTransition('requisition', req_.status, 'APPROVED');

    const { warnings } = await approveRequisitionUC.execute(conn, {
      requisitionId: id,
      approvedBy: req.session.userId,
      approvedItems: req.body.approvedItems || null,
      ipAddress: getClientIp(req),
    });
    await conn.commit();

    Promise.all([reqRepo.findMeta(id), userRepo.findNameById(req.session.userId)])
      .then(([meta, name]) => meta && emitEvent('REQUISITION_STATUS_CHANGED', {
        requisitionId: id,
        reqCode: meta.req_code,
        requesterId: meta.requester_id,
        status: 'APPROVED',
        actorName: name
      }))
      .catch(() => { });

    res.json({
      success: true,
      message: 'Duyệt phiếu yêu cầu thành công' + (warnings.length ? ` (${warnings.length} cảnh báo tồn kho)` : ''),
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/requisitions/:id/reject — Manager từ chối phiếu
// ══════════════════════════════════════════════════════════════════
router.post('/:id/reject', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return next(new ValidationError('ID không hợp lệ'));
  let dto;
  try { dto = RejectRequisitionSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const req_ = await reqRepo.findById(conn, id, true);
    if (!req_) throw new NotFoundError('Phiếu yêu cầu', id);
    assertValidTransition('requisition', req_.status, 'REJECTED');

    await reqRepo.rejectById(conn, id, req.session.userId, dto.rejectionNote);
    await writeAuditLog(conn, {
      entityType: 'requisition', entityId: id, action: 'REJECT',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { status: 'PENDING' }, afterData: { status: 'REJECTED', reason: dto.rejectionNote },
    });
    await conn.commit();

    Promise.all([reqRepo.findMeta(id), userRepo.findNameById(req.session.userId)])
      .then(([meta, name]) => meta && emitEvent('REQUISITION_STATUS_CHANGED', {
        requisitionId: id,
        reqCode: meta.req_code,
        requesterId: meta.requester_id,
        status: 'REJECTED',
        actorName: name
      }))
      .catch(() => { });

    res.json({ success: true, message: 'Đã từ chối phiếu yêu cầu' });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/requisitions/:id/cancel — Huỷ phiếu
// ══════════════════════════════════════════════════════════════════
router.post('/:id/cancel', requireLogin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return next(new ValidationError('ID không hợp lệ'));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await cancelRequisitionUC.execute(conn, {
      requisitionId: id, cancelledBy: req.session.userId,
      userRole: req.session.role, reason: req.body.reason || null,
      ipAddress: getClientIp(req),
    });
    await conn.commit();
    res.json({
      success: true,
      message: `Đã huỷ phiếu ${result.reqCode}` + (result.stockReleased ? ' và giải phóng tồn kho đã giữ chỗ' : ''),
    });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/requisitions/:id/warehouse-confirm — Kho xác nhận xuất hàng
// ══════════════════════════════════════════════════════════════════
router.post('/:id/warehouse-confirm', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return next(new ValidationError('ID không hợp lệ'));
  let dto = {};
  try { dto = WarehouseConfirmSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const result = await warehouseConfirmUC.execute(conn, {
      requisitionId: id,
      confirmedBy: req.session.userId,
      ipAddress: getClientIp(req),
      confirmedItems: dto.confirmedItems || [],
    });

    await conn.commit();

    Promise.all([reqRepo.findMeta(id), userRepo.findNameById(req.session.userId)])
      .then(([meta, name]) => meta && emitEvent('REQUISITION_STATUS_CHANGED', {
        requisitionId: id,
        reqCode: meta.req_code,
        requesterId: meta.requester_id,
        status: 'WAREHOUSE_CONFIRMED',
        actorName: name
      }))
      .catch(() => { });

    res.json({
      success: true,
      message: `Xác nhận xuất kho thành công. Đã cấp ${result.dispensedCount} sản phẩm.`,
      data: result
    });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/requisitions/:id — Sửa và gửi lại phiếu (khi bị REJECTED)
// ══════════════════════════════════════════════════════════════════
router.put('/:id', requireLogin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return next(new ValidationError('ID không hợp lệ'));

  let dto;
  try { dto = CreateRequisitionSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await updateRequisitionUC.execute(conn, {
      id,
      userId: req.session.userId,
      dto,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã cập nhật và gửi lại yêu cầu cấp phát' });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// BUG FIX: Add missing bulk actions
router.post('/bulk-approve', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return next(new ValidationError('Danh sách ID không hợp lệ'));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await bulkApproveUC.execute(conn, {
      ids,
      approvedBy: req.session.userId,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: `Đã xử lý ${result.processedCount}/${ids.length} phiếu yêu cầu`, data: result });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/bulk-reject', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const { ids, reason } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return next(new ValidationError('Danh sách ID không hợp lệ'));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let rejectedCount = 0;
    for (const id of ids) {
      const r = await reqRepo.findById(conn, id, true);
      if (r && r.status === 'PENDING') {
        await reqRepo.rejectById(conn, id, req.session.userId, reason || 'Từ chối hàng loạt');
        rejectedCount++;
      }
    }
    await conn.commit();
    res.json({ success: true, message: `Đã từ chối ${rejectedCount}/${ids.length} phiếu yêu cầu` });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

module.exports = router;
