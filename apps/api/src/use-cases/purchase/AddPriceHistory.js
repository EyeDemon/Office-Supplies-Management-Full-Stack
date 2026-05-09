'use strict';
/**
 * AddPriceHistory.js — Use Case for manually adding product price history.
 * (Clean Architecture — Layer 2: Application Business Rules)
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { ValidationError } = require('../../domain/errors');

class AddPriceHistory {
  constructor({ productRepository } = {}) {
    this.productRepo = productRepository;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   * @param {number} opts.userId
   * @param {number} opts.productId
   * @param {number} opts.supplierId
   * @param {number} opts.unitPrice
   * @param {number} [opts.quantity=0]
   * @param {string} [opts.note]
   * @param {string} [opts.ipAddress]
   */
  async execute(conn, { userId, productId, supplierId, unitPrice, quantity = 0, note = null, ipAddress = null }) {
    if (!productId || !unitPrice) {
      throw new ValidationError('Thiếu thông tin bắt buộc: productId và unitPrice');
    }

    const historyId = await this.productRepo.insertPriceHistory(conn, {
      productId,
      supplierId,
      unitPrice,
      quantity,
      changedBy: userId,
      note
    });

    await writeAuditLog(conn, {
      entityType: 'price_history',
      entityId: historyId,
      action: 'CREATE',
      changedBy: userId,
      ipAddress,
      afterData: { product_id: productId, supplier_id: supplierId, unit_price: unitPrice },
    });

    return { id: historyId };
  }
}

module.exports = AddPriceHistory;
