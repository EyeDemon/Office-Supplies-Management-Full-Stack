'use strict';
/**
 * ProcessReturn.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.7: Purchase & Return flow
 *   - EMPLOYEE_RETURN: Increase stock (Customer/Employee returns to us)
 *   - SUPPLIER_RETURN: Decrease stock (We return to supplier)
 */
const { InventoryTransaction } = require('../../domain/entities');
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog }         = require('../../shared/utils/auditLogger');
const { NotFoundError, ValidationError, InvalidStateTransitionError, WarehouseLockedError } = require('../../domain/errors');
const InsufficientStockError = require('../../domain/errors/InsufficientStockError');

class ProcessReturn {
  constructor({ stockRepository, returnRepository, stocktakingRepository } = {}) {
    this.stockRepo = stockRepository;
    this.returnRepo = returnRepository;
    this.stocktakingRepo = stocktakingRepository;
  }

  async execute(conn, returnId, userId, ipAddress) {
    // 1. Lock return header
    const rtn = await this.returnRepo.getReturnForUpdate(conn, returnId);
    if (!rtn) {
      throw new NotFoundError('Phiếu trả hàng', returnId);
    }

    assertValidTransition('return_order', rtn.status, 'COMPLETED');

    const isSupplierReturn = rtn.return_type === 'SUPPLIER_RETURN';
    const warehouseId      = rtn.warehouse_id;

    if (!warehouseId) {
      throw new ValidationError('Phiếu trả hàng chưa chỉ định kho');
    }

    // [BUG-02] BIZ-03: Kiểm tra khóa kho nếu đang kiểm kê
    if (this.stocktakingRepo) {
      const isLocked = await this.stocktakingRepo.hasActiveSession(conn, warehouseId);
      if (isLocked) {
        throw new WarehouseLockedError(warehouseId, `Kho #${warehouseId} đang kiểm kê. Không thể thực hiện nghiệp vụ trả hàng.`);
      }
    }

    // 2. Get items
    const items = await this.returnRepo.getReturnItems(conn, returnId);
    if (items.length === 0) {
      throw new ValidationError('Phiếu trả hàng không có sản phẩm');
    }

    let processedCount = 0;

    for (const item of items) {
      const productId = item.product_id;
      const qty       = Number(item.quantity);

      // Lock global product & warehouse stock
      const prod = await this.stockRepo.findProduct(conn, productId, true);
      if (!prod) continue;

      const ws = await this.stockRepo.findStock(conn, warehouseId, productId, true);
      
      const stockBeforeGlobal = Number(prod.stock_qty);
      const avgBeforeGlobal   = Number(prod.avg_unit_price || 0);
      const stockBeforeWH     = ws ? Number(ws.stock_qty) : 0;
      const avgBeforeWH       = ws ? Number(ws.avg_unit_price || 0) : 0;

      let stockAfterGlobal, stockAfterWH, newAvgGlobal, newAvgWH;

      if (isSupplierReturn) {
        // --- SUPPLIER_RETURN: Trả hàng cho NCC -> GIẢM tồn kho ---
        const availableWH = Math.max(0, stockBeforeWH - Number(ws ? ws.reserved_quantity : 0));
        if (availableWH < qty) {
          throw new InsufficientStockError({ warehouseId, productId, available: availableWH, requested: qty });
        }

        stockAfterGlobal = stockBeforeGlobal - qty;
        stockAfterWH     = stockBeforeWH - qty;
        // Cost usually doesn't change on export
        newAvgGlobal     = avgBeforeGlobal;
        newAvgWH         = avgBeforeWH;

        // Update DB
        await this.stockRepo.upsertStock(conn, warehouseId, productId, -qty, newAvgWH);
        await this.stockRepo.updateGlobalAvgPrice(conn, productId, newAvgGlobal);

        // Record Transaction
        const tx = new InventoryTransaction({
          productId, warehouseId, referenceType: 'return_order', referenceId: returnId,
          type: 'EXPORT', quantity: qty, costPerUnit: avgBeforeWH,
          createdBy: userId, note: `Trả hàng NCC: ${rtn.return_code}`
        });

        const txId = await this.stockRepo.insertTransaction(conn, {
          ...tx,
          stockBefore: stockBeforeWH, stockAfter: stockAfterWH
        });

        // Record Ledger
        await this.stockRepo.insertLedger(conn, {
          warehouseId, productId, transactionId: txId, transactionType: 'EXPORT',
          quantityChange: -qty, runningBalance: stockAfterWH, costPerUnit: avgBeforeWH,
          referenceType: 'return_order', referenceId: returnId,
          note: `Trả hàng NCC: ${rtn.return_code}`, createdBy: userId
        });

      } else {
        // --- EMPLOYEE_RETURN: NV trả hàng -> TĂNG tồn kho ---
        stockAfterGlobal = stockBeforeGlobal + qty;
        stockAfterWH     = stockBeforeWH + qty;
        
        // Costing: use current global average as incoming price for simplicity if not specified
        const incomingPrice = avgBeforeGlobal; 
        
        newAvgGlobal = avgBeforeGlobal; 
        newAvgWH     = (stockBeforeWH * avgBeforeWH + qty * incomingPrice) / stockAfterWH;
        newAvgWH     = Math.round(newAvgWH * 1000000) / 1000000;

        // Update DB
        await this.stockRepo.upsertStock(conn, warehouseId, productId, qty, newAvgWH);
        await this.stockRepo.updateGlobalAvgPrice(conn, productId, newAvgGlobal);
        await this.stockRepo.clearLowStockNotif(conn, productId);

        // Record Transaction
        const tx = new InventoryTransaction({
          productId, warehouseId, referenceType: 'return_order', referenceId: returnId,
          type: 'IMPORT', quantity: qty, costPerUnit: incomingPrice,
          createdBy: userId, note: `NV trả hàng: ${rtn.return_code}`
        });

        const txId = await this.stockRepo.insertTransaction(conn, {
          ...tx,
          stockBefore: stockBeforeWH, stockAfter: stockAfterWH
        });

        // Record Ledger
        await this.stockRepo.insertLedger(conn, {
          warehouseId, productId, transactionId: txId, transactionType: 'IMPORT',
          quantityChange: qty, runningBalance: stockAfterWH, costPerUnit: incomingPrice,
          referenceType: 'return_order', referenceId: returnId,
          note: `NV trả hàng: ${rtn.return_code}`, createdBy: userId
        });
      }

      processedCount++;
    }

    // 3. Mark return as completed
    await this.returnRepo.complete(conn, returnId, userId);

    // 4. Audit Log
    await writeAuditLog(conn, {
      entityType: 'return_order', entityId: returnId, action: 'COMPLETE_PROCESS',
      changedBy: userId, ipAddress,
      beforeData: { status: 'DRAFT' },
      afterData:  { status: 'COMPLETED', processedCount }
    });

    return { rtn, isSupplierReturn, processedCount };
  }
}

module.exports = ProcessReturn;
