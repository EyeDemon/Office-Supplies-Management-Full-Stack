'use strict';
/**
 * globalErrorHandler.js — Centralized Error → API Contract mapping.
 *
 * Spec V: Tất cả lỗi phải trả về { errors: [...] } format chuẩn.
 * Spec XI: Domain Errors được ánh xạ chính xác.
 *
 * Thứ tự domain errors check:
 *   InsufficientStockError  → 409 INSUFFICIENT_STOCK
 *   DuplicateTransactionError → 409 DUPLICATE_REQUEST
 *   InvalidStateTransitionError → 422 INVALID_STATE
 *   ValidationError         → 400 VALIDATION_ERROR
 *   NotFoundError           → 404 NOT_FOUND
 *   UnauthorizedError       → 403 FORBIDDEN
 *   ConflictError           → 409 CONFLICT
 *   ZodError (from dto)     → 400 VALIDATION_ERROR
 *   Default                 → 500 INTERNAL_ERROR
 */
const InsufficientStockError = require('../../domain/errors/InsufficientStockError');
const {
  InvalidStateTransitionError,
  DuplicateTransactionError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ConflictError,
  ImportValidationError,
  WarehouseLockedError,
} = require('../../domain/errors');
const logger = require('../logger');


/**
 * Chuẩn hóa lỗi thành mảng errors theo API contract.
 * @param {string} code
 * @param {string} message
 * @param {object} [meta]
 */
function buildErrorResponse(code, message, meta = null) {
  const error = { code, message };
  if (meta) error.meta = meta;
  return { errors: [error] };
}

// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, next) {
  // ── Domain Errors ────────────────────────────────────────────
  if (err instanceof InsufficientStockError) {
    return res.status(409).json(buildErrorResponse(err.code, err.message, err.meta));
  }
  if (err instanceof DuplicateTransactionError) {
    return res.status(409).json(buildErrorResponse(err.code, err.message, err.meta));
  }
  if (err instanceof WarehouseLockedError) {
    return res.status(409).json(buildErrorResponse(err.code, err.message, err.meta));
  }

  if (err instanceof InvalidStateTransitionError) {
    return res.status(422).json(buildErrorResponse(err.code, err.message, err.meta));
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json(buildErrorResponse(err.code, err.message, err.meta));
  }
  if (err instanceof ValidationError) {
    return res.status(400).json(buildErrorResponse(err.code, err.message, { fields: err.fields }));
  }
  if (err instanceof UnauthorizedError) {
    return res.status(403).json(buildErrorResponse(err.code || 'FORBIDDEN', err.message));
  }
  
  // ── CSRF Errors (passed via next({code, message...})) ──────────
  if (err.code && (err.code.startsWith('CSRF_') || err.code === 'CSRF_INVALID')) {
    return res.status(403).json(buildErrorResponse(err.code, err.message || 'Lỗi CSRF'));
  }
  if (err instanceof ConflictError) {
    return res.status(409).json(buildErrorResponse(err.code, err.message));
  }
  if (err.name === 'ImportValidationError') {
    return res.status(422).json(buildErrorResponse('IMPORT_VALIDATION_ERROR', err.message, { data: err.data }));
  }

  // ── Zod Validation Errors ─────────────────────────────────────
  if (err.name === 'ZodError') {
    const fields = err.errors?.map(e => ({ field: e.path.join('.'), message: e.message })) || [];
    return res.status(400).json(buildErrorResponse('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { fields }));
  }

  // ── MySQL Errors ──────────────────────────────────────────────
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json(buildErrorResponse('CONFLICT', 'Dữ liệu đã tồn tại trong hệ thống'));
  }
  // Error 3572: Statement aborted because lock held by another transaction (NOWAIT)
  if (err.errno === 3572 || err.code === 'ER_LOCK_NOWAIT') {
    return res.status(409).json(buildErrorResponse('CONFLICT', 'Hệ thống đang bận xử lý mặt hàng này, vui lòng thử lại sau giây lát'));
  }

  // ── Default: Internal Error ───────────────────────────────────
  const isProd = process.env.NODE_ENV === 'production';
  
  // [DO-01] Log the error with request context
  if (req.log) {
    req.log.error(err, 'Unhandled Exception');
  } else {
    logger.error(err, 'Unhandled Exception (Outside Request Context)');
  }

  return res.status(500).json(
    buildErrorResponse('INTERNAL_ERROR', isProd ? 'Lỗi server nội bộ' : err.message)
  );
}

module.exports = globalErrorHandler;