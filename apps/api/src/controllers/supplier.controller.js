'use strict';
/**
 * supplier.controller.js — Clean Architecture Layer 1
 */
const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/SupplierRepository');
const useCase = require('../use-cases/master-data/ManageSupplier');
const multer = require('multer');
const XLSX   = require('xlsx');
const { requireLogin, requireManagerOrAdmin, requireAdmin, sanitizeLike, parsePage, getClientIp } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { CreateSupplierSchema, UpdateSupplierSchema } = require('../shared/dto/supplier.dto');
const { ValidationError, ConflictError, NotFoundError, ImportValidationError } = require('../domain/errors');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new ValidationError('Chỉ chấp nhận file .xlsx, .xls, .csv'), ok);
  },
});

function mapSupplier(s) {
  return {
    id:           s.id,
    code:         s.code,
    name:         s.name,
    contactName:  s.contact_name || null,
    phone:        s.phone        || null,
    email:        s.email        || null,
    address:      s.address      || null,
    taxCode:      s.tax_code     || null,
    note:         s.note         || null,
    active:       Boolean(s.active),
    totalOrders:  Number(s.total_orders  || 0),
    totalAmount:  Number(s.total_amount  || 0),
    lastOrderAt:  s.last_order_at || null,
    createdAt:    s.created_at,
  };
}

router.get('/', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  const { page, size } = parsePage(req.query, { defaultSize: 50, maxSize: 200 });
  const search = req.query.search;
  const activeOnly = req.query.active !== 'false';
  try {
    const s = search?.trim() ? `%${sanitizeLike(search.trim())}%` : null;
    const { total, rows } = await repo.findWithFilters(db, { search: s, activeOnly, size, offset: (page - 1) * size });
    res.json({
      success: true, message: 'OK', data: {
        items: rows.map(mapSupplier), totalCount: total, totalPages: Math.ceil(total / size), page, size,
      }
    });
  } catch (e) { next(e); }
});

router.get('/all', requireLogin, async (req, res, next) => {
  try {
    const rows = await repo.findAllActive(db);
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

router.get('/export', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  const search     = req.query.search;
  const activeOnly = req.query.active !== 'false';
  try {
    const s = search?.trim() ? `%${sanitizeLike(search.trim())}%` : null;
    const rows = await repo.findForExport(db, { search: s, activeOnly });
    
    const esc = (v) => {
      if (v == null) return '';
      const str = String(v);
      return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const fmtD = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '';
    const fmtC = (n) => Number(n || 0).toLocaleString('vi-VN');

    const headers = ['Mã NCC','Tên nhà cung cấp','Người liên hệ','Điện thoại','Email','Địa chỉ','Mã số thuế','Ghi chú','Trạng thái','Đơn hàng đã xác nhận','Tổng giá trị (đ)','Đơn hàng cuối','Ngày tạo'];
    const csvRows = rows.map(r => [
      esc(r.code), esc(r.name), esc(r.contact_name), esc(r.phone), esc(r.email), esc(r.address), esc(r.tax_code), esc(r.note),
      r.active ? 'Hoạt động' : 'Ngừng HĐ', Number(r.total_orders), fmtC(r.total_amount), fmtD(r.last_order_at), fmtD(r.created_at),
    ].join(','));

    const date = new Date().toISOString().slice(0, 10);
    const csv  = '\uFEFF' + [headers.join(','), ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nha-cung-cap-${date}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

router.get('/import-template', requireLogin, requireManagerOrAdmin, (_req, res) => {
  const headers = ['Tên nhà cung cấp (*)','Người liên hệ','Số điện thoại','Email','Địa chỉ','Mã số thuế','Ghi chú'];
  const sample = ['Công ty TNHH Văn phòng phẩm A','Nguyễn Văn A','0912345678','contact@vpp-a.com','123 Lê Lợi, Q.1, TP.HCM','0301234567','Nhà cung cấp chính'];
  const csv = '\uFEFF' + [headers, sample].map(r => r.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-nha-cung-cap.csv"');
  res.send(csv);
});

router.post('/import', requireLogin, requireManagerOrAdmin, idempotencyCheck, (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return next(err);
  next();
}), async (req, res, next) => {
  if (!req.file) return next(new ValidationError('Vui lòng chọn file Excel/CSV để import'));

  let workbook;
  try { workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true }); }
  catch { return next(new ValidationError('Không thể đọc file — đảm bảo file là .xlsx/.xls/.csv hợp lệ')); }
  
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  if (rows.length === 0) return next(new ValidationError('File không có dữ liệu (hoặc thiếu header)'));
  if (rows.length > 500) return next(new ValidationError('File quá lớn — tối đa 500 dòng mỗi lần import'));

  const nk = (k) => k.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_');
  const normRows = rows.map(r => {
    const nr = {};
    for (const k of Object.keys(r)) nr[nk(k)] = String(r[k] ?? '').trim();
    return nr;
  });

  const errors = []; const valid = [];
  for (let i = 0; i < normRows.length; i++) {
    const r = normRows[i]; const lineNo = i + 2; const rowErr = [];
    const name = r.tn_nh_cung_cp || r.ten_nha_cung_cap || r.name || r.tn_nh_cung_cp_ || '';
    if (!name) rowErr.push('Thiếu tên nhà cung cấp');
    else if (name.length < 2) rowErr.push('Tên phải có ít nhất 2 ký tự');
    else if (name.length > 200) rowErr.push('Tên quá dài (tối đa 200 ký tự)');

    const phone = r.s_in_thoi || r.phone || r.phone_number || r.sdt || '';
    if (phone && !/^(0|\+84)[0-9]{8,10}$/.test(phone.replace(/\s/g, ''))) rowErr.push('Số điện thoại không hợp lệ');

    const email = r.email || '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErr.push('Email không đúng định dạng');

    if (rowErr.length > 0) errors.push({ row: lineNo, name: name || '(trống)', errors: rowErr });
    else valid.push({
      name: name.trim(), contactName: (r.ngi_lin_h || r.contact_name || r.contact || '').trim() || null,
      phone: phone.replace(/\s/g,'') || null, email: email.toLowerCase() || null,
      address: (r.a_ch || r.address || '').trim() || null, taxCode: (r.m_s_thu || r.tax_code || r.tax || '').trim() || null,
      note: (r.ghi_ch || r.note || '').trim() || null,
    });
  }

  if (errors.length > 0) {
    throw new ImportValidationError(`Có ${errors.length} dòng lỗi — không import. Vui lòng sửa và thử lại.`, {
      errors, totalRows: normRows.length, errorCount: errors.length
    });
  }

  const conn = await db.getConnection();
  let imported = 0;
  try {
    await conn.beginTransaction();
    const baseCount = await repo.getBaseCount(conn);
    for (let i = 0; i < valid.length; i++) {
      const v = valid[i];
      let code; let attempt = 0;
      while (true) {
        const seq = baseCount + imported + i + 1 + attempt;
        const tryCode = `NCC-${String(seq).padStart(3, '0')}`;
        const ex = await repo.checkCodeExists(conn, tryCode);
        if (!ex) { code = tryCode; break; }
        attempt++;
      }
      await repo.create(conn, { ...v, code });
      imported++;
    }
    
    await repo.insertImportLog(conn, {
      fileName: req.file.originalname, totalRows: normRows.length, imported, skipped: 0, errorCount: 0, createdBy: req.session.userId || null
    });
    
    await conn.commit();
    res.status(201).json({ success: true, message: `Import thành công ${imported} nhà cung cấp`, data: { imported, totalRows: normRows.length } });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.post('/', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = CreateSupplierSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    let code = await repo.generateCode(conn);
    const existing = await repo.checkCodeExists(conn, code);
    if (existing) code = `NCC-${Date.now().toString().slice(-6)}`;

    const newId = await useCase.createSupplier(conn, { ...validation.data.body, code }, req.session.userId);
    
    await writeAuditLog(conn, {
      entityType: 'supplier', entityId: newId, action: 'CREATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      afterData: { code, name: validation.data.body.name, phone: validation.data.body.phone },
    });
    
    await conn.commit();
    const created = await repo.findById(db, newId);
    res.status(201).json({ success: true, message: 'Thêm nhà cung cấp thành công', data: mapSupplier(created) });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.put('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const validation = UpdateSupplierSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { before, after } = await useCase.updateSupplier(conn, id, validation.data.body, req.session.userId);
    
    await writeAuditLog(conn, {
      entityType: 'supplier', entityId: id, action: 'UPDATE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { name: before.name, phone: before.phone, email: before.email, active: before.active },
      afterData:  { name: after.name, phone: after.phone, email: after.email, active: after.active },
    });
    
    await conn.commit();
    const updated = await repo.findById(db, id);
    res.json({ success: true, message: 'Cập nhật thành công', data: mapSupplier(updated) });
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
    
    const ioCount = await repo.checkPendingImportOrders(conn, id);
    if (ioCount > 0) {
      await conn.rollback();
      return next(new ConflictError(`Không thể xóa — còn ${ioCount} phiếu nhập chưa hoàn tất.`));
    }

    const poCount = await repo.checkPendingPurchaseOrders(conn, id);
    if (poCount > 0) {
      await conn.rollback();
      return next(new ConflictError(`Không thể xóa — còn ${poCount} đơn mua hàng chưa hoàn tất.`));
    }

    const existing = await useCase.deleteSupplier(conn, id, req.session.userId);
    
    await writeAuditLog(conn, {
      entityType: 'supplier', entityId: id, action: 'DELETE',
      changedBy: req.session.userId, ipAddress: getClientIp(req),
      beforeData: { name: existing.name, code: existing.code, deleted: false },
      afterData:  { deleted: true },
    });
    await conn.commit();
    res.json({ success: true, message: 'Đã xóa nhà cung cấp' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.get('/:id', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const s = await repo.findById(db, id);
    if (!s) throw new NotFoundError('Supplier', id);
    res.json({ success: true, message: 'OK', data: mapSupplier(s) });
  } catch (e) { next(e); }
});

module.exports = router;
