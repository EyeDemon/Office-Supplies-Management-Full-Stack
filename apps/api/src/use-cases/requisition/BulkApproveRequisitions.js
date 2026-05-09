'use strict';

class BulkApproveRequisitions {
  constructor({ approveRequisitionUC } = {}) {
    this.approveUC = approveRequisitionUC;
  }

  async execute(conn, { ids, approvedBy, ipAddress }) {
    const results = {
      approved: [],
      failed: [],
      processedCount: 0
    };

    for (const id of ids) {
      try {
        const result = await this.approveUC.execute(conn, {
          requisitionId: id,
          approvedBy,
          ipAddress
        });
        results.approved.push({ id, ...result });
        results.processedCount++;
      } catch (e) {
        results.failed.push({ id, error: e.message || String(e) });
      }
    }

    return results;
  }
}

module.exports = BulkApproveRequisitions;
