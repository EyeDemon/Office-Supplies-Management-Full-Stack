'use strict';

class BulkApprovePurchaseOrders {
  constructor({ approvePurchaseOrderUC } = {}) {
    this.approveUC = approvePurchaseOrderUC;
  }

  async execute(conn, { ids, approvedBy, ipAddress }) {
    const approved = [];
    const skipped = [];

    for (const id of ids) {
      try {
        const result = await this.approveUC.execute(conn, { poId: id, confirmedBy: approvedBy, ipAddress });
        approved.push({ id, poCode: result.poCode });
      } catch (e) {
        const SKIPPABLE = ['INVALID_STATE', 'NOT_FOUND', 'CONFLICT'];
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

module.exports = BulkApprovePurchaseOrders;
