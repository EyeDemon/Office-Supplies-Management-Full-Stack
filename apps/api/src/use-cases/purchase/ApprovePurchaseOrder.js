'use strict';
/**
 * ApprovePurchaseOrder.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * PO State Machine: DRAFT → CONFIRMED
 */
const { assertValidTransition }   = require('../../domain/rules');
const { writeAuditLog }           = require('../../shared/utils/auditLogger');
const { NotFoundError }           = require('../../domain/errors');

class ApprovePurchaseOrder {
  constructor({ purchaseRepository } = {}) {
    this.purchaseRepo = purchaseRepository;
  }

  /**
   * Manager xác nhận PO: DRAFT → CONFIRMED
   */
  async execute(conn, { poId, confirmedBy, ipAddress }) {
    const po = await this.purchaseRepo.findPOForUpdate(conn, poId);
    if (!po) {
      throw new NotFoundError('Đơn đặt hàng', poId);
    }
    
    assertValidTransition('purchase_order', po.status, 'CONFIRMED');

    await this.purchaseRepo.confirmPO(conn, poId, confirmedBy);
    
    await writeAuditLog(conn, {
      entityType: 'purchase_order', entityId: poId, action: 'CONFIRM',
      changedBy: confirmedBy, ipAddress,
      beforeData: { status: po.status }, afterData: { status: 'CONFIRMED' },
    });
    
    return { poCode: po.po_code };
  }
}

module.exports = ApprovePurchaseOrder;
