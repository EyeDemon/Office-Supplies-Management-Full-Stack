'use strict';
/**
 * product.controller.js — HTTP Adapter cho Product CRUD.
 *
 * Clean Architecture — Layer 1 (Interface Adapter):
 *   - Parse req → validate DTO → gọi Repository → format res.
 *   - KHÔNG chứa business logic. KHÔNG gọi db trực tiếp.
 *
 * Mounting strategy (server.js):
 *   app.use('/api/products', productController);   // ← TRƯỚC fat route
 *   app.use('/api/products', productRoutes);        // ← GET listing falls through
 *
 * Endpoints handled here (POST/PUT/DELETE write operations):
 *   POST   /api/products          → createProduct
 *   PUT    /api/products/:id      → updateProduct
 *   DELETE /api/products/:id      → deleteProduct
 */

const router = require('express').Router();
const db     = require('../shared/config/db');

// ── Middleware ─────────────────────────────────────────────────────
const {
  requireLogin,
  requireAdmin,
  requireManagerOrAdmin,
  getClientIp,
  parsePage: parseP,
} = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const multer = require('multer');
const XLSX   = require('xlsx');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── DTOs (Zod) ────────────────────────────────────────────────────
const {
  CreateProductSchema,
  UpdateProductSchema,
} = require('../shared/dto/product.dto');

// ── Repository ───────────────────────────────────────────────────
const ProductRepository = require('../infrastructure/repositories/ProductRepository');
const productRepo = ProductRepository; // singleton instance

// ── Use-Cases ────────────────────────────────────────────────────
const ManageProduct = require('../use-cases/master-data/ManageProduct');
const ImportProducts = require('../use-cases/master-data/ImportProducts');
const RestoreProduct = require('../use-cases/master-data/RestoreProduct');

const manageProductUC = new ManageProduct({ productRepository: productRepo });
const importProductUC = new ImportProducts({ productRepository: productRepo });
const restoreProductUC = new RestoreProduct({ productRepository: productRepo });

// Adjustment Use-Case
const ProcessAdjustment = require('../use-cases/inventory/ProcessAdjustment');
const StockRepository = require('../infrastructure/repositories/StockRepository');
const adjustmentUC = new ProcessAdjustment({
  stockRepository: StockRepository,
  adjustmentRepository: require('../infrastructure/repositories/AdjustmentRepository'),
  stocktakingRepository: require('../infrastructure/repositories/StocktakingRepository')
});

// ── Audit ─────────────────────────────────────────────────────────
const { writeAuditLog } = require('../shared/utils/auditLogger');
const { ValidationError, NotFoundError } = require('../domain/errors');

// ── Error response helper ──────────────────────────────────────────


function mapProd(p) {
  const stockQty      = Number(p.stock_qty || 0);
  const reservedQty   = Number(p.reserved_quantity || 0);
  return {
    id: p.id, sku: p.sku, name: p.name, barcode: p.barcode || null,
    categoryId: p.category_id, categoryName: p.category_name,
    unit: p.unit, baseUnitId: p.base_unit_id || null, baseUnitName: p.base_unit_name || null,
    price: Number(p.price||0), avgUnitPrice: Number(p.avg_unit_price || 0),
    stockQty, reservedQty, availableQty: Math.max(0, stockQty - reservedQty),
    minStockQty: p.min_stock_qty, reorderPoint: p.reorder_point ?? null,
    active: Boolean(p.active !== undefined ? p.active : 1),
    lowStock: Boolean(p.low_stock), description: p.description,
    createdAt: p.created_at, updatedAt: p.updated_at,
  };
}

function mapTx(t) {
  return {
    id: t.id, type: t.type, quantity: t.quantity, stockBefore: t.stock_before, stockAfter: t.stock_after,
    note: t.note, productName: t.product_name, sku: t.sku, createdByName: t.created_by_name || null,
    createdAt: t.created_at,
  };
}

// ══════════════════════════════════════════════════════════════════
// GET /api/products — Danh sách sản phẩm (Read)
// ══════════════════════════════════════════════════════════════════
router.get('/', requireLogin, async (req, res, next) => {
  const { page, size } = parseP(req.query, { defaultSize: 20, maxSize: 500 });
  const { search, categoryId, lowStock, warehouseId } = req.query;
  try {
    const { rows, total } = await productRepo.findAll({
      page, size, search, categoryId: parseInt(categoryId), lowStock, warehouseId
    });
    res.json({
      success: true, message: 'OK',
      data: {
        items: rows.map(mapProd), totalCount: total,
        totalPages: Math.ceil(total / size), page, size
      }
    });
  } catch (e) { next(e); }
});

router.get('/stats', requireLogin, async (req, res, next) => {
  try {
    const stats = await productRepo.getStats();
    res.json({ success: true, message: 'OK', data: stats });
  } catch (e) { next(e); }
});

router.get('/export', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  try {
    const { rows } = await productRepo.findAll({ page: 1, size: 5000 });
    let csv = '\uFEFFMã SKU,Tên sản phẩm,Danh mục,Đơn vị,Đơn giá,Tồn kho,Tồn tối thiểu\n';
    const esc = v => { const s = String(v || ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s; };
    rows.forEach(p => {
      csv += [esc(p.sku), esc(p.name), esc(p.category_name), esc(p.unit), p.price, p.stock_qty, p.min_stock_qty].join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="san-pham-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

router.get('/import-template', requireLogin, requireManagerOrAdmin, (req, res) => {
  const template = '\uFEFFMã SKU,Tên sản phẩm,Danh mục,Đơn vị,Đơn giá,Tồn tối thiểu,Mô tả\n' +
                   'SKU001,Tên ví dụ,Văn phòng phẩm,Cái,15000,5,Mô tả ngắn\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-nhap-san-pham.csv"');
  res.send(template);
});

router.get('/transactions/recent', requireLogin, async (req, res, next) => {
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  try {
    const rows = await productRepo.getRecentTransactions(limit);
    res.json({ success: true, message: 'OK', data: { items: rows.map(mapTx), totalCount: rows.length } });
  } catch (e) { next(e); }
});

router.get('/deleted', requireLogin, requireAdmin, async (req, res, next) => {
  try {
    const rows = await productRepo.getDeletedProducts();
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

router.get('/:id', requireLogin, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new ValidationError('ID không hợp lệ');
  try {
    const p = await productRepo.findById(db, id);
    if (!p) throw new NotFoundError('Product', id);
    res.json({ success: true, message: 'OK', data: mapProd(p) });
  } catch (e) { next(e); }
});

router.get('/:id/transactions', requireLogin, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { page, size } = parseP(req.query);
  try {
    const result = await productRepo.getProductTransactions(id, { page, size });
    res.json({ success: true, message: 'OK', data: result });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/products — Write Operations
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// POST /api/products — Tạo sản phẩm mới
// ══════════════════════════════════════════════════════════════════
router.post('/', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  let dto;
  try {
    dto = CreateProductSchema.parse(req.body);
  } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const result = await manageProductUC.create(conn, {
      dto,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });

    await conn.commit();
    res.status(201).json({
      success: true,
      message: `Tạo sản phẩm '${dto.name}' thành công`,
      data:    result,
    });
  } catch (e) {
    await conn.rollback();
    if (e.code && e.code !== 'INTERNAL_ERROR') return next(e);
    next(e);
  } finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/products/:id — Cập nhật sản phẩm
// ══════════════════════════════════════════════════════════════════
router.put('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError('id không hợp lệ');

  let dto;
  try {
    dto = UpdateProductSchema.parse(req.body);
  } catch (e) { return next(e); }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await manageProductUC.update(conn, {
      id,
      dto,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });

    await conn.commit();
    res.json({ success: true, message: `Cập nhật sản phẩm thành công` });
  } catch (e) {
    await conn.rollback();
    if (e.code && e.code !== 'INTERNAL_ERROR') return next(e);
    next(e);
  } finally { conn.release(); }
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/products/:id — Xóa mềm sản phẩm
// Rule: từ chối nếu stock_qty > 0 (Spec VIII.1)
// ══════════════════════════════════════════════════════════════════
router.delete('/:id', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError('id không hợp lệ');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await manageProductUC.delete(conn, {
      id,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });

    await conn.commit();
    res.json({ success: true, message: 'Đã xóa sản phẩm' });
  } catch (e) {
    await conn.rollback();
    if (e.code && e.code !== 'INTERNAL_ERROR') return next(e);
    next(e);
  } finally { conn.release(); }
});

router.post('/:id/restore', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await restoreProductUC.execute(conn, {
      id,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Khôi phục sản phẩm thành công' });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

// BUG FIX: Add missing stock-adjust route
router.post('/:id/stock-adjust', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const productId = parseInt(req.params.id, 10);
  const { quantity, warehouseId, note, reason } = req.body;
  
  if (!warehouseId) return next(new ValidationError('Thiếu mã kho (warehouseId)'));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await adjustmentUC.execute(conn, {
      warehouseId,
      productId,
      newQuantity: quantity,
      reason: reason || note || 'Điều chỉnh nhanh từ danh sách sản phẩm',
      note: note || null,
      adjustedBy: req.session.userId,
      referenceId: null,
      referenceType: 'manual_adjust'
    });
    await conn.commit();
    res.json({ success: true, message: 'Điều chỉnh tồn kho thành công', data: result });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

router.post('/import', requireLogin, requireManagerOrAdmin, upload.single('file'), idempotencyCheck, async (req, res, next) => {
  if (!req.file) throw new ValidationError('Vui lòng chọn file');
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await importProductUC.execute(conn, {
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    await conn.commit();
    res.json({ success: true, message: 'Xử lý file hoàn tất', data: result });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

module.exports = router;
