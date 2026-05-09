'use strict';
/**
 * RestoreProduct.js — Use Case for restoring a soft-deleted product.
 * (Clean Architecture — Layer 2: Application Business Rules)
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { NotFoundError } = require('../../domain/errors');

class RestoreProduct {
  constructor({ productRepository } = {}) {
    this.productRepo = productRepository;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   * @param {number} opts.id
   * @param {number} opts.userId
   * @param {string} opts.ipAddress
   */
  async execute(conn, { id, userId, ipAddress }) {
    const existing = await this.productRepo.findById(conn, id, true);
    if (!existing) throw new NotFoundError('Product', id);

    await this.productRepo.restore(conn, id, userId);

    await writeAuditLog(conn, {
      entityType: 'product',
      entityId: id,
      action: 'RESTORE',
      changedBy: userId,
      ipAddress,
      afterData: { deleted: false }
    });

    return { id };
  }
}

module.exports = RestoreProduct;
