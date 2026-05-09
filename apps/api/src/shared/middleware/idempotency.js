// src/middleware/idempotency.js — Idempotency v2.0 (Concurrent Proof)
// Spec XXI: Idempotency-Key header support
// Spec XIX: Double submit → return same response
// Spec VIII.7: Anti-duplicate & Concurrent protection
'use strict';
const db = require('../config/db');

const TTL_HOURS = 24;

/**
 * Middleware idempotency cho POST endpoints.
 */
const idempotencyCheck = async (req, res, next) => {
  const idemKey = req.headers['idempotency-key']?.trim();

  // [Spec VIII.7] Idempotency-Key bắt buộc cho POST/PUT/PATCH/DELETE
  if (!idemKey) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return res.status(400).json({
        errors: [{ code: 'VALIDATION_ERROR', message: 'Header Idempotency-Key là bắt buộc cho các yêu cầu thay đổi trạng thái (POST, PUT, PATCH, DELETE)' }]
      });
    }
    return next();
  }

  if (idemKey.length > 255) {
    return res.status(400).json({
      errors: [{ code: 'VALIDATION_ERROR', message: 'Idempotency-Key quá dài' }],
    });
  }

  const userId = req.session?.userId || null;
  const endpoint = `${req.method} ${req.path}`;

  try {
    // 1. Cố gắng chiếm quyền xử lý (Atomic INSERT)
    // Nếu key đã tồn tại, lỗi ER_DUP_ENTRY sẽ xảy ra
    try {
      await db.query(
        `INSERT INTO idempotency_keys
           (idem_key, user_id, endpoint, status, expires_at)
         VALUES (?, ?, ?, 'PROCESSING', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
        [idemKey, userId, endpoint, TTL_HOURS]
      );
      // Insert thành công -> Ta là người đầu tiên
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        // Key đã tồn tại -> Kiểm tra trạng thái
        const [[existing]] = await db.query(
          `SELECT status, response_status, response_body, expires_at
           FROM idempotency_keys
           WHERE idem_key = ? AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
          [idemKey, userId, userId]
        );

        if (!existing || new Date(existing.expires_at) < new Date()) {
          // Key cũ đã hết hạn -> Xoá và thử lại (hiếm gặp vì INSERT fail)
          await db.query('DELETE FROM idempotency_keys WHERE idem_key=?', [idemKey]);
          return idempotencyCheck(req, res, next);
        }

        if (existing.status === 'PROCESSING') {
          return res.status(409).json({
            errors: [{ code: 'CONFLICT', message: 'Yêu cầu đang được xử lý, vui lòng không gửi trùng lặp' }]
          });
        }

        if (existing.status === 'COMPLETED') {
          const body = existing.response_body ? JSON.parse(existing.response_body) : {};
          return res
            .status(existing.response_status)
            .set('X-Idempotency-Replayed', 'true')
            .json(body);
        }
      }
      throw err; // Lỗi khác
    }

    // 2. Hook vào res.json để lưu kết quả khi xong
    const originalJson = res.json.bind(res);
    let finalized = false;

    // [BUG-07 FIX] Dùng flag cleanupDone riêng để tránh double-cleanup.
    // 'finish' VÀ 'close' có thể cùng fire cho 1 response bình thường
    // → cleanupStuckKey chạy 2 lần → 2 DELETE queries thừa.
    let cleanupDone = false;
    const cleanupStuckKey = async () => {
      if (finalized || cleanupDone) return;
      cleanupDone = true;
      // Nếu kết nối kết thúc mà chưa finalized (do lỗi nghiêm trọng hoặc crash), xoá key để cho phép retry
      try {
        await db.query("DELETE FROM idempotency_keys WHERE idem_key = ? AND status = 'PROCESSING'", [idemKey]);
      } catch (e) {
        console.error('[idempotency] Cleanup stuck key error:', e.message);
      }
    };

    res.once('finish', cleanupStuckKey);
    res.once('close', cleanupStuckKey);

    res.json = async function (body) {
      if (finalized) return originalJson(body);
      finalized = true;

      try {
        // Chỉ lưu thành công (2xx) để replay. Lỗi 4xx/5xx cho phép retry với cùng key.
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const bodyStr = JSON.stringify(body);
          await db.query(
            `UPDATE idempotency_keys
             SET status = 'COMPLETED',
                 response_status = ?,
                 response_body = ?
             WHERE idem_key = ? AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [res.statusCode, bodyStr, idemKey, userId, userId]
          );
        } else {
          // Nếu lỗi (4xx/5xx), giải phóng key ngay lập tức để client có thể retry
          await db.query("DELETE FROM idempotency_keys WHERE idem_key = ? AND status = 'PROCESSING'", [idemKey]);
        }
      } catch (saveErr) {
        console.error('[idempotency] Finalize error:', saveErr.message);
        // Fallback: Nếu update lỗi, vẫn cố gắng xoá để không kẹt
        try { await db.query("DELETE FROM idempotency_keys WHERE idem_key = ? AND status = 'PROCESSING'", [idemKey]); } catch (e) { }
      }
      return originalJson(body);
    };

    next();
  } catch (e) {
    console.error('[idempotency] Middleware error:', e.message);
    next();
  }
};

async function cleanupExpiredKeys() {
  try {
    await db.query('DELETE FROM idempotency_keys WHERE expires_at < NOW()');
  } catch (e) {
    console.error('[idempotency] Cleanup error:', e.message);
  }
}

module.exports = { idempotencyCheck, cleanupExpiredKeys };