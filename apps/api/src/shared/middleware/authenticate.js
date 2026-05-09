'use strict';
/**
 * authenticate.js — Session-based auth guards + helpers.
 * Đổi tên từ auth.js → rõ nghĩa hơn (auth = ambiguous, authenticate = clear intent).
 */

const requireLogin = (req, res, next) => {
  if (!req.session?.userId)
    return res.status(401).json({ errors: [{ code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' }] });
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session?.userId)
    return res.status(401).json({ errors: [{ code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' }] });
  if (req.session.role !== 'ADMIN')
    return res.status(403).json({ errors: [{ code: 'FORBIDDEN', message: 'Chỉ Admin mới có quyền thực hiện' }] });
  next();
};

const requireManagerOrAdmin = (req, res, next) => {
  if (!req.session?.userId)
    return res.status(401).json({ errors: [{ code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' }] });
  const { role } = req.session;
  if (role !== 'ADMIN' && role !== 'MANAGER')
    return res.status(403).json({ errors: [{ code: 'FORBIDDEN', message: 'Không có quyền thực hiện' }] });
  next();
};

const requireWarehouseOrAdmin = (req, res, next) => {
  if (!req.session?.userId)
    return res.status(401).json({ errors: [{ code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' }] });
  const { role } = req.session;
  if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'WAREHOUSE')
    return res.status(403).json({ errors: [{ code: 'FORBIDDEN', message: 'Chỉ Nhân viên kho, Quản lý hoặc Admin' }] });
  next();
};

const requireSelfOrAdmin = (req, res, next) => {
  if (!req.session?.userId)
    return res.status(401).json({ errors: [{ code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' }] });
  const targetId = parseInt(req.params.id);
  if (req.session.role === 'ADMIN' || req.session.userId === targetId) return next();
  return res.status(403).json({ errors: [{ code: 'FORBIDDEN', message: 'Không có quyền truy cập tài nguyên này' }] });
};

// ── Helpers ────────────────────────────────────────────────────────

/** Proxy-aware IP extraction */
const getClientIp = (req) => {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '0.0.0.0';
};

/** Escape MySQL LIKE wildcards */
const sanitizeLike = (s) => String(s).replace(/[%_\\]/g, c => `\\${c}`);

/** Parse pagination — 1-based from client */
const parsePage = (query, { defaultSize = 20, maxSize = 100 } = {}) => {
  const page = parseInt(query.page);
  const size = parseInt(query.size);
  return {
    page: (isNaN(page) || page < 1) ? 1 : page,
    size: (isNaN(size) || size < 1) ? defaultSize : Math.min(maxSize, size),
  };
};

module.exports = {
  requireLogin,
  requireAdmin,
  requireManagerOrAdmin,
  requireWarehouseOrAdmin,
  requireSelfOrAdmin,
  getClientIp,
  sanitizeLike,
  parsePage,
};