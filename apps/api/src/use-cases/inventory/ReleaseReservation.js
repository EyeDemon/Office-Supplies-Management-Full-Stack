'use strict';
/**
 * ReleaseReservation.js (v2 — Dependency Injection)
 * Giải phóng số lượng đã giữ hàng (Reserved Stock).
 */
class ReleaseReservationUseCase {
  constructor({ stockRepository } = {}) {
    this.stockRepo = stockRepository;
  }

  async execute(conn, { warehouseId, items }) {
    for (const { productId, quantity } of items) {
      if (!quantity || quantity <= 0) continue;
      
      // Giảm reserved_quantity trong warehouse_stock
      await this.stockRepo.decreaseReservation(conn, warehouseId, productId, quantity);
    }
    return { success: true };
  }
}

module.exports = ReleaseReservationUseCase;
