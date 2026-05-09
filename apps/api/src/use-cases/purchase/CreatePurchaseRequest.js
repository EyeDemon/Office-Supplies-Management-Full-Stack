'use strict';
/**
 * CreatePurchaseRequest.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.7: Purchase Request creation
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');

class CreatePurchaseRequest {
  constructor({ purchaseRepository } = {}) {
    this.purchaseRepo = purchaseRepository;
  }

  async execute(conn, { createdBy, warehouseId, supplierId, reason, note, priority, items, ipAddress }) {
    const prCode = await this.purchaseRepo.genPRCode(conn);
    const prId = await this.purchaseRepo.createPR(conn, {
      prCode,
      requestedBy: createdBy,
      warehouseId,
      supplierId,
      reason,
      note,
      priority
    });

    await this.purchaseRepo.createPRItems(conn, prId, items);

    await writeAuditLog(conn, {
      entityType: 'purchase_request', entityId: prId, action: 'CREATE',
      changedBy: createdBy, ipAddress,
      afterData: { prCode, status: 'PENDING', priority, itemCount: items.length },
    });

    return { id: prId, prCode };
  }
}

module.exports = CreatePurchaseRequest;
