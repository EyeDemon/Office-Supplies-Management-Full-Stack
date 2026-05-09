'use strict';
/**
 * ConfirmStocktaking.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.6: Stocktaking confirm
 *   OPEN → COMPLETED (CONFIRMED)
 *   → Mỗi item có difference ≠ 0 → tạo stock_transaction STOCKTAKE
 *   → Ghi stock_ledger
 *   → Cập nhật warehouse_stock + products.stock_qty
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { assertValidTransition } = require('../../domain/rules');
const { NotFoundError } = require('../../domain/errors');
const { InventoryTransaction } = require('../../domain/entities');

class ConfirmStocktaking {
  constructor({ stockRepository, stocktakingRepository } = {}) {
    this.stockRepo = stockRepository;
    this.stocktakingRepo = stocktakingRepository;
  }

  async execute(conn, { sessionId, confirmedBy, ipAddress }) {
    // 1. Get session with lock (warehouse scoped)
    const session = await this.stocktakingRepo.findById(conn, sessionId, true);

    if (!session) {
      throw new NotFoundError('StocktakingSession', sessionId);
    }

    assertValidTransition('stocktaking', session.status, 'CONFIRMED');

    // 2. Get items
    const items = await this.stocktakingRepo.getItems(conn, sessionId);

    let adjustedCount = 0;

    for (const item of items) {
      // 3a. Lock specific warehouse_stock row
      const ws = await this.stockRepo.findStock(conn, session.warehouse_id, item.product_id, true);
      
      const currentAvg = ws ? Number(ws.avg_unit_price || 0) : Number(item.global_avg || 0);

      // 3b. Update warehouse_stock
      // Spec IV: quantity = 0 -> reset avg_price
      await this.stocktakingRepo.setStockQty(conn, session.warehouse_id, item.product_id, item.actual_qty, Number(item.actual_qty) === 0);

      // 3c. Update global products cache: sync Avg Price only.
      // [FIX NEW-BUG-01] Trigger trg_ws_after_update will sync products.stock_qty.
      const diff = Number(item.difference);
      if (diff !== 0) {
        await this.stockRepo.updateGlobalAvgPrice(conn, item.product_id, currentAvg);
        
        // 4b. Sync Global Avg — If global stock becomes 0, reset avg to 0.
        // We still check products.stock_qty here (it was just updated by trigger after the warehouse UPDATE).
        const updatedProduct = await this.stockRepo.findProduct(conn, item.product_id, false);
        if (updatedProduct && updatedProduct.stock_qty <= 0) {
            await this.stockRepo.updateGlobalAvgPrice(conn, item.product_id, 0);
        }

        // 3d. Ensure reserved_quantity is sane if stock decreased
        if (diff < 0) {
          await this.stockRepo.syncProductReservation(conn, item.product_id);
        }
        // 3e. Insert stock_transaction (only if diff != 0)
        const tx = new InventoryTransaction({
          type: 'ADJUST',
          warehouseId: session.warehouse_id,
          productId: item.product_id,
          quantity: Math.abs(diff),
          costPerUnit: currentAvg,
          referenceType: 'stocktaking_session',
          referenceId: sessionId,
          createdBy: confirmedBy,
          note: `Kiểm kê ${session.session_code}`
        });

        const transactionId = await this.stockRepo.insertTransaction(conn, {
          ...tx,
          stockBefore: item.system_qty,
          stockAfter: item.actual_qty
        });

        // 3g. Ghi stock_ledger
        if (session.warehouse_id) {
          await this.stockRepo.insertLedger(conn, {
            warehouseId:     session.warehouse_id,
            productId:       item.product_id,
            transactionId,
            transactionType: 'ADJUST',
            quantityChange:  diff,
            runningBalance:  item.actual_qty,
            costPerUnit:     currentAvg,
            referenceType:   'stocktaking_session',
            referenceId:     sessionId,
            note:            `Kiểm kê ${session.session_code}`,
            createdBy:       confirmedBy,
          });
        }

        adjustedCount++;
      }

      // 3f. Audit Log for Item (Always record that it was confirmed)
      await writeAuditLog(conn, {
        entityType: 'stocktaking_item', entityId: item.id, action: 'CONFIRM_ITEM',
        changedBy: confirmedBy, ipAddress,
        beforeData: { systemQty: item.system_qty },
        afterData:  { actualQty: item.actual_qty, diff }
      });
    }

    // 4. Update session status
    await this.stocktakingRepo.updateStatus(conn, sessionId, { status: 'CONFIRMED', confirmedBy });

    // 5. Audit Log for Session
    await writeAuditLog(conn, {
      entityType: 'stocktaking_session', entityId: sessionId, action: 'CONFIRM_SESSION',
      changedBy: confirmedBy, ipAddress,
      beforeData: { status: 'COUNTING' },
      afterData:  { status: 'CONFIRMED', adjustedCount }
    });

    return { sessionCode: session.session_code, adjustedCount };
  }
}

module.exports = ConfirmStocktaking;
