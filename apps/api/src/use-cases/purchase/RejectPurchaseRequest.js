'use strict';
/**
 * RejectPurchaseRequest.js
 */
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog }         = require('../../shared/utils/auditLogger');
const { NotFoundError }         = require('../../domain/errors');

class RejectPurchaseRequest {
  constructor({ purchaseRepository } = {}) {
    this.purchaseRepo = purchaseRepository;
  }

  async execute(conn, { prId, rejectedBy, reason, ipAddress }) {
    const pr = await this.purchaseRepo.findPRForUpdate(conn, prId);
    if (!pr) throw new NotFoundError('PurchaseRequest', prId);

    assertValidTransition('purchase_request', pr.status, 'REJECTED');

    await this.purchaseRepo.rejectPR(conn, prId, rejectedBy, reason);

    await writeAuditLog(conn, {
      entityType: 'purchase_request', entityId: prId, action: 'REJECT',
      changedBy: rejectedBy, ipAddress,
      beforeData: { status: pr.status },
      afterData: { status: 'REJECTED', reason }
    });

    return { prCode: pr.pr_code };
  }
}

module.exports = RejectPurchaseRequest;
