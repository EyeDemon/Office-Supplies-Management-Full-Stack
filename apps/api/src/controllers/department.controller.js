'use strict';
const router = require('express').Router();
const db = require('../shared/config/db');
const repo = require('../infrastructure/repositories/DepartmentRepository');
const quotaRepo = require('../infrastructure/repositories/QuotaRepository');
const { requireLogin, requireManagerOrAdmin, requireAdmin } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { ValidationError, NotFoundError } = require('../domain/errors');
const { z } = require('zod');

const DepartmentSchema = z.object({
  name: z.string().min(2, 'Tên phòng ban phải có ít nhất 2 ký tự').max(100),
  description: z.string().max(500).optional().nullable(),
});

// GET / — List all
router.get('/', requireLogin, async (req, res, next) => {
  try {
    const rows = await repo.findAll(db);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// POST / — Create
router.post('/', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  try {
    const dto = DepartmentSchema.parse(req.body);
    const id = await repo.create(db, dto);
    res.status(201).json({ success: true, message: 'Đã tạo phòng ban', data: { id, ...dto } });
  } catch (e) { next(e); }
});

// PUT /:id — Update
router.put('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  try {
    const existing = await repo.findById(db, id);
    if (!existing) throw new NotFoundError('Department', id);
    
    const dto = DepartmentSchema.parse(req.body);
    await repo.update(db, id, dto);
    res.json({ success: true, message: 'Đã cập nhật phòng ban' });
  } catch (e) { next(e); }
});

// DELETE /:id — Delete
router.delete('/:id', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  const id = parseInt(req.params.id);
  try {
    const existing = await repo.findById(db, id);
    if (!existing) throw new NotFoundError('Department', id);
    
    await repo.delete(db, id);
    res.json({ success: true, message: 'Đã xóa phòng ban' });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') {
      return next(new ValidationError('Không thể xóa phòng ban đang có nhân viên hoặc dữ liệu liên quan'));
    }
    next(e);
  }
});

// ─── Quota Management ──────────────────────────────────────────

// GET /:id/quota — Lấy danh sách quota
router.get('/:id/quota', requireLogin, requireManagerOrAdmin, async (req, res, next) => {
  const departmentId = parseInt(req.params.id);
  try {
    const quotas = await quotaRepo.findAllQuotas(db, departmentId);
    res.json({ success: true, data: quotas });
  } catch (e) { next(e); }
});

// POST /:id/quota — Cài đặt quota (Admin only)
const QuotaSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  limit: z.number().positive('Hạn mức phải là số dương'),
});

router.post('/:id/quota', requireLogin, requireAdmin, idempotencyCheck, async (req, res, next) => {
  const departmentId = parseInt(req.params.id);
  try {
    const dto = QuotaSchema.parse(req.body);
    const existing = await repo.findById(db, departmentId);
    if (!existing) throw new NotFoundError('Department', departmentId);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await quotaRepo.upsertQuota(conn, {
        departmentId,
        year: dto.year,
        month: dto.month,
        limit: dto.limit
      });
      await conn.commit();
      res.json({ success: true, message: 'Đã cập nhật hạn mức ngân sách' });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { next(e); }
});

module.exports = router;
