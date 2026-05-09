'use strict';
/**
 * ApprovePurchaseRequest.js
 */
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog }         = require('../../shared/utils/auditLogger');
const { NotFoundError }         = require('../../domain/errors');

class ApprovePurchaseRequest {
  constructor({ purchaseRepository } = {}) {
    this.purchaseRepo = purchaseRepository;
  }

  async execute(conn, { prId, approvedBy, ipAddress }) {
    const pr = await this.purchaseRepo.findPRForUpdate(conn, prId);
    if (!pr) throw new NotFoundError('PurchaseRequest', prId);

    assertValidTransition('purchase_request', pr.status, 'APPROVED');

    await this.purchaseRepo.approvePR(conn, prId, approvedBy);

    await writeAuditLog(conn, {
      entityType: 'purchase_request', entityId: prId, action: 'APPROVE',
      changedBy: approvedBy, ipAddress,
      beforeData: { status: pr.status },
      afterData: { status: 'APPROVED' }
    });

    return { prCode: pr.pr_code };
  }
}

module.exports = ApprovePurchaseRequest;
