'use strict';
/**
 * WarehouseConfirmRequisition.js — Kho xác nhận xuất hàng theo phiếu yêu cầu cấp phát.
 *
 * Spec IX.3 Warehouse Dispatch:
 *   LOCK stock (NOWAIT) → check available → qty -= → reserved -= → tx → ledger → APPROVED→CONFIRMED
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { InventoryTransaction } = require('../../domain/entities');
const { assertValidTransition } = require('../../domain/rules');
const { NotFoundError, InsufficientStockError } = require('../../domain/errors');
const { checkAndEmitStockLow } = require('../../shared/utils/eventHelper');

class WarehouseConfirmRequisition {
  constructor({ stockRepository, requisitionRepository, orderRepository } = {}) {
    this.stockRepo = stockRepository;
    this.reqRepo = requisitionRepository;
    this.orderRepo = orderRepository;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   */
  async execute(conn, { requisitionId, confirmedBy, ipAddress = null, confirmedItems = [] }) {
    // ── 1. Lock + validate requisition ────────────────────────────
    const req = await this.reqRepo.findForWarehouseConfirm(conn, requisitionId);
    if (!req) {
      throw new NotFoundError('Requisition', requisitionId);
    }

    assertValidTransition('requisition', req.status, 'WAREHOUSE_CONFIRMED');

    // ── 2. Load approved items ─────────────────────────────────────
    const items = await this.reqRepo.findApprovedItemsForDispense(conn, requisitionId);

    const dispensedMap = {};
    for (const ci of confirmedItems) {
      dispensedMap[ci.itemId] = Math.max(0, Number(ci.quantityDispensed) || 0);
    }

    const dispensedItems = [];

    // ── 4. Process each item ───────────────────────────────────────
    for (const item of items) {
      const qtyOut = dispensedMap[item.id] !== undefined
        ? dispensedMap[item.id]
        : Number(item.quantity_approved);

      if (qtyOut <= 0) continue;

      const warehouseId = req.warehouse_id;
      const productId = item.product_id;

      if (warehouseId) {
        // 4a. Lock warehouse_stock row
        const ws = await this.stockRepo.findStock(conn, warehouseId, productId, true);
        const currentQty = ws ? Number(ws.stock_qty) : 0;
        const currentReserved = ws ? Number(ws.reserved_quantity) : 0;
        const available = currentQty - currentReserved;

        // 4b. Anti-oversell check
        if (available < qtyOut) {
          throw new InsufficientStockError({
            warehouseId,
            productId,
            available,
            requested: qtyOut
          });
        }

        const costPerUnit = Math.round(Number(ws.avg_unit_price || item.avg_unit_price || 0) * 1000000) / 1000000;
        const stockBefore = currentQty;
        const stockAfter = stockBefore - qtyOut;
        const newAvg = stockAfter > 0 ? ws.avg_unit_price : 0;

        await this.stockRepo.upsertStock(conn, warehouseId, productId, -qtyOut, newAvg);
        await this.stockRepo.decreaseReservation(conn, warehouseId, productId, qtyOut);

        const tx = new InventoryTransaction({
          productId,
          warehouseId,
          lotId: null,
          referenceType: 'requisition',
          referenceId: requisitionId,
          type: 'EXPORT',
          quantity: qtyOut,
          costPerUnit: costPerUnit,
          createdBy: confirmedBy,
          note: `Cấp phát theo phiếu ${req.req_code}`,
        });

        const txId = await this.stockRepo.insertTransaction(conn, {
          ...tx,
          stockBefore,
          stockAfter,
        });

        await this.stockRepo.insertLedger(conn, {
          warehouseId,
          productId,
          transactionId: txId,
          transactionType: 'EXPORT',
          quantityChange: -qtyOut,
          runningBalance: stockAfter,
          costPerUnit,
          referenceType: 'requisition',
          referenceId: requisitionId,
          note: `Cấp phát phiếu ${req.req_code}`,
          createdBy: confirmedBy,
        });

        dispensedItems.push({
          productId,
          quantity: qtyOut,
          unitId: item.unit_id || null,
          lotId: null,
          note: `Cấp phát phiếu ${req.req_code}`
        });

        // 4c. Check and Emit stock low alert
        await checkAndEmitStockLow(conn, productId);
      }
    }

    let orderId = null;
    // ── 4d. Create linked Export Order (BIZ-02) ─────────────────────
    if (this.orderRepo && dispensedItems.length > 0) {
      const exportCode = await this.orderRepo.generateExportCode(conn);
      const totalQty = dispensedItems.reduce((sum, i) => sum + i.quantity, 0);

      orderId = await this.orderRepo.createExport(conn, {
        orderCode: exportCode,
        recipientName: req.requester_name || null,
        department: req.department || null,
        warehouseId: req.warehouse_id,
        note: `Tự động tạo từ yêu cầu cấp phát: ${req.req_code}`,
        totalQty,
        createdBy: confirmedBy,
        status: 'COMPLETED',
        requisitionId: requisitionId
      });

      await this.orderRepo.insertExportItems(conn, orderId, dispensedItems);
    }

    // ── 5. Mark requisition WAREHOUSE_CONFIRMED ────────────────────
    await this.reqRepo.markWarehouseConfirmed(conn, requisitionId, confirmedBy);

    // ── 6. Audit log ───────────────────────────────────────────────
    await writeAuditLog(conn, {
      entityType: 'requisition', entityId: requisitionId, action: 'WAREHOUSE_CONFIRM',
      changedBy: confirmedBy, ipAddress,
      beforeData: { status: 'APPROVED' },
      afterData: { status: 'WAREHOUSE_CONFIRMED', dispensedCount: dispensedItems.length },
    });

    return { dispensedCount: dispensedItems.length, dispensedItems, exportOrderId: orderId };
  }
}

module.exports = WarehouseConfirmRequisition;
