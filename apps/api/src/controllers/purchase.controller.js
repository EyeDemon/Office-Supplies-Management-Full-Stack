'use strict';
/**
 * purchase.controller.js — Interface Adapter cho luồng mua hàng.
 * Clean Architecture — Layer 3 (Interface Adapter)
 */
const router = require('express').Router();
const db = require('../shared/config/db');
const purchaseRepo = require('../infrastructure/repositories/PurchaseRepository');

const { requireLogin, requireManagerOrAdmin, requireWarehouseOrAdmin, getClientIp, parsePage: parseP }
  = require('../shared/middleware/authenticate');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { writeAuditLog } = require('../shared/utils/auditLogger');

// Repositories & Services
const stockRepo = require('../infrastructure/repositories/StockRepository');
const productRepo = require('../infrastructure/repositories/ProductRepository');
const stocktakingRepo = require('../infrastructure/repositories/StocktakingRepository');
const unitService = require('../domain/services/UnitService');

const {
  CreatePurchaseRequestSchema,
  RejectPurchaseRequestSchema,
  CreatePurchaseOrderSchema,
  BulkApproveSchema,
} = require('../shared/dto/purchase.dto');

const CreatePRUC = require('../use-cases/purchase/CreatePurchaseRequest');
const CreatePOUC = require('../use-cases/purchase/CreatePurchaseOrder');
const ApprovePOUC = require('../use-cases/purchase/ApprovePurchaseOrder');
const ProcessReceiveUC = require('../use-cases/purchase/ProcessPurchaseOrderReceive');
const ApprovePRUC = require('../use-cases/purchase/ApprovePurchaseRequest');
const RejectPRUC = require('../use-cases/purchase/RejectPurchaseRequest');
const CancelPRUC = require('../use-cases/purchase/CancelPurchaseRequest');
const CancelPOUC = require('../use-cases/purchase/CancelPurchaseOrder');
const BulkApprovePRUC = require('../use-cases/purchase/BulkApprovePurchaseRequests');
const BulkApprovePOUC = require('../use-cases/purchase/BulkApprovePurchaseOrders');
const GenerateAutoPR = require('../use-cases/purchase/GenerateAutoPR');
const AddPriceHistory = require('../use-cases/purchase/AddPriceHistory');
const ProcessInbound = require('../use-cases/inventory/ProcessInbound');

// Instantiate Use Cases with DI
const inboundUC = new ProcessInbound({
  stockRepository: stockRepo,
  stocktakingRepository: stocktakingRepo,
  unitService
});

const createPRUseCase = new CreatePRUC({ purchaseRepository: purchaseRepo });
const createPOUseCase = new CreatePOUC({ purchaseRepository: purchaseRepo });
const approvePOUseCase = new ApprovePOUC({ purchaseRepository: purchaseRepo });
const processReceiveUC = new ProcessReceiveUC({
  stockRepository: stockRepo,
  productRepository: productRepo,
  stocktakingRepository: stocktakingRepo,
  inboundUseCase: inboundUC,
  unitService
});

const approvePRUC = new ApprovePRUC({ purchaseRepository: purchaseRepo });
const bulkApprovePRUC = new BulkApprovePRUC({ approvePurchaseRequestUC: approvePRUC });
const bulkApprovePOUC = new BulkApprovePOUC({ approvePurchaseOrderUC: approvePOUseCase });
const rejectPRUC = new RejectPRUC({ purchaseRepository: purchaseRepo });
const cancelPRUC = new CancelPRUC({ purchaseRepository: purchaseRepo });
const cancelPOUC = new CancelPOUC({ purchaseRepository: purchaseRepo });
const generateAutoPRUC = new GenerateAutoPR({ purchaseRepository: purchaseRepo });
const addPriceHistoryUC = new AddPriceHistory({ productRepository: productRepo });

const { ValidationError, NotFoundError } = require('../domain/errors');

// ══════════════════════════════════════════════════════════════════
// READ ROUTES
// ══════════════════════════════════════════════════════════════════

router.get('/requests', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { page, size } = parseP(req.query);
  const { status, priority, dateFrom, dateTo, search } = req.query;
  try {
    const filter = buildWarehouseFilter(req, 'pr.warehouse_id', true);
    const result = await purchaseRepo.findAllPR({
      page, size, status, priority, dateFrom, dateTo, search, warehouseFilter: filter
    });
    res.json({ success: true, message: 'OK', data: result });
  } catch (e) { next(e); }
});

router.get('/requests/suggest', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  try {
    const rows = await purchaseRepo.getSuggestedPRItems();
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

router.get('/requests/:id', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pr = await purchaseRepo.findPRById(db, id);
    if (!pr) throw new NotFoundError('PurchaseRequest', id);
    const items = await purchaseRepo.findPRItems(db, id);
    res.json({ success: true, message: 'OK', data: { ...pr, items } });
  } catch (e) { next(e); }
});

router.get('/orders', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { page, size } = parseP(req.query);
  const { status, dateFrom, dateTo, search } = req.query;
  try {
    const filter = buildWarehouseFilter(req, 'po.warehouse_id', true);
    const result = await purchaseRepo.findAllPO({
      page, size, status, dateFrom, dateTo, search, warehouseFilter: filter
    });
    res.json({ success: true, message: 'OK', data: result });
  } catch (e) { next(e); }
});

router.get('/orders/export/csv', requireLogin, requireManagerOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { status, dateFrom, dateTo, search } = req.query;
  try {
    const filter = buildWarehouseFilter(req, 'po.warehouse_id', true);
    const rows = await purchaseRepo.getPOExportData({ status, dateFrom, dateTo, search, warehouseFilter: filter });

    const STATUS_VI = { DRAFT: 'Nháp', CONFIRMED: 'Đã xác nhận', RECEIVED: 'Đã nhập kho', CANCELLED: 'Đã hủy' };
    const esc = v => { if (v == null) return ''; const s = String(v); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s; };
    const fmtD = d => d ? new Date(d).toLocaleDateString('vi-VN') : '';

    let csv = '\uFEFFMã đơn,Trạng thái,NCC,Kho nhập,Tổng tiền,Người tạo,Ngày tạo,Người duyệt,Thủ kho,Ghi chú\n';
    rows.forEach(r => {
      csv += [
        esc(r.po_code), esc(STATUS_VI[r.status] || r.status), esc(r.supplier_name), esc(r.warehouse_name),
        r.total_amount, esc(r.created_by_name), fmtD(r.created_at), esc(r.approved_by_name), esc(r.received_by_name), esc(r.note)
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="don-mua-hang-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

router.get('/orders/:id', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const po = await purchaseRepo.findPOById(db, id);
    if (!po) throw new NotFoundError('PurchaseOrder', id);
    const items = await purchaseRepo.findPOItems(db, id);
    res.json({ success: true, message: 'OK', data: { ...po, items } });
  } catch (e) { next(e); }
});

router.get('/price-history', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const { page, size } = parseP(req.query);
  const { productId, supplierId, dateFrom, dateTo, search } = req.query;
  try {
    const result = await purchaseRepo.getPriceHistory({
      page, size, productId, supplierId, dateFrom, dateTo, search
    });
    res.json({ success: true, message: 'OK', data: result });
  } catch (e) { next(e); }
});

router.post('/price-history', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const { productId, supplierId, unitPrice, quantity, effectiveDate, note } = req.body;
  if (!productId || !unitPrice) throw new ValidationError('Thiếu thông tin bắt buộc');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await addPriceHistoryUC.execute(conn, {
      userId: req.session.userId,
      productId, supplierId, unitPrice, quantity, note,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.status(201).json({ success: true, message: 'Đã lưu lịch sử giá' });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// WRITE ROUTES (PR)
// ══════════════════════════════════════════════════════════════════

router.post('/requests', requireLogin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try { dto = CreatePurchaseRequestSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await createPRUseCase.execute(conn, {
      createdBy: req.session.userId,
      warehouseId: dto.warehouseId,
      supplierId: dto.supplierId,
      reason: dto.reason,
      note: dto.note,
      priority: dto.priority,
      items: dto.items.map(i => ({ productId: i.productId, quantity: i.quantity, estimatedPrice: 0, note: i.note })),
      ipAddress: getClientIp(req),
    });
    await conn.commit();
    res.status(201).json({ success: true, message: `Tạo đề nghị mua hàng ${result.prCode} thành công`, data: result });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/requests/:id/approve', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await approvePRUC.execute(conn, { prId: id, approvedBy: req.session.userId, ipAddress: getClientIp(req) });
    await conn.commit();
    res.json({ success: true, message: `Đã duyệt đề nghị mua hàng ${result.prCode}` });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/requests/:id/reject', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  let dto;
  try { dto = RejectPurchaseRequestSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await rejectPRUC.execute(conn, { prId: id, rejectedBy: req.session.userId, reason: dto.rejectionNote, ipAddress: getClientIp(req) });
    await conn.commit();
    res.json({ success: true, message: `Đã từ chối đề nghị mua hàng ${result.prCode}` });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/requests/:id/cancel', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await cancelPRUC.execute(conn, { prId: id, cancelledBy: req.session.userId, ipAddress: getClientIp(req) });
    await conn.commit();
    res.json({ success: true, message: `Đã huỷ đề nghị mua hàng ${result.prCode}` });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/requests/bulk-approve', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try { dto = BulkApproveSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await bulkApprovePRUC.execute(conn, {
      ids: dto.ids,
      approvedBy: req.session.userId,
      ipAddress: getClientIp(req),
    });
    await conn.commit();
    res.json({
      success: true,
      message: `Đã duyệt ${result.approved.length}/${dto.ids.length} PR`,
      data: result,
    });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// WRITE ROUTES (PO)
// ══════════════════════════════════════════════════════════════════

router.post('/orders', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try { dto = CreatePurchaseOrderSchema.parse(req.body); } catch (e) { return next(e); }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await createPOUseCase.execute(conn, {
      purchaseRequestId: dto.prId, supplierId: dto.supplierId, warehouseId: dto.warehouseId,
      createdBy: req.session.userId, note: dto.note, expectedDate: dto.expectedDate || null,
      items: dto.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice || 0, unitId: i.unitId })),
      ipAddress: getClientIp(req),
    });
    await conn.commit();
    res.status(201).json({ success: true, message: `Tạo PO ${result.poCode} thành công`, data: result });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/orders/:id/confirm', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await approvePOUseCase.execute(conn, { poId: id, confirmedBy: req.session.userId, ipAddress: getClientIp(req) });
    await conn.commit();
    res.json({ success: true, message: `Đã xác nhận đơn mua hàng ${result.poCode}` });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/orders/bulk-confirm', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try { dto = BulkApproveSchema.parse(req.body); } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await bulkApprovePOUC.execute(conn, {
      ids: dto.ids,
      approvedBy: req.session.userId,
      ipAddress: getClientIp(req),
    });
    await conn.commit();
    res.json({
      success: true,
      message: `Đã xác nhận ${result.approved.length}/${dto.ids.length} PO`,
      data: result,
    });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/orders/:id/receive', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await processReceiveUC.execute(conn, {
      poId: id, receivedBy: req.session.userId,
      receivedItems: Array.isArray(req.body.receivedItems) ? req.body.receivedItems : null,
      ipAddress: getClientIp(req),
    });
    await conn.commit();
    res.json({ success: true, message: `Nhận hàng PO ${result.poCode} thành công`, data: result });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/orders/:id/cancel', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await cancelPOUC.execute(conn, { poId: id, cancelledBy: req.session.userId, ipAddress: getClientIp(req) });
    await conn.commit();
    res.json({ success: true, message: `Đã huỷ PO ${result.poCode}` });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});


// ══════════════════════════════════════════════════════════════════
// AUTO-PR
// ══════════════════════════════════════════════════════════════════

router.get('/auto-pr/check', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  const readRepo = require('../infrastructure/repositories/PurchaseReadRepository');
  try {
    const rows = await readRepo.getAutoPRCheck(db);
    res.json({ success: true, data: { items: rows } });
  } catch (e) { next(e); }
});

router.post('/auto-pr/generate', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const { priority, note, productIds } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await generateAutoPRUC.execute(conn, {
      userId: req.session.userId,
      priority, note, productIds,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.status(201).json({ success: true, message: `Đã tạo PR tự động ${result.prCode}`, data: result });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

module.exports = router;
