'use strict';
/**
 * InputStocktakingItems.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.6: Nhập số lượng thực tế kiểm kê
 */
const { NotFoundError, ValidationError } = require('../../domain/errors');

class InputStocktakingItems {
  constructor({ stocktakingRepository } = {}) {
    this.repo = stocktakingRepository;
  }

  async execute(conn, { sessionId, updates }) {
    const status = await this.repo.getSessionStatusForUpdate(conn, sessionId);
    if (!status) throw new NotFoundError('Đợt kiểm kê', sessionId);
    if (status !== 'OPEN' && status !== 'COUNTING') {
        throw new ValidationError(`Chỉ có thể nhập dữ liệu khi đợt kiểm kê đang ở trạng thái OPEN hoặc COUNTING (trạng thái hiện tại: ${status})`);
    }

    for (const update of updates) {
      const { productId, actualQty, note } = update;
      const systemQty = await this.repo.getItemSystemQty(conn, sessionId, productId);
      
      if (systemQty === null) continue; // Sản phẩm không có trong đợt kiểm kê này

      const difference = Number(actualQty) - Number(systemQty);
      await this.repo.updateItemActualQty(conn, {
        sessionId, productId, actualQty, difference, note
      });
    }

    return { success: true };
  }
}

module.exports = InputStocktakingItems;
