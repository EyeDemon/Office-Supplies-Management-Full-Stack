// src/utils/auditLogger.js — Ghi audit log vào general_audit_log v40
// Spec XIV: lưu ai / làm gì / khi nào / before / after
'use strict';

/**
 * Ghi 1 bản ghi vào general_audit_log trong cùng transaction (conn).
 *
 * @param {import('mysql2/promise').PoolConnection} conn  — connection đang trong transaction
 * @param {object} opts
 * @param {string}  opts.entityType   — Loại đối tượng: 'product', 'import_order', 'export_order', ...
 * @param {number}  opts.entityId     — PK của đối tượng
 * @param {string}  opts.action       — Hành động: 'CREATE'|'UPDATE'|'DELETE'|'SUBMIT'|'APPROVE'|'REJECT'|'COMPLETE'|'CANCEL'|...
 * @param {number}  [opts.changedBy]  — user_id người thực hiện
 * @param {string}  [opts.ipAddress]  — IP client
 * @param {object}  [opts.beforeData] — Trạng thái TRƯỚC khi thay đổi (plain object)
 * @param {object}  [opts.afterData]  — Trạng thái SAU khi thay đổi (plain object)
 * @param {string}  [opts.note]       — Ghi chú tự do
 */
async function writeAuditLog(conn, {
  entityType,
  entityId,
  action,
  changedBy  = null,
  ipAddress  = null,
  beforeData = null,
  afterData  = null,
  note       = null,
}) {
  if (!entityType || !action) return; // bỏ qua nếu thiếu trường bắt buộc

  const beforeJson = beforeData != null ? JSON.stringify(beforeData) : null;
  const afterJson  = afterData  != null ? JSON.stringify(afterData)  : null;

  await conn.query(
    `INSERT INTO general_audit_log
       (entity_type, entity_id, action, changed_by, ip_address, before_data, after_data, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(entityType),
      entityId   != null ? Number(entityId) : null,
      String(action).toUpperCase(),
      changedBy  != null ? Number(changedBy)  : null,
      ipAddress  || null,
      beforeJson,
      afterJson,
      note       || null,
    ]
  );
}

/**
 * Phiên bản "an toàn" — không ném lỗi khi ghi thất bại.
 * Dùng cho các nơi mà audit log là non-critical (không được ảnh hưởng transaction chính).
 * Thường dùng ngoài transaction hoặc ở finally block.
 */
async function writeAuditLogSafe(conn, opts) {
  try {
    await writeAuditLog(conn, opts);
  } catch (err) {
    console.warn('[auditLogger] Bỏ qua lỗi ghi audit:', err.message);
  }
}

module.exports = { writeAuditLog, writeAuditLogSafe };
