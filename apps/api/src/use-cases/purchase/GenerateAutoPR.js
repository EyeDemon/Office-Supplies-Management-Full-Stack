'use strict';
/**
 * GenerateAutoPR.js — Use Case for automatically generating PRs for low stock items.
 * (Clean Architecture — Layer 2: Application Business Rules)
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { ValidationError } = require('../../domain/errors');

class GenerateAutoPR {
  constructor({ purchaseRepository } = {}) {
    this.purchaseRepo = purchaseRepository;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   * @param {number} opts.userId
   * @param {string} [opts.priority='HIGH']
   * @param {string} [opts.note]
   * @param {number[]} [opts.productIds]
   * @param {string} [opts.ipAddress]
   */
  async execute(conn, { userId, priority = 'HIGH', note = null, productIds = null, ipAddress = null }) {
    const items = await this.purchaseRepo.getLowStockForAutoPR(conn, productIds);
    if (items.length === 0) {
      throw new ValidationError('Không có sản phẩm nào cần tạo PR');
    }

    const prCode = await this.purchaseRepo.genPRCode(conn);
    const prId = await this.purchaseRepo.createAutoPRWithItems(conn, {
      prCode,
      reason: '[AUTO-PR] Tự động tạo',
      priority,
      note,
      createdBy: userId,
      items
    });

    await writeAuditLog(conn, {
      entityType: 'purchase_request',
      entityId: prId,
      action: 'AUTO_GENERATE',
      changedBy: userId,
      ipAddress,
      afterData: { pr_code: prCode, status: 'PENDING', item_count: items.length },
    });

    await this.purchaseRepo.notifyManagersForAutoPR(conn, prId, prCode, items.length);

    return { id: prId, prCode, itemCount: items.length };
  }
}

module.exports = GenerateAutoPR;
