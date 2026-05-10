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

    const poItems = await this.purchaseRepo.findPOItems(conn, poId);

    const receivedMap = {};
    if (Array.isArray(receivedItems) && receivedItems.length > 0) {
      for (const ri of receivedItems) {
        receivedMap[ri.productId] = Math.max(0, Number(ri.quantityReceived) || 0);
      }
    }

    // ── 2b. Determine nextStatus and validate transition ──────────
    let isAllDone = true;
    const itemsToProcess = [];
    
    for (const item of poItems) {
      const qtyReceivedNow = receivedMap[item.product_id] !== undefined
        ? receivedMap[item.product_id]
        : 0; // Default to 0 if not in list (partial receive)

      if (qtyReceivedNow > 0) {
        itemsToProcess.push({
          productId: item.product_id,
          quantity: qtyReceivedNow,
          unitPrice: item.unit_price,
          unitId: item.unit_id,
          note: `Nhận hàng PO ${po.po_code}`
        });
      }

      const totalReceivedAfter = (Number(item.quantity_received) || 0) + qtyReceivedNow;
      if (totalReceivedAfter < item.quantity) {
        isAllDone = false;
      }
    }

    const nextStatus = isAllDone ? 'RECEIVED' : 'PARTIAL';
    assertValidTransition('purchase_order', po.status, nextStatus);

    if (itemsToProcess.length === 0) {
      return { poCode: po.po_code, receivedCount: 0, message: 'Không có mặt hàng nào được nhận.' };
    }

    if (!po.warehouse_id) throw new ValidationError('Đơn đặt hàng chưa chỉ định kho nhận hàng');

    // ── 3. Update received quantities for items ──────────────────
    for (const item of itemsToProcess) {
      await this.purchaseRepo.updatePOItemReceivedQty(conn, poId, item.productId, item.quantity);
    }

    // ── 4. Execute Inbound ────────────────────────────────────────
    await this.inboundUC.execute(conn, {
      orderId: poId,
      orderCode: po.po_code,
      warehouseId: po.warehouse_id,
      items: itemsToProcess,
      completedBy: receivedBy,
      referenceType: 'purchase_order',
      notePrefix: 'Nhận hàng PO'
    });

    // ── 5. Record price history ───────────────────────────────────
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

    await this.purchaseRepo.markPOReceived(conn, poId, receivedBy, nextStatus);

    await writeAuditLog(conn, {
      entityType: 'purchase_order', entityId: poId, action: 'RECEIVE',
      changedBy: receivedBy, ipAddress,
      beforeData: { status: po.status },
      afterData:  { status: nextStatus, receivedCount: itemsToProcess.length },
    });

    return { poCode: po.po_code, receivedCount: itemsToProcess.length };
  }
}

module.exports = ProcessPurchaseOrderReceive;
