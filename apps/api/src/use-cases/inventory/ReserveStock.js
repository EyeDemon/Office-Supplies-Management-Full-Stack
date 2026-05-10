'use strict';
/**
 * ReserveStock.js — Giữ chỗ tồn kho khi phiếu yêu cầu được APPROVED. (v2 — Dependency Injection)
 */
const { InsufficientStockError } = require('../../domain/errors');

class ReserveStock {
  constructor({ stockRepository } = {}) {
    this.stockRepo = stockRepository;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   */
  async execute(conn, { warehouseId, items }) {
    const reserved = [];

    for (const { productId, quantity } of items) {
      if (!quantity || quantity <= 0) continue;

      // Lock row (NOWAIT)
      const ws = await this.stockRepo.findStock(conn, warehouseId, productId, true);
      const currentQty = ws ? Number(ws.stock_qty)         : 0;
      const currentRes = ws ? Number(ws.reserved_quantity) : 0;
      const available  = Math.max(0, currentQty - currentRes);

      if (available < quantity) {
        throw new InsufficientStockError({
          warehouseId,
          productId,
          available,
          requested: quantity
        });
      }

      // Đủ tồn → reserve đầy đủ
      await this.stockRepo.increaseReservation(conn, warehouseId, productId, quantity);
      reserved.push({ productId, quantity, available });
    }

    return { reserved, warnings: [] };
  }
}

module.exports = ReserveStock;
