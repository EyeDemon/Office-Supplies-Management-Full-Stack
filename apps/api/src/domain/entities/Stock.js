'use strict';
const InsufficientStockError = require('../errors/InsufficientStockError');

/**
 * Stock Entity — Value Object cho warehouse_stock row.
 * Encapsulates anti-oversell rule: available = stock_qty - reserved_quantity
 * Không import DB, không import Express.
 */
class Stock {
  /**
   * @param {object} p
   * @param {number} p.warehouseId
   * @param {number} p.productId
   * @param {number} p.stockQty
   * @param {number} p.reservedQuantity
   * @param {number} p.avgUnitPrice
   */
  constructor({ warehouseId, productId, stockQty = 0, reservedQuantity = 0, avgUnitPrice = 0 }) {
    this.warehouseId       = warehouseId;
    this.productId         = productId;
    this.stockQty          = Number(stockQty)          || 0;
    this.reservedQuantity  = Number(reservedQuantity)  || 0;
    this.avgUnitPrice      = Number(avgUnitPrice)      || 0;
  }

  /** Tồn kho khả dụng (anti-oversell rule) */
  get available() {
    return Math.max(0, this.stockQty - this.reservedQuantity);
  }

  /**
   * Kiểm tra đủ hàng để xuất.
   * @param {number} qty
   * @param {boolean} isReserved - Nếu true, bỏ qua việc trừ reservedQuantity vì hàng đã được giữ chỗ
   * @throws {InsufficientStockError} nếu không đủ hàng
   */
  assertSufficientStock(qty, isReserved = false) {
    const checkQty = isReserved ? this.stockQty : this.available;
    if (checkQty < qty) {
      throw new InsufficientStockError({
        warehouseId: this.warehouseId,
        productId:   this.productId,
        available:   checkQty,
        requested:   qty,
      });
    }
  }

  /**
   * Tính Moving Average Cost sau khi nhập thêm.
   * Spec IV: new_avg = (qty_before * avg_before + in_qty * in_price) / qty_after
   * @param {number} inQty
   * @param {number} inPrice
   * @returns {number} new avg rounded to 2dp
   */
  computeNewAvg(inQty, inPrice) {
    if (inPrice <= 0) return this.avgUnitPrice;
    const qtyAfter = this.stockQty + inQty;
    if (qtyAfter === 0) return 0;
    if (this.stockQty === 0) return inPrice;
    return Math.round(
      (this.stockQty * this.avgUnitPrice + inQty * inPrice) / qtyAfter * 1000000
    ) / 1000000;
  }

  toJSON() {
    return {
      warehouseId:      this.warehouseId,
      productId:        this.productId,
      stockQty:         this.stockQty,
      reservedQuantity: this.reservedQuantity,
      available:        this.available,
      avgUnitPrice:     this.avgUnitPrice,
    };
  }
}

module.exports = Stock;