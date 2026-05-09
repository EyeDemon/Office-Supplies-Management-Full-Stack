'use strict';
/**
 * ProcessPurchaseOrderReceive.js
 */
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog }         = require('../../shared/utils/auditLogger');
const { NotFoundError, ValidationError } = require('../../domain/errors');

class ProcessPurchaseOrderReceive {
  constructor({ purchaseRepository, productRepository, inboundUseCase, unitService } = {}) {
    this.purchaseRepo = purchaseRepository;
    this.productRepo = productRepository;
    this.inboundUC = inboundUseCase;
    this.unitService = unitService;
  }

  async execute(conn, { poId, receivedBy, receivedItems, ipAddress }) {
    const po = await this.purchaseRepo.findPOById(conn, poId, true);
    if (!po) throw new NotFoundError('Đơn đặt hàng', poId);

    assertValidTransition('purchase_order', po.status, 'RECEIVED');

    if (!po.warehouse_id) throw new ValidationError('Đơn đặt hàng chưa chỉ định kho nhận hàng');

    const poItems = await this.purchaseRepo.findPOItems(conn, poId);

    const receivedMap = {};
    if (Array.isArray(receivedItems) && receivedItems.length > 0) {
      for (const ri of receivedItems) {
        receivedMap[ri.productId] = Math.max(0, Number(ri.quantityReceived) || 0);
      }
    }

    const itemsToProcess = [];
    for (const item of poItems) {
      const qtyReceived = receivedMap[item.product_id] !== undefined
        ? receivedMap[item.product_id]
        : item.quantity;

      if (qtyReceived <= 0) continue;

      itemsToProcess.push({
        productId: item.product_id,
        quantity: qtyReceived,
        unitPrice: item.unit_price,
        unitId: item.unit_id,
        note: `Nhận hàng PO ${po.po_code}`
      });
    }

    if (itemsToProcess.length > 0) {
      await this.inboundUC.execute(conn, {
        orderId: poId,
        orderCode: po.po_code,
        warehouseId: po.warehouse_id,
        items: itemsToProcess,
        completedBy: receivedBy,
        referenceType: 'purchase_order',
        notePrefix: 'Nhận hàng PO'
      });

      // BUG-04: Record price history using standardized repository method
      if (this.productRepo) {
        for (const item of itemsToProcess) {
          await this.productRepo.insertPriceHistory(conn, {
            productId:       item.productId,
            supplierId:      po.supplier_id,
            purchaseOrderId: poId,
            unitPrice:       item.unitPrice,
            quantity:        item.quantity,
            changedBy:       receivedBy,
            note:            `Nhập kho từ PO ${po.po_code}`
          });
        }
      }
    }

    await this.purchaseRepo.markPOReceived(conn, poId, receivedBy);

    await writeAuditLog(conn, {
      entityType: 'purchase_order', entityId: poId, action: 'RECEIVE',
      changedBy: receivedBy, ipAddress,
      beforeData: { status: po.status },
      afterData:  { status: 'RECEIVED', receivedCount: itemsToProcess.length },
    });

    return { poCode: po.po_code, receivedCount: itemsToProcess.length };
  }
}

module.exports = ProcessPurchaseOrderReceive;
