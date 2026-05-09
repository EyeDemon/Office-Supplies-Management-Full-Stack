'use strict';
/**
 * CancelPurchaseRequest.js
 */
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog }         = require('../../shared/utils/auditLogger');
const { NotFoundError }         = require('../../domain/errors');

class CancelPurchaseRequest {
  constructor({ purchaseRepository } = {}) {
    this.purchaseRepo = purchaseRepository;
  }

  async execute(conn, { prId, cancelledBy, ipAddress }) {
    const pr = await this.purchaseRepo.findPRForUpdate(conn, prId);
    if (!pr) throw new NotFoundError('PurchaseRequest', prId);

    // Cancel is allowed from DRAFT or PENDING (or APPROVED if not yet converted)
    assertValidTransition('purchase_request', pr.status, 'CANCELLED');

    await this.purchaseRepo.cancelPR(conn, prId, cancelledBy);

    await writeAuditLog(conn, {
      entityType: 'purchase_request', entityId: prId, action: 'CANCEL',
      changedBy: cancelledBy, ipAddress,
      beforeData: { status: pr.status },
      afterData: { status: 'CANCELLED' }
    });

    return { prCode: pr.pr_code };
  }
}

module.exports = CancelPurchaseRequest;
