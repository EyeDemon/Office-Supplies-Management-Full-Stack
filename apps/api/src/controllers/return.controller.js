'use strict';
/**
 * return.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/ReturnRepository');
const ProcessReturn = require('../use-cases/inventory/ProcessReturn');
const stockRepo = require('../infrastructure/repositories/StockRepository');
const stocktakingRepo = require('../infrastructure/repositories/StocktakingRepository');

const processReturnUC = new ProcessReturn({ 
  stockRepository: stockRepo, 
  returnRepository: repo,
  stocktakingRepository: stocktakingRepo
});
const { requireLogin, requireWarehouseOrAdmin, getClientIp } = require('../shared/middleware/authenticate');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { CreateReturnSchema, UpdateReturnSchema } = require('../shared/dto/return.dto');

const { ValidationError, NotFoundError } = require('../domain/errors');

router.get('/', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, Math.max(5, parseInt(req.query.limit) || 20));
  const off    = (page - 1) * limit;
  const status = req.query.status || null;
  const type   = req.query.type   || null;
  const search = req.query.search ? `%${req.query.search}%` : null;

  try {
    const whFilter = buildWarehouseFilter(req, 'r.warehouse_id', true);
    const { total, rows } = await repo.getReturns(db, {
      status, type, search, limit, offset: off,
      whClause: whFilter.clause, whParams: whFilter.params
    });
    res.json({ success: true, message: 'OK', data: {
      items: rows, total, page, limit, totalPages: Math.ceil(total / limit),
    }});
  } catch (e) { next(e); }
});

router.get('/export/csv', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const status = req.query.status || null;
  const type   = req.query.type   || null;
  try {
    const whFilter = buildWarehouseFilter(req, 'r.warehouse_id', true);
    const rows = await repo.getReturnsForExport(db, {
      status, type, whClause: whFilter.clause, whParams: whFilter.params
    });

    const TYPE_VI   = { EMPLOYEE_RETURN:'NV trả về kho', SUPPLIER_RETURN:'Trả hàng NCC' };
    const STATUS_VI = { DRAFT:'Bản nháp', COMPLETED:'Hoàn tất', CANCELLED:'Đã huỷ' };
    const header = 'Mã phiếu,Loại trả,Trạng thái,Người trả/NCC,Phòng ban,Lý do,Tổng SL,Người tạo,Ngày tạo,Người hoàn tất,Ngày hoàn tất';
    const csv = [header, ...rows.map(r =>
      [r.return_code, TYPE_VI[r.return_type]||r.return_type, STATUS_VI[r.status]||r.status,
       r.returner_name||r.supplier_name||'', r.department||'', r.reason||'',
       r.total_qty, r.created_by||'',
       r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : '',
       r.completed_by||'', r.completed_at ? new Date(r.completed_at).toLocaleDateString('vi-VN') : '']
      .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
      .join(',')
    )].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tra_hang.csv"');
    res.send('\uFEFF' + csv);
  } catch (e) {
    console.error('[returns/export]', e.message);
    return next(e);
  }
});

router.get('/:id', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const data = await repo.getReturnById(db, id);
    if (!data) throw new NotFoundError('ReturnOrder', id);
    res.json({ success: true, message: 'OK', data });
  } catch (e) { next(e); }
});

router.post('/', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = CreateReturnSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));

  const data = validation.data.body;
  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const code = await repo.genCode(conn);
    
    const rtnId = await repo.create(conn, {
      code, returnType: data.returnType, returnerName: data.returnerName,
      department: data.department, supplierId: data.supplierId,
      warehouseId: data.warehouseId, reason: data.reason, note: data.note,
      totalQty, createdBy: req.session.userId
    });

    await repo.insertItems(conn, rtnId, data.items);

    await writeAuditLog(conn, {
      entityType: 'return_order', entityId: rtnId, action: 'CREATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { return_code: code, return_type: data.returnType, status: 'DRAFT', total_qty: totalQty },
    });
    
    await conn.commit();
    res.status(201).json({ success: true, message: `Tạo phiếu trả hàng ${code} thành công`, data: { id: rtnId, code } });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.put('/:id', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));

  const validation = UpdateReturnSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));

  const data = validation.data.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const rtn = await repo.getReturnForUpdate(conn, id);
    if (!rtn) throw new NotFoundError('ReturnOrder', id);
    if (rtn.status !== 'DRAFT') throw new ValidationError('Chỉ có thể sửa phiếu ở trạng thái DRAFT');

    const totalQty = data.items ? data.items.reduce((s, i) => s + i.quantity, 0) : undefined;
    
    const beforeData = {
      returner_name: rtn.returner_name, department: rtn.department,
      supplier_id: rtn.supplier_id, reason: rtn.reason, note: rtn.note, total_qty: rtn.total_qty
    };

    await repo.update(conn, id, { ...data, totalQty });

    if (data.items && data.items.length > 0) {
      await repo.clearItems(conn, id);
      await repo.insertItems(conn, id, data.items);
    }

    await writeAuditLog(conn, {
      entityType: 'return_order', entityId: id, action: 'UPDATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData,
      afterData: {
        returner_name: data.returnerName || rtn.returner_name,
        department: data.department || rtn.department,
        supplier_id: data.supplierId || rtn.supplier_id,
        reason: data.reason || rtn.reason,
        note: data.note || rtn.note,
        total_qty: totalQty ?? rtn.total_qty
      }
    });

    await conn.commit();
    res.json({ success: true, message: 'Đã cập nhật phiếu trả hàng' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.post('/:id/complete', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    const { rtn, isSupplierReturn } = await processReturnUC.execute(conn, id, req.session.userId, getClientIp(req));
    
    await conn.commit();
    const action = isSupplierReturn ? 'Đã trả hàng về NCC — trừ tồn kho' : 'Đã nhận hàng trả từ NV — cộng tồn kho';
    res.json({ success: true, message: `${action} (${rtn.return_code})` });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.delete('/:id/cancel', requireLogin, requireWarehouseOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const rtn = await repo.getReturnForUpdate(conn, id);
    if (!rtn) throw new NotFoundError('ReturnOrder', id);
    if (['COMPLETED','CANCELLED'].includes(rtn.status)) {
       throw new ValidationError('Không thể huỷ phiếu đã hoàn tất hoặc đã huỷ');
    }

    await repo.cancel(conn, id, req.session.userId);

    await writeAuditLog(conn, {
      entityType: 'return_order', entityId: id, action: 'CANCEL',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { status: rtn.status }, afterData: { status: 'CANCELLED' },
    });

    await conn.commit();
    res.json({ success: true, message: 'Đã huỷ phiếu trả hàng' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
