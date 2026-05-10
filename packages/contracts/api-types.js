/**
 * api-types.js — Shared API Contract Types.
 */

const ErrorCode = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  INVALID_STATE: 'INVALID_STATE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  CSRF_MISSING: 'CSRF_MISSING',
  CSRF_INVALID: 'CSRF_INVALID',
  WAREHOUSE_LOCKED: 'WAREHOUSE_LOCKED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

function successResponse(data, message = 'OK') {
  return { success: true, message, data };
}

function paginatedResponse({ items, totalCount, page, size }) {
  return {
    success: true,
    message: 'OK',
    data: {
      items,
      totalCount,
      totalPages: Math.ceil(totalCount / size),
      page,
      size,
    },
  };
}

function errorResponse(code, message, meta = null) {
  const err = { code, message };
  if (meta) err.meta = meta;
  return { errors: [err] };
}

const HTTP_STATUS = Object.freeze({
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INSUFFICIENT_STOCK]: 409,
  [ErrorCode.DUPLICATE_REQUEST]: 409,
  [ErrorCode.INVALID_STATE]: 422,
  [ErrorCode.WAREHOUSE_LOCKED]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
});

export {
  ErrorCode,
  successResponse,
  paginatedResponse,
  errorResponse,
  HTTP_STATUS,
};