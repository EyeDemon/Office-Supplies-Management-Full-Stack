'use strict';
/**
 * ProcessOutbound.js — Luồng xuất kho. (v2 — Dependency Injection)
 */
const Stock = require('../../domain/entities/Stock');
const { NotFoundError, ValidationError, WarehouseLockedError } = require('../../domain/errors');
const { InventoryTransaction } = require('../../domain/entities');
const { checkAndEmitStockLow, emitTransactionCompleted } = require('../../shared/utils/eventHelper');

class ProcessOutbound {
  constructor({ stockRepository, requisitionRepository, lotRepository, orderRepository, stocktakingRepository, unitService } = {}) {
    this.stockRepo = stockRepository;
    this.reqRepo = requisitionRepository;
    this.lotRepo = lotRepository;
    this.orderRepo = orderRepository;
    this.stocktakingRepo = stocktakingRepository;
    this.unitService = unitService;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   */
  async execute(conn, { orderId, orderCode, warehouseId, items, hasReservation = false, completedBy, requisitionId = null }) {
    // 0. Check for active stocktaking session (BIZ-03)
    if (this.stocktakingRepo) {
      const isLocked = await this.stocktakingRepo.hasActiveSession(conn, warehouseId);
      if (isLocked) {
        throw new WarehouseLockedError(warehouseId, `Kho #${warehouseId} đang trong quá trình kiểm kê. Tạm thời không thể xuất kho.`);
      }

    }

    const dispatchedItems = [];

    for (const item of items) {
      const { productId, quantity, unitId, lotId = null } = item;

      // 0. Validate Lot (Spec IX.2)
      if (lotId) {
        const lot = await this.lotRepo.findById(conn, lotId);
        if (!lot) {
          throw new NotFoundError('Lô hàng (Lot)', lotId);
        }
        if (lot.product_id !== productId) {
          throw new ValidationError(`Lô hàng #${lotId} không thuộc sản phẩm #${productId}`);
        }
      }

      // 1. Convert to base unit (using injected service)
      const dispatchQty = this.unitService
        ? await this.unitService.convertToBase(conn, productId, unitId, quantity)
        : quantity;

      // 2. Find and Lock Stock
      const wsRow = await this.stockRepo.findStock(conn, warehouseId, productId, true);
      if (!wsRow) {
        throw Object.assign(new Error(`Sản phẩm #${productId} chưa có trong kho #${warehouseId}`), { code: 'INSUFFICIENT_STOCK' });
      }

      // 3. Domain Logic
      const stock = new Stock({
        warehouseId,
        productId,
        stockQty: wsRow.stock_qty,
        reservedQuantity: wsRow.reserved_quantity,
        avgUnitPrice: wsRow.avg_unit_price,
      });
      stock.assertSufficientStock(dispatchQty, hasReservation);

      // 4. Update Warehouse Stock
      const qtyDelta = -dispatchQty;
      const costPerUnit = Math.round(Number(wsRow.avg_unit_price || 0) * 1000000) / 1000000;
      const newAvg = stock.stockQty - dispatchQty > 0 ? stock.avgUnitPrice : 0;
      await this.stockRepo.upsertStock(conn, warehouseId, productId, qtyDelta, newAvg);

      // 4b. Sync Global Avg (BUG-05) — If global stock becomes 0, reset avg to 0.
      // We get the new global stock from the database (refreshed by trigger)
      const updatedProduct = await this.stockRepo.findProduct(conn, productId, false);
      if (updatedProduct && updatedProduct.stock_qty <= 0) {
        await this.stockRepo.updateGlobalAvgPrice(conn, productId, 0);
      }

      // 5. Sync Reservations
      if (hasReservation) {
        await this.stockRepo.decreaseReservation(conn, warehouseId, productId, dispatchQty);
        // Note: Global reservation is now handled by DB trigger on products table 
        // IF we updated the trigger to include reserved_quantity sync. (Which I did in the cleanup).
      }

      // 6. Insert Transaction & Ledger
      const stockBefore = wsRow.stock_qty;
      const stockAfter = stockBefore - dispatchQty;

      const tx = new InventoryTransaction({
        type: 'EXPORT',
        warehouseId,
        productId,
        lotId,
        quantity: dispatchQty,
        costPerUnit,
        referenceType: 'export_order',
        referenceId: orderId,
        createdBy: completedBy,
        note: `Phiếu xuất ${orderCode}`
      });

      const txId = await this.stockRepo.insertTransaction(conn, {
        ...tx,
        stockBefore,
        stockAfter
      });

      await this.stockRepo.insertLedger(conn, {
        warehouseId, productId, transactionId: txId,
        transactionType: 'EXPORT', quantityChange: -dispatchQty, costPerUnit,
        runningBalance: stockAfter, // [BUG-01] Pass runningBalance to avoid extra query
        referenceType: 'export_order', referenceId: orderId,
        note: `Phiếu xuất ${orderCode}`, createdBy: completedBy,
      });

      // 6b. Update Fulfilled Qty in Order (BIZ-01)
      if (this.orderRepo) {
        await this.orderRepo.updateFulfilledQuantity(conn, orderId, productId, quantity);
      }

      await emitTransactionCompleted('EXPORT', txId, { orderCode, productId, warehouseId, quantity: dispatchQty });

      dispatchedItems.push({ productId, qtyDispatched: dispatchQty, costPerUnit, stockBefore, stockAfter });
      await checkAndEmitStockLow(conn, productId);

    }

    if (orderId && this.orderRepo) {
      await this.orderRepo.checkAndMarkExportFulfillment(conn, orderId, completedBy);
    }

    if (requisitionId && this.reqRepo) {
      await this.reqRepo.markWarehouseConfirmed(conn, requisitionId, completedBy);
    }


    return { dispatchedItems };
  }
}

// Export class instead of instance for better DI support
module.exports = ProcessOutbound;
