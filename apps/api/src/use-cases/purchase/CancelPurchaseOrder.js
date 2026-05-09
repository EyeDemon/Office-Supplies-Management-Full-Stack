'use strict';
/**
 * CancelPurchaseOrder.js
 */
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog }         = require('../../shared/utils/auditLogger');
const { NotFoundError }         = require('../../domain/errors');

class CancelPurchaseOrder {
  constructor({ purchaseRepository } = {}) {
    this.purchaseRepo = purchaseRepository;
  }

  async execute(conn, { poId, cancelledBy, ipAddress }) {
    const po = await this.purchaseRepo.findPOForUpdate(conn, poId);
    if (!po) throw new NotFoundError('PurchaseOrder', poId);

    assertValidTransition('purchase_order', po.status, 'CANCELLED');

    const prevStatus = po.status;
    await this.purchaseRepo.cancelPO(conn, poId, cancelledBy);

    // If PO linked to PR was CONVERTED → reactivate PR to APPROVED
    if (po.purchase_request_id) {
      await this.purchaseRepo.reactivatePR(conn, po.purchase_request_id);
    }

    await writeAuditLog(conn, {
      entityType: 'purchase_order', entityId: poId, action: 'CANCEL',
      changedBy: cancelledBy, ipAddress,
      beforeData: { status: prevStatus },
      afterData: { status: 'CANCELLED' },
    });

    return { poCode: po.po_code };
  }
}

module.exports = CancelPurchaseOrder;
