'use strict';
/**
 * audit.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/AuditRepository');
const { requireLogin, requireAdmin, parsePage } = require('../shared/middleware/authenticate');
const { streamToCsv } = require('../shared/utils/csv/csvStream');
const { ValidationError } = require('../domain/errors');

function buildWhere(query) {
  const where  = [];
  const params = [];
  if (query.username?.trim())    { where.push('l.username LIKE ?');      params.push(`%${query.username.trim()}%`); }
  if (query.success === 'true')  { where.push('l.success = 1'); }
  if (query.success === 'false') { where.push('l.success = 0'); }
  if (query.dateFrom)            { where.push('DATE(l.created_at) >= ?'); params.push(query.dateFrom); }
  if (query.dateTo)              { where.push('DATE(l.created_at) <= ?'); params.push(query.dateTo); }
  return { w: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function buildGeneralWhere(query) {
  const where = []; const params = [];
  if (query.entityType?.trim()) { where.push('g.entity_type = ?');       params.push(query.entityType.trim()); }
  if (query.entityId)           { where.push('g.entity_id = ?');         params.push(parseInt(query.entityId)); }
  if (query.action?.trim())     { where.push('g.action = ?');            params.push(query.action.trim().toUpperCase()); }
  if (query.changedBy?.trim()) {
    const cb = query.changedBy.trim();
    if (/^\d+$/.test(cb)) {
      where.push('g.changed_by = ?');
      params.push(parseInt(cb));
    } else {
      where.push('u.username LIKE ?');
      params.push(`%${cb}%`);
    }
  }
  if (query.dateFrom)           { where.push('DATE(g.created_at) >= ?'); params.push(query.dateFrom); }
  if (query.dateTo)             { where.push('DATE(g.created_at) <= ?'); params.push(query.dateTo); }
  return { w: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

const esc = (v) => {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
};

const escCsv = (v) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/logins/export', requireLogin, requireAdmin, async (req, res, next) => {
  const { w, params } = buildWhere(req.query);
  const conn = await db.pool.getConnection();
  try {
    const sql = `SELECT l.id, l.username, l.ip_address, l.success, l.user_agent, l.created_at
                 FROM login_audit_log l ${w}
                 ORDER BY l.created_at DESC LIMIT 10000`;
    
    const headers = ['ID','Username','IP','Kết quả','User Agent','Thời gian'];
    const filename = `audit-login-${new Date().toISOString().slice(0, 10)}.csv`;

    const queryStream = conn.connection.query(sql, params).stream();
    
    streamToCsv(res, filename, headers, queryStream, (r) => [
      r.id, r.username, r.ip_address, r.success ? 'Thành công' : 'Thất bại',
      r.user_agent, r.created_at
    ]);

    res.on('finish', () => conn.release());
  } catch (e) {
    conn.release();
    return next(e);
  }
});

router.get('/logins', requireLogin, requireAdmin, async (req, res, next) => {
  const { page, size } = parsePage(req.query, { defaultSize: 30 });
  const { w, params }  = buildWhere(req.query);
  try {
    const { total, rows, stats } = await repo.getLogins(db, { w, params, size, offset: (page - 1) * size });
    res.json({ success: true, message: 'OK', data: {
      items: rows, totalCount: total, totalPages: Math.ceil(total / size), page, size,
      stats: {
        totalAttempts: Number(stats.total_attempts || 0),
        successCount:  Number(stats.success_count  || 0),
        failCount:     Number(stats.fail_count      || 0),
        uniqueUsers:   Number(stats.unique_users    || 0),
        uniqueIps:     Number(stats.unique_ips      || 0),
      },
    }});
  } catch (e) { next(e); }
});

router.get('/logins/suspicious', requireLogin, requireAdmin, async (req, res, next) => {
  try {
    const rows = await repo.getSuspiciousLogins(db);
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

router.get('/general', requireLogin, requireAdmin, async (req, res, next) => {
  const { page, size } = parsePage(req.query, { defaultSize: 30 });
  const { w, params }  = buildGeneralWhere(req.query);
  try {
    const { total, rows } = await repo.getGeneralLogs(db, { w, params, size, offset: (page - 1) * size });
    res.json({ success: true, message: 'OK', data: {
      items: rows, totalCount: total, totalPages: Math.ceil(total / size), page, size,
    }});
  } catch (e) { next(e); }
});

router.get('/general/entity/:type/:id', requireLogin, requireAdmin, async (req, res, next) => {
  const { type, id } = req.params;
  const entityId = parseInt(id);
  if (isNaN(entityId)) return next(new ValidationError('ID không hợp lệ'));
  try {
    const rows = await repo.getEntityLogs(db, type, entityId);
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

router.get('/general/export', requireLogin, requireAdmin, async (req, res, next) => {
  const { w, params } = buildGeneralWhere(req.query);
  const conn = await db.pool.getConnection();
  try {
    const sql = `SELECT g.id, g.entity_type, g.entity_id, g.action,
                        u.full_name AS changed_by_name, g.ip_address,
                        g.before_data, g.after_data, g.note, g.created_at
                 FROM general_audit_log g
                 LEFT JOIN users u ON u.id = g.changed_by
                 ${w}
                 ORDER BY g.created_at DESC LIMIT 10000`;

    const headers = ['ID','Loại','Entity ID','Hành động','Người thực hiện','IP','Before','After','Ghi chú','Thời gian'];
    const filename = `audit-general-${new Date().toISOString().slice(0, 10)}.csv`;

    const queryStream = conn.connection.query(sql, params).stream();

    streamToCsv(res, filename, headers, queryStream, (r) => [
      r.id, r.entity_type, r.entity_id, r.action, r.changed_by_name,
      r.ip_address, r.before_data, r.after_data, r.note, r.created_at
    ]);

    res.on('finish', () => conn.release());
  } catch (e) {
    conn.release();
    return next(e);
  }
});

module.exports = router;
