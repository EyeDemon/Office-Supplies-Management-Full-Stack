'use strict';

class BulkApprovePurchaseRequests {
  constructor({ approvePurchaseRequestUC } = {}) {
    this.approveUC = approvePurchaseRequestUC;
  }

  async execute(conn, { ids, approvedBy, ipAddress }) {
    const approved = [];
    const skipped = [];

    for (const id of ids) {
      try {
        const result = await this.approveUC.execute(conn, { prId: id, approvedBy, ipAddress });
        approved.push({ id, prCode: result.prCode });
      } catch (e) {
        const SKIPPABLE = ['INVALID_STATE', 'NOT_FOUND', 'INSUFFICIENT_STOCK', 'CONFLICT'];
        if (SKIPPABLE.includes(e.code)) {
          skipped.push({ id, reason: e.message });
        } else {
          throw e;
        }
      }
    }

    return { approved, skipped };
  }
}

module.exports = BulkApprovePurchaseRequests;
