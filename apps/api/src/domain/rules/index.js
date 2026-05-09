'use strict';
const { InvalidStateTransitionError } = require('../errors');

/**
 * StateMachine — Quản lý chuyển trạng thái hợp lệ.
 * Open/Closed: thêm entity mới mà không sửa logic core.
 */
const TRANSITIONS = {
  // Phiếu nhập kho: DRAFT→PENDING→APPROVED→COMPLETED|CANCELLED
  // inventory.controller.js: POST /orders/:id/complete checks status==='APPROVED'
  import_order: {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'CANCELLED'],
    APPROVED: ['COMPLETED', 'CANCELLED'],
  },
  // Phiếu xuất kho: DRAFT→PENDING→APPROVED→COMPLETED|CANCELLED
  export_order: {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'REJECTED'],
    APPROVED: ['PARTIAL', 'COMPLETED', 'CANCELLED'],
    PARTIAL: ['PARTIAL', 'COMPLETED', 'CANCELLED'],
  },
  // Yêu cầu mua hàng: DRAFT→PENDING→APPROVED|REJECTED|CANCELLED
  purchase_request: {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'REJECTED'],
  },
  // Đơn đặt hàng: DRAFT→CONFIRMED→RECEIVED|CANCELLED
  purchase_order: {
    DRAFT: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PARTIAL', 'RECEIVED', 'CANCELLED'],
    PARTIAL: ['PARTIAL', 'RECEIVED', 'CANCELLED'],
  },
  // Phiếu yêu cầu cấp phát: PENDING→APPROVED|REJECTED|CANCELLED
  requisition: {
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['WAREHOUSE_CONFIRMED', 'CANCELLED'],
  },
  // Phiếu điều chuyển: Two-phase flow
  //   Phase 1 (dispatch, fat route): APPROVED → IN_TRANSIT (xuất kho nguồn)
  //   Phase 2 (complete, controller): IN_TRANSIT → COMPLETED (nhập kho đích)
  // Aligned with routes/transfers.js and inventory.controller.js
  transfer: {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'CANCELLED'],
    APPROVED: ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['COMPLETED', 'CANCELLED'],
  },
  // Kiểm kê: OPEN→COUNTING→CONFIRMED|CANCELLED
  stocktaking: {
    OPEN: ['COUNTING', 'CONFIRMED', 'CANCELLED'],
    COUNTING: ['CONFIRMED', 'CANCELLED'],
  },
  // Phiếu trả hàng: DRAFT→COMPLETED|CANCELLED
  return_order: {
    DRAFT: ['COMPLETED', 'CANCELLED'],
  },
};


function assertValidTransition(entity, fromStatus, toStatus) {
  const map = TRANSITIONS[entity];
  if (!map) throw new InvalidStateTransitionError({ entity, from: fromStatus, to: toStatus });
  const allowed = map[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new InvalidStateTransitionError({ entity, from: fromStatus, to: toStatus });
  }
}

/**
 * StockGuard — Anti-oversell rule (Spec III.4)
 * Tách biệt để dễ unit-test độc lập.
 */
const InsufficientStockError = require('../errors/InsufficientStockError');
// re-export

function guardSufficientStock({ warehouseId, productId, available, requested }) {
  if (available < requested) {
    throw new InsufficientStockError({ warehouseId, productId, available, requested });
  }
}

/**
 * CostingEngine — Moving Average Weighted Cost (Spec III.5)
 * Pure function, zero dependencies.
 */
function computeMovingAverage(qtyBefore, avgBefore, inQty, inPrice) {
  if (inPrice <= 0) return Number(avgBefore) || 0;
  const qtyAfter = Number(qtyBefore) + Number(inQty);
  if (qtyAfter === 0) return 0;
  if (Number(qtyBefore) === 0) return Number(inPrice);
  const newAvg = (Number(qtyBefore) * Number(avgBefore) + Number(inQty) * Number(inPrice)) / qtyAfter;
  return Math.round(newAvg * 1000000) / 1000000;
}

module.exports = { assertValidTransition, guardSufficientStock, computeMovingAverage, TRANSITIONS };