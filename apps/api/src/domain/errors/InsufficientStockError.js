'use strict';
/**
 * InsufficientStockError — Domain Error
 * Ném khi available_qty < requested_qty trong luồng Outbound / Reservation.
 * Global error handler sẽ map → HTTP 409 + code INSUFFICIENT_STOCK.
 */
class InsufficientStockError extends Error {
  /**
   * @param {object} p
   * @param {number} p.warehouseId
   * @param {number} p.productId
   * @param {number} p.available
   * @param {number} p.requested
   */
  constructor({ warehouseId, productId, available, requested }) {
    super(
      `Tồn kho không đủ tại kho #${warehouseId} cho sản phẩm #${productId}: ` +
      `khả dụng ${available}, yêu cầu ${requested}`
    );
    this.name     = 'InsufficientStockError';
    this.code     = 'INSUFFICIENT_STOCK';
    this.status   = 409;
    this.meta     = { warehouseId, productId, available, requested };
  }
}

module.exports = InsufficientStockError;