'use strict';
/**
 * CreatePurchaseOrder.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * PO State Machine: DRAFT → CONFIRMED → RECEIVED
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { ValidationError, NotFoundError } = require('../../domain/errors');

class CreatePurchaseOrder {
  constructor({ purchaseRepository } = {}) {
    this.purchaseRepo = purchaseRepository;
  }

  /**
   * Tạo đơn đặt hàng mới (DRAFT).
   */
  async execute(conn, {
    purchaseRequestId, supplierId, warehouseId,
    createdBy, note, expectedDate, items, ipAddress,
  }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Đơn đặt hàng phải có ít nhất 1 sản phẩm');
    }

    if (purchaseRequestId) {
      const pr = await this.purchaseRepo.findPRForUpdate(conn, purchaseRequestId);
      if (!pr) {
        throw new NotFoundError('Đề nghị mua hàng', purchaseRequestId);
      }
      if (pr.status !== 'APPROVED') {
        throw new ValidationError(`Đề nghị mua hàng phải ở trạng thái APPROVED (hiện: ${pr.status})`);
      }
      await this.purchaseRepo.updatePRStatus(conn, purchaseRequestId, { status: 'CONVERTED' });
    }

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += Number(item.quantity) * Number(item.unitPrice || 0);
    }

    const poCode = await this.purchaseRepo.genPOCode(conn);
    // Wait, PurchaseRepository has genPRCode. Let's see if it has genPOCode.
    // It has findMaxPOSeq. I'll add genPOCode to it.

    const poId = await this.purchaseRepo.createPO(conn, {
      poCode, supplierId, warehouseId, purchaseRequestId, totalAmount, createdBy, note
    });

    await this.purchaseRepo.createPOItems(conn, poId, items);

    await writeAuditLog(conn, {
      entityType: 'purchase_order', entityId: poId, action: 'CREATE',
      changedBy: createdBy, ipAddress,
      afterData: { poCode, status: 'DRAFT', totalAmount, itemCount: items.length },
    });

    return { id: poId, poCode };
  }
}

module.exports = CreatePurchaseOrder;
