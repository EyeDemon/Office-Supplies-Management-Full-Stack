'use strict';
const { ValidationError } = require('../errors');

const VALID_TYPES = new Set([
  'IMPORT', 'EXPORT', 'ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT',
  'RETURN_IN', 'RETURN_OUT', 'STOCKTAKE',
]);

/**
 * InventoryTransaction Entity — Source of Truth (Spec III.1)
 * Validate trước khi persist.
 */
class InventoryTransaction {
  constructor({ type, warehouseId, productId, lotId = null, quantity, costPerUnit = 0, referenceType, referenceId, createdBy, note }) {
    if (!VALID_TYPES.has(type)) {
      throw new ValidationError(`Transaction type không hợp lệ: ${type}`);
    }
    if (!warehouseId || !productId) {
      throw new ValidationError('warehouseId và productId là bắt buộc');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError(`quantity phải là số nguyên dương, nhận: ${quantity}`);
    }
    if (lotId !== null && (!Number.isInteger(Number(lotId)) || Number(lotId) <= 0)) {
      throw new ValidationError(`lotId phải là số nguyên dương nếu có, nhận: ${lotId}`);
    }
    this.type          = type;
    this.warehouseId   = warehouseId;
    this.productId     = productId;
    this.lotId         = lotId || null;
    this.quantity      = quantity;
    this.costPerUnit   = Number(costPerUnit) || 0;
    this.referenceType = referenceType || null;
    this.referenceId   = referenceId   || null;
    this.createdBy     = createdBy     || null;
    this.note          = note          || null;
  }

  /** Delta áp dụng vào warehouse_stock (dương = nhập, âm = xuất) */
  get quantityDelta() {
    const outbound = new Set(['EXPORT', 'TRANSFER_OUT', 'RETURN_OUT']);
    return outbound.has(this.type) ? -this.quantity : this.quantity;
  }
}

/**
 * StockLedger Entity — Audit Core (Spec III.3)
 * Immutable audit record được tạo sau mỗi transaction.
 */
class StockLedger {
  constructor({ warehouseId, productId, transactionId, transactionType,
    quantityChange, runningBalance, costPerUnit = 0,
    referenceType, referenceId, note, createdBy }) {
    this.warehouseId     = warehouseId;
    this.productId       = productId;
    this.transactionId   = transactionId;
    this.transactionType = transactionType;
    this.quantityChange  = quantityChange;
    this.runningBalance  = runningBalance;
    this.costPerUnit     = Number(costPerUnit) || 0;
    this.costImpact      = Math.round(quantityChange * this.costPerUnit * 1000000) / 1000000;
    this.referenceType   = referenceType || null;
    this.referenceId     = referenceId   || null;
    this.note            = note          || null;
    this.createdBy       = createdBy     || null;
  }
}

module.exports = { InventoryTransaction, StockLedger };