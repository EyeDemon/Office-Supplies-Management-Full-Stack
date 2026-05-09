// src/middleware/csrf.js — BE-03: CSRF Protection
// Pattern: Synchronizer Token (session-stored) — RFC standard cho session auth
//
// Luồng hoạt động:
//   1. Client gọi GET /api/csrf-token → nhận token
//   2. Client gắn header X-CSRF-Token vào mọi POST/PUT/PATCH/DELETE
//   3. Middleware xác minh token === session.csrfToken
//
// Tại sao an toàn:
//   - Attacker không thể đọc session cookie (httpOnly)
//   - Attacker không thể đọc response từ domain khác (SOP/CORS)
//   - SameSite=Strict (prod) / Lax (dev) giảm thiểu thêm
//
// Tại sao không dùng csurf:
//   - csurf deprecated từ 2023 (security issues, unmaintained)
//   - Custom implementation đơn giản hơn, kiểm soát được hoàn toàn

'use strict';
const crypto = require('crypto');

// CSRF token length constant — 32 bytes → 64 hex characters.
// [CSRF-01] Mọi token không đúng độ dài này bị reject TRƯỚC khi vào timingSafeEqual.
const CSRF_TOKEN_HEX_LENGTH = 64;

// Method nào cần kiểm tra CSRF
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Endpoint không cần CSRF (pre-auth)
// [FIX-CSRF-PATH] Middleware mount ở app-level → req.path = full path /api/auth/login
// Các path này vẫn bypass qua "if (!req.session?.userId) return next()" nhưng
// khai báo đúng path để code rõ ràng và tránh future regression.
const CSRF_EXEMPT = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/register',
  '/api/auth/verify-reset-token',
  '/health',
  '/api/health',
]);

/**
 * Tạo CSRF token mới (256-bit entropy) và lưu vào session.
 * Gọi khi login thành công hoặc khi GET /api/csrf-token.
 *
 * @param {import('express').Request} req
 * @returns {string} token
 */
function generateCsrfToken(req) {
  const token = crypto.randomBytes(32).toString('hex'); // always 64 hex chars
  req.session.csrfToken = token;
  return token;
}

/**
 * Middleware: kiểm tra X-CSRF-Token header cho mọi mutating request.
 * Fail-open cho các endpoint exempt (login, register, ...).
 *
 * [CSRF-01 FIX] Validate token length TRƯỚC khi gọi timingSafeEqual.
 * Lý do: Node.js crypto.timingSafeEqual() ném RangeError nếu hai buffer
 * có kích thước khác nhau — không return false, mà throw. Nếu headerToken
 * có độ dài lẻ hoặc ≠ 64 chars, Buffer.from(hex) sẽ tạo buffer sai kích
 * thước và middleware crash (500) thay vì reject (403).
 *
 * Trick cũ "padEnd(64,'0').slice(0,64)" cũng NGUY HIỂM: attacker gửi
 * token ngắn chứa toàn '0' có thể match session token kết thúc bằng '0'.
 * Reject sớm loại bỏ hoàn toàn attack surface này.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {Function}                   next
 */
function csrfProtect(req, res, next) {
  // Safe HTTP methods → bỏ qua
  if (SAFE_METHODS.has(req.method)) return next();

  // Endpoint exempt (pre-auth flows)
  const path = req.path;
  if (CSRF_EXEMPT.has(path)) return next();

  // User chưa đăng nhập → auth middleware sẽ chặn, không cần CSRF check
  if (!req.session?.userId) return next();

  const sessionToken = req.session?.csrfToken;
  const rawHeader = req.headers['x-csrf-token'];
  const headerToken = typeof rawHeader === 'string' ? rawHeader.trim() : '';

  // Session chưa có token → sinh mới + cho phép request này qua
  // (tránh break existing sessions sau khi deploy)
  if (!sessionToken) {
    generateCsrfToken(req);
    return next();
  }

  // Không có header → reject
  if (!headerToken) {
    console.warn(`[CSRF] Missing token for ${req.method} ${req.path}`);
    return next({
      status: 403,
      code: 'CSRF_MISSING',
      message: 'CSRF token thiếu. Vui lòng tải lại trang.',
    });
  }

  // [CSRF-01 FIX] Kiểm tra độ dài TRƯỚC timingSafeEqual.
  if (headerToken.length !== CSRF_TOKEN_HEX_LENGTH) {
    console.warn(`[CSRF] Invalid length (${headerToken.length}) for ${req.method} ${req.path}`);
    return next({
      status: 403,
      code: 'CSRF_INVALID',
      message: 'CSRF token không hợp lệ. Vui lòng tải lại trang.',
    });
  }

  // So sánh constant-time để tránh timing attacks.
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(
      Buffer.from(sessionToken, 'hex'),
      Buffer.from(headerToken, 'hex')
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    console.warn(`[CSRF] Mismatch for ${req.method} ${req.path}`);
    return next({
      status: 403,
      code: 'CSRF_INVALID',
      message: 'CSRF token không hợp lệ. Vui lòng tải lại trang.',
    });
  }

  next();
}

module.exports = { csrfProtect, generateCsrfToken };