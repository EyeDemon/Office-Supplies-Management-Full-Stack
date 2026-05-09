'use strict';
/**
 * ProcessTransfer.js — Điều chuyển kho (APPROVED → COMPLETED).
 * Gồm 2 phase: Dispatch (Xuất kho nguồn) và Complete (Nhập kho đích).
 */
const { computeMovingAverage } = require('../../domain/rules');
const { convertToBaseUnit } = require('../../shared/utils/stockHelper');
const { NotFoundError, WarehouseLockedError } = require('../../domain/errors');

const InsufficientStockError = require('../../domain/errors/InsufficientStockError');
const { InventoryTransaction } = require('../../domain/entities');
const { checkAndEmitStockLow, emitTransactionCompleted } = require('../../shared/utils/eventHelper');

class ProcessTransfer {
  constructor({ stockRepository, orderRepository, stocktakingRepository, unitService } = {}) {
    this.stockRepo = stockRepository;
    this.orderRepo = orderRepository;
    this.stocktakingRepo = stocktakingRepository;
    this.unitService = unitService;
  }

  /**
   * Phase 1: Dispatch (Xuất kho nguồn)
   */
  async dispatch(conn, { transferId, transferCode, fromWarehouseId, items, userId }) {
    if (this.stocktakingRepo) {
      const isLocked = await this.stocktakingRepo.hasActiveSession(conn, fromWarehouseId);
      if (isLocked) {
        throw new WarehouseLockedError(fromWarehouseId, `Kho nguồn #${fromWarehouseId} đang kiểm kê. Không thể xuất điều chuyển.`);
      }
    }

    const productIds = items.map(i => i.productId || i.product_id);
    const productsRows = await this.stockRepo.findProductByIds(conn, productIds);
    const productMap = productsRows.reduce((map, p) => { map[p.id] = p; return map; }, {});

    const dispatchedItems = [];

    for (const item of items) {
      const productId = item.productId || item.product_id;
      const quantity = item.quantity;
      const unitId = item.unitId || item.unit_id;
      const lotId = item.lotId || item.lot_id || null;
      
      const p = productMap[productId];
      if (!p) throw new NotFoundError('Sản phẩm', productId);

      const fromStock = await this.stockRepo.findStock(conn, fromWarehouseId, productId, true);
      if (!fromStock) throw new NotFoundError(`Sản phẩm #${productId} tại kho nguồn`, fromWarehouseId);

      const baseQty = this.unitService
        ? await this.unitService.convertToBase(conn, productId, unitId, quantity)
        : await convertToBaseUnit(conn, unitId, p.base_unit_id, quantity);

      const available = Math.max(0, Number(fromStock.stock_qty) - Number(fromStock.reserved_quantity || 0));
      if (available < baseQty) {
        throw new InsufficientStockError({ warehouseId: fromWarehouseId, productId, available, requested: baseQty });
      }

      const costPerUnit = Number(p.avg_unit_price || 0);
      const stockBefore = Number(fromStock.stock_qty);

      await this.stockRepo.upsertStock(conn, fromWarehouseId, productId, -baseQty, costPerUnit);

      const stockAfter = stockBefore - baseQty;

      const tx = new InventoryTransaction({
        type: 'TRANSFER_OUT',
        warehouseId: fromWarehouseId,
        productId,
        lotId,
        quantity: baseQty,
        costPerUnit,
        referenceType: 'stock_transfer',
        referenceId: transferId,
        createdBy: userId,
        note: `[Dispatch] ${transferCode}`
      });

      const txId = await this.stockRepo.insertTransaction(conn, { ...tx, stockBefore, stockAfter });

      await this.stockRepo.insertLedger(conn, {
        warehouseId: fromWarehouseId, productId, transactionId: txId,
        transactionType: 'TRANSFER_OUT', quantityChange: -baseQty, costPerUnit,
        runningBalance: stockAfter, // [BUG-01]
        referenceType: 'stock_transfer', referenceId: transferId,
        note: `Xuất điều chuyển ${transferCode}`, createdBy: userId
      });
      
      await emitTransactionCompleted('TRANSFER_OUT', txId, { transferCode, productId, fromWarehouseId, quantity: baseQty });
      await checkAndEmitStockLow(conn, productId);

      dispatchedItems.push({ productId, baseQty });
    }
    return { transferId };
  }

  /**
   * Phase 1 Rollback
   */
  async cancel(conn, { transferId, transferCode, items, fromWarehouseId, userId }) {
    const productIds = items.map(i => i.productId || i.product_id);
    const productsRows = await this.stockRepo.findProductByIds(conn, productIds);
    const productMap = productsRows.reduce((map, p) => { map[p.id] = p; return map; }, {});

    for (const item of items) {
      const productId = item.productId || item.product_id;
      const p = productMap[productId];
      if (!p) continue;

      const fromStock = await this.stockRepo.findStock(conn, fromWarehouseId, productId, true);
      const stockBefore = fromStock ? Number(fromStock.stock_qty) : 0;
      const costPerUnit = Number(p.avg_unit_price || 0);

      const unitId = item.unitId || item.unit_id;
      const baseQty = this.unitService
        ? await this.unitService.convertToBase(conn, productId, unitId, item.quantity)
        : await convertToBaseUnit(conn, unitId, p.base_unit_id, item.quantity);

      await this.stockRepo.upsertStock(conn, fromWarehouseId, productId, baseQty, costPerUnit);

      const tx = new InventoryTransaction({
        type: 'ADJUST',
        warehouseId: fromWarehouseId,
        productId,
        quantity: baseQty,
        costPerUnit,
        referenceType: 'stock_transfer',
        referenceId: transferId,
        createdBy: userId,
        note: `Huỷ điều chuyển (Rollback): ${transferCode}`
      });

      const rollbackStockAfter = stockBefore + baseQty;
      const txId = await this.stockRepo.insertTransaction(conn, { ...tx, stockBefore, stockAfter: rollbackStockAfter });

      await this.stockRepo.insertLedger(conn, {
        warehouseId: fromWarehouseId, productId, transactionId: txId,
        transactionType: 'ADJUST', quantityChange: baseQty, costPerUnit,
        runningBalance: rollbackStockAfter, // [ARCH-2] Truyền thẳng để tránh extra SELECT
        referenceType: 'stock_transfer', referenceId: transferId,
        note: `Huỷ điều chuyển (Rollback): ${transferCode}`, createdBy: userId
      });
    }
  }

  /**
   * Phase 2: Complete
   */
  async complete(conn, { transferId, transferCode, toWarehouseId, items, userId }) {
    if (this.stocktakingRepo) {
      const isLocked = await this.stocktakingRepo.hasActiveSession(conn, toWarehouseId);
      if (isLocked) {
        throw new WarehouseLockedError(toWarehouseId, `Kho nhận #${toWarehouseId} đang kiểm kê. Không thể nhập điều chuyển.`);
      }
    }

    const productIds = items.map(i => i.productId || i.product_id);
    const productsRows = await this.stockRepo.findProductByIds(conn, productIds);
    const productMap = productsRows.reduce((map, p) => { map[p.id] = p; return map; }, {});

    const receivedItems = [];

    for (const item of items) {
      const productId = item.productId || item.product_id;
      const quantity = item.quantity;
      const unitId = item.unitId || item.unit_id;
      const lotId = item.lotId || item.lot_id || null;
      
      const p = productMap[productId];
      if (!p) throw new NotFoundError('Sản phẩm', productId);

      const baseQty = this.unitService
        ? await this.unitService.convertToBase(conn, productId, unitId, quantity)
        : await convertToBaseUnit(conn, unitId, p.base_unit_id, quantity);
      const costPerUnit = Number(p.avg_unit_price || 0);

      const toStock = await this.stockRepo.findStock(conn, toWarehouseId, productId, false);
      const toStockBefore = toStock ? Number(toStock.stock_qty) : 0;
      const currentAvg = toStock ? Number(toStock.avg_unit_price) : costPerUnit;
      
      const newToAvg = toStock
        ? computeMovingAverage(toStockBefore, currentAvg, baseQty, costPerUnit)
        : costPerUnit;

      await this.stockRepo.upsertStock(conn, toWarehouseId, productId, baseQty, newToAvg);

      const tx = new InventoryTransaction({
        type: 'TRANSFER_IN',
        warehouseId: toWarehouseId,
        productId,
        lotId,
        quantity: baseQty,
        costPerUnit,
        referenceType: 'stock_transfer',
        referenceId: transferId,
        createdBy: userId,
        note: `[Complete] ${transferCode}`
      });

      const txId = await this.stockRepo.insertTransaction(conn, { ...tx, stockBefore: toStockBefore, stockAfter: toStockBefore + baseQty });

      await this.stockRepo.insertLedger(conn, {
        warehouseId: toWarehouseId, productId, transactionId: txId,
        transactionType: 'TRANSFER_IN', quantityChange: baseQty, costPerUnit,
        runningBalance: toStockBefore + baseQty, // [BUG-01]
        referenceType: 'stock_transfer', referenceId: transferId,
        note: `Nhập điều chuyển ${transferCode}`, createdBy: userId
      });

      await emitTransactionCompleted('TRANSFER_IN', txId, { transferCode, productId, toWarehouseId, quantity: baseQty });
      receivedItems.push({ productId, baseQty });
    }
    return receivedItems;
  }
}

module.exports = ProcessTransfer;
