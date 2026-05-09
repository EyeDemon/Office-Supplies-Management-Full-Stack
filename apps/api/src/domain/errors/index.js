'use strict';

class InvalidStateTransitionError extends Error {
  constructor({ from, to, entity = 'Order' }) {
    super(`${entity}: chuyển trạng thái không hợp lệ từ ${from} → ${to}`);
    this.name   = 'InvalidStateTransitionError';
    this.code   = 'INVALID_STATE';
    this.status = 422;
    this.meta   = { from, to, entity };
  }
}

class DuplicateTransactionError extends Error {
  constructor(idempotencyKey) {
    super(`Yêu cầu trùng lặp với Idempotency-Key: ${idempotencyKey}`);
    this.name   = 'DuplicateTransactionError';
    this.code   = 'DUPLICATE_REQUEST';
    this.status = 409;
    this.meta   = { idempotencyKey };
  }
}

class NotFoundError extends Error {
  constructor(resource, id) {
    super(`${resource} #${id} không tồn tại`);
    this.name   = 'NotFoundError';
    this.code   = 'NOT_FOUND';
    this.status = 404;
    this.meta   = { resource, id };
  }
}

class ValidationError extends Error {
  constructor(message, fields = []) {
    super(message);
    this.name   = 'ValidationError';
    this.code   = 'VALIDATION_ERROR';
    this.status = 400;
    this.fields = fields; // [{field, message}]
  }
}

class ImportValidationError extends Error {
  constructor(message, data) {
    super(message);
    this.name   = 'ImportValidationError';
    this.code   = 'IMPORT_VALIDATION_ERROR';
    this.status = 422;
    this.data   = data; // { errors, totalRows, errorCount }
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Không có quyền thực hiện thao tác này') {
    super(message);
    this.name   = 'UnauthorizedError';
    this.code   = 'FORBIDDEN';
    this.status = 403;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name   = 'ConflictError';
    this.code   = 'CONFLICT';
    this.status = 409;
  }
}

const InsufficientStockError = require('./InsufficientStockError');
const WarehouseLockedError   = require('./WarehouseLockedError');

module.exports = {
  InvalidStateTransitionError,
  DuplicateTransactionError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ConflictError,
  ImportValidationError,
  InsufficientStockError,
  WarehouseLockedError,
};