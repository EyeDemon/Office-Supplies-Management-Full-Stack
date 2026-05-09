'use strict';
/**
 * ProcessInbound.js — Luồng nhập kho (APPROVED → COMPLETED). (v2 — Dependency Injection)
 */
const { computeMovingAverage } = require('../../domain/rules');
const { NotFoundError, WarehouseLockedError } = require('../../domain/errors');

const { InventoryTransaction } = require('../../domain/entities');
const { emitTransactionCompleted } = require('../../shared/utils/eventHelper');

class ProcessInbound {
  constructor({ stockRepository, stocktakingRepository, unitService } = {}) {
    this.stockRepo = stockRepository;
    this.stocktakingRepo = stocktakingRepository;
    this.unitService = unitService;
  }

  /**
   * Thực thi nhập kho trong DB transaction đã có sẵn.
   *
   * @param {object} conn
   * @param {object} opts
   */
  async execute(conn, { orderId, orderCode, warehouseId, items, completedBy, referenceType = 'import_order', notePrefix = 'Phiếu nhập' }) {
    // 0. Check for active stocktaking session (BIZ-03)
    if (this.stocktakingRepo) {
      const isLocked = await this.stocktakingRepo.hasActiveSession(conn, warehouseId);
      if (isLocked) {
        throw new WarehouseLockedError(warehouseId, `Kho #${warehouseId} đang trong quá trình kiểm kê. Tạm thời không thể nhập kho.`);
      }

    }

    const completedItems = [];

    for (const item of items) {
      const { productId, quantity, unitPrice = 0, unitId, lotId = null, locationId = null, note: itemNote } = item;

      // 1. Lock product
      const product = await this.stockRepo.findProduct(conn, productId, true);
      if (!product) throw new NotFoundError('Product', productId);

      // 2. Unit conversion
      const convertedQty = this.unitService
        ? await this.unitService.convertToBase(conn, productId, unitId, quantity)
        : quantity;

      // 3. Moving Average Costing
      const totalPrice = Number(unitPrice) * Number(quantity);
      const pricePerBase = (convertedQty > 0) ? totalPrice / convertedQty : Number(unitPrice);

      const newAvg = computeMovingAverage(
        product.stock_qty,
        product.avg_unit_price,
        convertedQty,
        pricePerBase
      );
      // 4. Upsert Warehouse Stock
      const ws = await this.stockRepo.findStock(conn, warehouseId, productId, false);
      const wsAvg = ws
        ? computeMovingAverage(ws.stock_qty, ws.avg_unit_price, convertedQty, pricePerBase)
        : pricePerBase;
      await this.stockRepo.upsertStock(conn, warehouseId, productId, convertedQty, wsAvg, locationId);

      // 5. Update Global Avg (Note: stock_qty is handled by DB trigger trg_ws_after_update)
      await this.stockRepo.updateGlobalAvgPrice(conn, productId, Math.round(newAvg * 1000000) / 1000000);

      // 6. Transaction & Ledger
      const stockBefore = ws ? ws.stock_qty : 0;
      const stockAfter = stockBefore + convertedQty;

      const tx = new InventoryTransaction({
        type: 'IMPORT',
        warehouseId,
        productId,
        lotId,
        quantity: convertedQty,
        costPerUnit: Math.round(pricePerBase * 1000000) / 1000000,
        referenceType,
        referenceId: orderId,
        createdBy: completedBy,
        note: itemNote || `${notePrefix} ${orderCode}`
      });

      const txId = await this.stockRepo.insertTransaction(conn, {
        ...tx,
        stockBefore,
        stockAfter
      });

      await this.stockRepo.insertLedger(conn, {
        warehouseId, productId, transactionId: txId,
        transactionType: 'IMPORT', quantityChange: convertedQty, costPerUnit: Math.round(pricePerBase * 1000000) / 1000000,
        runningBalance: stockAfter, // [FIX] Optimization: pass stockAfter to avoid extra SELECT (BUG-M4)
        referenceType, referenceId: orderId,
        note: itemNote || `${notePrefix} ${orderCode}`, createdBy: completedBy,
      });

      await emitTransactionCompleted('IMPORT', txId, { orderCode, productId, warehouseId, quantity: convertedQty });

      // 7. Notification Cleanup
      if (stockAfter > product.min_stock_qty) {
        await this.stockRepo.clearLowStockNotif(conn, productId);
      }

      completedItems.push({ productId, qtyAdded: convertedQty, newAvg: Math.round(newAvg * 1000000) / 1000000, stockBefore, stockAfter });
    }

    return { completedItems };
  }
}

module.exports = ProcessInbound;
