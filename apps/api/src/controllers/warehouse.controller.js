'use strict';
/**
 * warehouse.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/WarehouseRepository');
const { requireLogin, requireAdmin, requireManagerOrAdmin, sanitizeLike, parsePage, getClientIp } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');

// ── Use-Cases ────────────────────────────────────────────────────
const ManageWarehouse = require('../use-cases/master-data/ManageWarehouse');
const manageWarehouseUC = new ManageWarehouse({ warehouseRepository: repo });
const multer = require('multer');
const xlsx   = require('xlsx');
const { CreateWarehouseSchema, UpdateWarehouseSchema } = require('../shared/dto/warehouse.dto');
const { ValidationError, NotFoundError } = require('../domain/errors');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });



function mapWarehouse(w) {
  return {
    id:          w.id,
    code:        w.code,
    name:        w.name,
    location:    w.location,
    description: w.description,
    isActive:    Boolean(w.is_active),
    createdByName: w.created_by_name || null,
    updatedByName: w.updated_by_name || null,
    createdAt:   w.created_at,
    updatedAt:   w.updated_at,
  };
}

// Removed local buildWarehouseFilter to use centralized version from rbac.js

router.get('/', requireLogin, attachUserWarehouses, async (req, res, next) => {
  const { page, size } = parsePage(req.query, { defaultSize: 50, maxSize: 200 });
  const search  = req.query.search ? `%${sanitizeLike(req.query.search.trim())}%` : null;
  const active  = req.query.active === 'true' ? true : req.query.active === 'false' ? false : null;
  
  try {
    const filter = buildWarehouseFilter(req, 'w.id');
    const { total, rows } = await repo.findWithFilters(db, {
      search, active, warehouseFilter: filter, size, offset: (page - 1) * size
    });
    
    res.json({
      success: true, message: 'OK', data: {
        items: rows.map(mapWarehouse),
        totalCount: total,
        totalPages: Math.ceil(total / size),
        page,
        size
      }
    });

  } catch (e) { next(e); }
});

router.get('/all', requireLogin, attachUserWarehouses, async (req, res, next) => {
  try {
    const filter = buildWarehouseFilter(req, 'id');
    const rows = await repo.findAllActive(db, filter);
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

router.get('/:id/stock', requireLogin, async (req, res, next) => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) return next(new ValidationError('ID không hợp lệ'));
  const { page, size } = parsePage(req.query, { defaultSize: 50, maxSize: 200 });
  const search    = req.query.search ? `%${sanitizeLike(req.query.search.trim())}%` : null;
  const catId     = parseInt(req.query.categoryId) || null;
  const lowStock  = req.query.lowStock === 'true';

  try {
    const wh = await repo.findById(db, warehouseId);
    if (!wh) throw new NotFoundError('Warehouse', warehouseId);

    const { total, rows } = await repo.getStockByWarehouse(db, warehouseId, {
      search, catId, lowStock, size, offset: (page - 1) * size
    });

    res.json({
      success: true, message: 'OK',
      data: {
        warehouseId, warehouseName: wh.name,
        items: rows.map(r => ({
          productId:     r.id, sku: r.sku, name: r.name, unit: r.unit, price: Number(r.price || 0),
          categoryName:  r.category_name || null,
          minStockQty:   r.min_stock_qty,
          warehouseQty:  r.warehouse_qty,
          totalQty:      r.total_qty,
          isLow:         r.warehouse_qty <= r.min_stock_qty,
          lastMovement:  r.last_movement || null,
        })),
        totalCount: total, totalPages: Math.ceil(total / size), page, size,
      },
    });
  } catch (e) { next(e); }
});

router.get('/:id', requireLogin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const w = await repo.findById(db, id);
    if (!w) throw new NotFoundError('Warehouse', id);
    res.json({ success: true, message: 'OK', data: mapWarehouse(w) });
  } catch (e) { next(e); }
});

router.post('/', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = CreateWarehouseSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    const result = await manageWarehouseUC.create(conn, {
      data: validation.data.body,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    
    await conn.commit();
    const created = await repo.findById(db, result.id);
    res.status(201).json({ 
      success: true, 
      message: `Tạo kho '${result.name}' thành công`, 
      data: mapWarehouse(created) 
    });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.put('/:id', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const validation = UpdateWarehouseSchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await manageWarehouseUC.update(conn, {
      id,
      data: validation.data.body,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    
    await conn.commit();
    const updated = await repo.findById(db, id);
    res.json({ success: true, message: 'Cập nhật kho thành công', data: mapWarehouse(updated) });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.post('/import', requireLogin, requireManagerOrAdmin, idempotencyCheck, upload.single('file'), async (req, res, next) => {
  if (!req.file) return next(new ValidationError('Vui lòng chọn file Excel/CSV'));
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
    if (rows.length === 0) return next(new ValidationError('File trống'));

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      let imported = 0; let skipped = 0;
      
      for (const r of rows) {
        let name = (r.name || r['Tên kho'] || r['ten_kho'] || '').toString().trim();
        let loc  = (r.location || r['Vị trí'] || r['vi_tri'] || '').toString().trim();
        let desc = (r.description || r['Ghi chú'] || r['ghi_chu'] || '').toString().trim();
        let active = r.is_active !== undefined ? r.is_active : (r['Trạng thái'] !== undefined ? r['Trạng thái'] : 1);
        const isActiveStr = String(active).toLowerCase();
        let isActive = (isActiveStr === '0' || isActiveStr === 'false' || isActiveStr === 'ngừng' || isActiveStr === 'không') ? 0 : 1;
        
        if (name) {
           const conflict = await repo.findByName(conn, name);
           if (!conflict) {
             const code = await repo.generateCode(conn);
             await repo.create(conn, {
               code, name, location: loc || null, description: desc || null, isActive, createdBy: req.session.userId
             });
             imported++;
           } else {
             skipped++;
           }
        }
      }
      await conn.commit();
      res.json({ success: true, message: `Import thành công ${imported} kho (Bỏ qua ${skipped} kho trùng tên)`, data: { imported, skipped } });
    } catch(err) {
      await conn.rollback();
      throw err;
    } finally { conn.release(); }
  } catch (e) { next(e); }
});

router.delete('/:id', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    await manageWarehouseUC.delete(conn, {
      id,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    
    await conn.commit();
    res.json({ success: true, message: 'Đã xóa kho thành công' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.patch('/:id/toggle', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    const result = await manageWarehouseUC.toggle(conn, {
      id,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    
    await conn.commit();
    res.json({ success: true, message: 'Thay đổi trạng thái kho thành công', data: result });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
