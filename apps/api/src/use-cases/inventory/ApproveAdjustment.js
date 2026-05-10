'use strict';
/**
 * ApproveAdjustment.js — Use Case phê duyệt điều chỉnh tồn kho lớn.
 */
const { NotFoundError, ValidationError, ConflictError } = require('../../domain/errors');
const { computeMovingAverage } = require('../../domain/rules');
const { InventoryTransaction } = require('../../domain/entities');
const { emitTransactionCompleted } = require('../../shared/utils/eventHelper');

class ApproveAdjustment {
  constructor({ stockRepository, adjustmentRepository } = {}) {
    this.stockRepo = stockRepository;
    this.adjRepo = adjustmentRepository;
  }

  async execute(conn, { adjId, actorId, action }) {
    // 1. Tìm request
    const adj = await this.adjRepo.findAdjustmentById(conn, adjId);
    if (!adj) throw new NotFoundError('InventoryAdjustment', adjId);
    if (adj.status !== 'PENDING') throw new ConflictError('Yêu cầu đã được xử lý hoặc không ở trạng thái chờ');

    if (action === 'REJECT') {
      await this.adjRepo.updateAdjustmentStatus(conn, adjId, { status: 'REJECTED', actorId });
      return { status: 'REJECTED' };
    }

    if (action === 'APPROVE') {
      // THỰC THI ĐIỀU CHỈNH THẬT
      const { warehouse_id, product_id, new_qty, reason, note, delta, created_by } = adj;

      // Lấy dữ liệu hiện tại (Snapshot tại thời điểm duyệt)
      const ws = await this.stockRepo.findStock(conn, warehouse_id, product_id, true);
      const currentQty = ws ? Number(ws.stock_qty || 0) : 0;
      const currentAvg = ws ? Number(ws.avg_unit_price || 0) : 0;

      // Note: delta trong adj là delta so với lúc tạo. 
      // Khi duyệt, ta nên dùng new_qty để set stock tuyệt đối.
      const realDelta = new_qty - currentQty;
      const costPerUnit = Math.round(currentAvg * 1000000) / 1000000;

      // [BUG-A] Nếu không có thay đổi thực tế (zero delta), chỉ update status và return
      if (realDelta === 0) {
        await this.adjRepo.updateAdjustmentStatus(conn, adjId, { status: 'APPROVED', actorId });
        return { status: 'APPROVED', txId: null, realDelta: 0 };
      }

      // [BUG-2] Capture product state for Global Avg (MUST BE BEFORE upsertStock)
      const product = await this.stockRepo.findProduct(conn, product_id, true);
      if (!product) throw new NotFoundError('Sản phẩm', product_id);

      // 5. Cập nhật warehouse_stock
      await this.stockRepo.upsertStock(conn, warehouse_id, product_id, realDelta, currentAvg);

      // [BUG-2] Update global avg price (Moving Average)
      const globalNewAvg = product.stock_qty + realDelta > 0
        ? (realDelta > 0
          ? computeMovingAverage(product.stock_qty, product.avg_unit_price, realDelta, costPerUnit)
          : product.avg_unit_price)
        : 0;
      await this.stockRepo.updateGlobalAvgPrice(conn, product_id, Math.round(globalNewAvg * 1000000) / 1000000);

      // 7. Insert ADJUSTMENT transaction
      const tx = new InventoryTransaction({
        type: 'ADJUST',
        warehouseId: warehouse_id,
        productId: product_id,
        lotId: null,
        quantity: Math.abs(realDelta),
        costPerUnit,
        referenceType: 'adjustment',
        referenceId: adjId,
        createdBy: created_by,
        note: `[APPROVED] ${reason}`
      });

      const txId = await this.stockRepo.insertTransaction(conn, {
        ...tx,
        stockBefore: currentQty,
        stockAfter: new_qty
      });

      // 8. Insert stock_ledger
      await this.stockRepo.insertLedger(conn, {
        warehouseId: warehouse_id,
        productId: product_id,
        transactionId: txId,
        transactionType: 'ADJUST',
        quantityChange: realDelta,
        costPerUnit,
        referenceType: 'adjustment',
        referenceId: adjId,
        note: `[APPROVED] ${reason}`,
        createdBy: created_by,
      });

      // 9. Cập nhật trạng thái
      await this.adjRepo.updateAdjustmentStatus(conn, adjId, { status: 'APPROVED', actorId });

      // [BUG-C] Thống nhất dùng type 'ADJUST' thay vì 'ADJUSTMENT'
      await emitTransactionCompleted('ADJUST', txId, { adjId, delta: realDelta, productId: product_id, warehouseId: warehouse_id }, conn);

      return { status: 'APPROVED', txId, realDelta };
    }

    throw new ValidationError('Hành động không hợp lệ');
  }
}

module.exports = ApproveAdjustment;

