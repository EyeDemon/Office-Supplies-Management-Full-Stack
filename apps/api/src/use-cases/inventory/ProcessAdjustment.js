'use strict';
/**
 * ProcessAdjustment.js — Điều chỉnh tồn kho (Adjustment).
 *
 * Spec IX.5 Adjustment Flow:
 *   - Bắt buộc có reason (lý do).
 *   - Ghi audit log (AuditLog — Spec X.3).
 *   - Tạo ADJUSTMENT transaction + ledger.
 *   - delta = newQuantity - currentQuantity (có thể âm — xuất bù, hoặc dương — nhập bù).
 *
 * Rule: Không cho phép newQuantity < 0.
 * Rule: Nếu delta = 0 → không ghi transaction (idempotent).
 */
const { computeMovingAverage } = require('../../domain/rules');
const { NotFoundError, ValidationError, WarehouseLockedError } = require('../../domain/errors');
const env = require('../../shared/config/env');

const { InventoryTransaction } = require('../../domain/entities');
const { checkAndEmitStockLow, emitApprovalRequired, emitTransactionCompleted } = require('../../shared/utils/eventHelper');

class ProcessAdjustment {
  constructor({ stockRepository, adjustmentRepository, stocktakingRepository } = {}) {
    this.stockRepo = stockRepository;
    this.adjRepo = adjustmentRepository;
    this.stocktakingRepo = stocktakingRepository;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   * @param {number} opts.warehouseId
   * @param {number} opts.productId
   * @param {number} opts.newQuantity   - số lượng mới sau điều chỉnh (>= 0)
   * @param {number} opts.unitPrice     - giá vốn per unit (dùng khi delta > 0 để tính avg)
   * @param {string} opts.reason        - lý do điều chỉnh (bắt buộc, min 5 chars)
   * @param {string} [opts.note]
   * @param {number} opts.adjustedBy    - userId
   * @param {number} opts.referenceId   - ID bản ghi gốc (VD: stocktaking_session_id)
   * @param {string} opts.referenceType - 'adjustment' | 'stocktaking'
   * @returns {Promise<{ delta, stockBefore, stockAfter, txId } | null>}
   *   null nếu delta = 0 (không có thay đổi)
   */
  async execute(conn, {
    warehouseId, productId, newQuantity, locationId = null,
    unitPrice = 0, reason, note = null,
    adjustedBy, referenceId, referenceType = 'adjustment',
  }) {
    // 0. Check for active stocktaking session (BIZ-03)
    if (this.stocktakingRepo && referenceType !== 'stocktaking') {
      const isLocked = await this.stocktakingRepo.hasActiveSession(conn, warehouseId);
      if (isLocked) {
        throw new WarehouseLockedError(warehouseId, `Kho #${warehouseId} đang trong quá trình kiểm kê. Tạm thời không thể điều chỉnh lẻ.`);
      }

    }

    // 1. Validate reason
    if (!reason || reason.trim().length < 5) {
      throw new ValidationError('Lý do điều chỉnh phải có ít nhất 5 ký tự', [
        { field: 'reason', message: 'Lý do điều chỉnh phải có ít nhất 5 ký tự' },
      ]);
    }
    if (newQuantity < 0) {
      throw new ValidationError('Số lượng mới không được âm', [
        { field: 'newQuantity', message: 'Số lượng mới không được âm' },
      ]);
    }

    // 2. Lock warehouse_stock NOWAIT
    const ws = await this.stockRepo.findStock(conn, warehouseId, productId, true /* NOWAIT */);
    const currentQty = ws ? Number(ws.stock_qty) : 0;
    const currentAvg = ws ? Number(ws.avg_unit_price || 0) : 0;

    const delta = newQuantity - currentQty;
    if (delta === 0) return null;

    const threshold = env.ADJUSTMENT_THRESHOLD;
    const requiresApproval = Math.abs(delta) > threshold;
    const adjCode = await this.adjRepo.genAdjCode(conn);

    if (requiresApproval) {
      // 1. Create PENDING adjustment request
      const adjId = await this.adjRepo.createAdjustmentRequest(conn, {
        adjCode,
        warehouseId,
        productId,
        oldQty: currentQty,
        newQty: newQuantity,
        delta,
        reason,
        note,
        status: 'PENDING',
        createdBy: adjustedBy
      });

      await emitApprovalRequired('inventory_adjustment', adjId, { adjCode, delta, reason });

      return {
        delta,
        stockBefore: currentQty,
        stockAfter:  currentQty, // No change yet
        status: 'PENDING',
        requiresApproval: true,
        adjCode,
        message: `Điều chỉnh lớn (${Math.abs(delta)} > ${threshold}) cần phê duyệt từ Quản lý.`
      };
    }

    // --- PROCEED WITH UPDATE IF NO APPROVAL REQUIRED ---

    // 4. Tính giá vốn mới (Moving Average khi tăng tồn)
    let wsAvg = currentAvg;
    if (delta > 0 && unitPrice > 0) {
      wsAvg = computeMovingAverage(currentQty, currentAvg, delta, unitPrice);
    } else if (newQuantity === 0) {
      wsAvg = 0; // Kho về 0 → reset avg
    }

    // 4b. Update warehouse_stock
    await this.stockRepo.upsertStock(conn, warehouseId, productId, delta, Math.round(wsAvg * 1000000) / 1000000, locationId);

    // 5. Sync reservations if needed (if decreasing stock, ensure reserved <= stock)
    if (delta < 0) {
      await this.stockRepo.syncReservationWithStock(conn, warehouseId, productId);
    }

    // 6. Update global avg price (Moving Average)
    const product = await this.stockRepo.findProduct(conn, productId, true);
    if (!product) throw new NotFoundError('Sản phẩm', productId);

    const globalNewAvg = product.stock_qty + delta > 0
      ? (delta > 0 && unitPrice > 0
          ? computeMovingAverage(product.stock_qty, product.avg_unit_price, delta, unitPrice)
          : product.avg_unit_price)
      : 0;
    await this.stockRepo.updateProductAvgPrice(conn, productId, Math.round(globalNewAvg * 1000000) / 1000000);

    // 7. Insert ADJUSTMENT transaction
    const tx = new InventoryTransaction({
      type: 'ADJUST',
      warehouseId,
      productId,
      quantity: Math.abs(delta),
      costPerUnit: Math.round((unitPrice || currentAvg) * 1000000) / 1000000,
      referenceType,
      referenceId,
      createdBy: adjustedBy,
      note: `[${reason}]${note ? ' ' + note : ''}`
    });

    const txId = await this.stockRepo.insertTransaction(conn, {
      ...tx,
      stockBefore: currentQty,
      stockAfter: newQuantity
    });

    // 8. Insert stock_ledger
    await this.stockRepo.insertLedger(conn, {
      warehouseId, productId, transactionId: txId, transactionType: 'ADJUST',
      quantityChange: delta, costPerUnit: Math.round((unitPrice || currentAvg) * 1000000) / 1000000,
      referenceType, referenceId, note: `[${reason}]${note ? ' ' + note : ''}`,
      createdBy: adjustedBy,
    });
    
    // 8.5 Record in inventory_adjustments as APPROVED
    await this.adjRepo.createAdjustmentRequest(conn, {
      adjCode, warehouseId, productId, oldQty: currentQty, newQty: newQuantity, delta,
      reason, note, status: 'APPROVED', createdBy: adjustedBy
    });


    // 9. Stock check event
    if (delta < 0) {
      await checkAndEmitStockLow(conn, productId);
    }

    // 10. Transaction completed event
    // [BUG-C] Thống nhất dùng type 'ADJUST' thay vì 'ADJUSTMENT'
    await emitTransactionCompleted('ADJUST', txId, { adjCode, delta, productId, warehouseId });

    return {
      delta,
      stockBefore: currentQty,
      stockAfter:  newQuantity,
      newAvg:      Math.round(wsAvg * 1000000) / 1000000,
      txId,
      adjCode
    };
  }
}

module.exports = ProcessAdjustment;
