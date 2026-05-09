'use strict';
/**
 * category.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/CategoryRepository');
const { requireLogin, requireManagerOrAdmin, parsePage, getClientIp } = require('../shared/middleware/authenticate');
const { streamToCsv } = require('../shared/utils/csv/csvStream');
const { idempotencyCheck } = require('../shared/middleware/idempotency');

// ── Use-Cases ────────────────────────────────────────────────────
const manageCategoryUC = require('../use-cases/master-data/ManageCategory');
const { CreateCategorySchema, UpdateCategorySchema } = require('../shared/dto/category.dto');



function mapCat(c) {
  return { id: c.id, name: c.name, description: c.description || null, productCount: Number(c.product_count) || 0, createdAt: c.created_at };
}

router.get('/', requireLogin, async (req, res, next) => {
  const { page, size } = parsePage(req.query, { defaultSize: 50, maxSize: 500 });
  const search = req.query.search;
  try {
    const { total, rows } = await repo.findWithFilters(db, { search, size, offset: (page - 1) * size });
    res.json({
      success: true, message: 'OK', data: {
        items: rows.map(mapCat),
        totalCount: total,
        totalPages: Math.ceil(total / size),
        page,
        size
      }
    });
  } catch (e) { next(e); }
});


router.get('/export', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  const search = req.query.search;
  const conn = await db.pool.getConnection();
  try {
    const where  = ['c.deleted = 0'];
    const params = [];
    if (search?.trim()) {
      where.push('c.name LIKE ?');
      params.push(`%${search.trim().replace(/[%_\\]/g, '\\$&')}%`);
    }

    const sql = `SELECT c.id, c.name, c.description, c.created_at,
                        COUNT(p.id) AS product_count
                 FROM categories c
                 LEFT JOIN products p ON p.category_id = c.id AND p.deleted = 0
                 WHERE ${where.join(' AND ')}
                 GROUP BY c.id, c.name, c.description, c.created_at
                 ORDER BY c.name ASC LIMIT 5000`;

    const headers = ['ID', 'Tên danh mục', 'Mô tả', 'Số sản phẩm', 'Ngày tạo'];
    const filename = `danh-muc-${new Date().toISOString().slice(0, 10)}.csv`;

    const queryStream = conn.connection.query(sql, params).stream();

    streamToCsv(res, filename, headers, queryStream, (r) => [
      r.id, r.name, r.description, Number(r.product_count) || 0, r.created_at
    ]);

    res.on('finish', () => conn.release());
  } catch (e) {
    conn.release();
    next(e);
  }
});

router.get('/:id', requireLogin, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const cat = await repo.findById(db, id);
    if (!cat) throw new NotFoundError('Category', id);
    res.json({ success: true, message: 'OK', data: mapCat(cat) });
  } catch (e) { next(e); }
});

router.post('/', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const validation = CreateCategorySchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    const result = await manageCategoryUC.create(conn, {
      data: validation.data.body,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    
    await conn.commit();
    const created = await repo.findById(db, result.id);
    res.status(201).json({ success: true, message: 'Tạo danh mục thành công', data: mapCat(created) });
  } catch (e) {
    await conn.rollback();
    if (e.code && e.code !== 'INTERNAL_ERROR') return next(e);
    next(e);
  } finally { conn.release(); }
});

router.put('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const validation = UpdateCategorySchema.safeParse(req);
  if (!validation.success) return next(new ValidationError(validation.error.errors[0].message));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    await manageCategoryUC.update(conn, {
      id,
      data: validation.data.body,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    
    await conn.commit();
    const updated = await repo.findById(db, id);
    res.json({ success: true, message: 'Cập nhật danh mục thành công', data: mapCat(updated) });
  } catch (e) {
    await conn.rollback();
    if (e.code && e.code !== 'INTERNAL_ERROR') return next(e);
    next(e);
  } finally { conn.release(); }
});

router.delete('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return next(new ValidationError('ID không hợp lệ'));
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    await manageCategoryUC.delete(conn, {
      id,
      userId: req.session.userId,
      ipAddress: getClientIp(req)
    });
    
    await conn.commit();
    res.json({ success: true, message: 'Xóa danh mục thành công' });
  } catch (e) {
    await conn.rollback();
    if (e.code && e.code !== 'INTERNAL_ERROR') return next(e);
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
