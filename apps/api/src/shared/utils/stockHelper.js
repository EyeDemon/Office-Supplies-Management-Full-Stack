// src/utils/stockHelper.js — v44 (Phase2-Fix DB-03: avg_unit_price per warehouse)
// Spec IV: Moving Average Weighted Cost phải tính per-warehouse, không chỉ global
'use strict';

const stockRepo = require('../../infrastructure/repositories/StockRepository');
const { computeMovingAverage } = require('../../domain/rules');

/**
 * Cộng / trừ tồn kho của 1 sản phẩm tại 1 kho cụ thể (warehouse_stock).
 * Dùng FOR UPDATE để tránh race condition khi 2 phiếu cùng xuất đồng thời.
 */
async function adjustWarehouseStock(conn, warehouseId, productId, delta, allowNegative = false) {
  if (!warehouseId || !productId || delta === 0) return;

  const existing = await stockRepo.findStock(conn, warehouseId, productId, true);

  if (existing) {
    const newQty = Number(existing.stock_qty) + delta;
    if (!allowNegative && newQty < 0) {
      throw new Error(
        `Tồn kho tại kho #${warehouseId} không đủ: hiện có ${existing.stock_qty}, cần xuất ${Math.abs(delta)}`
      );
    }
    // UPSERT using StockRepository. Since it's just adjust (not inbound), newAvgPrice stays the same.
    await stockRepo.upsertStock(conn, warehouseId, productId, delta, Number(existing.avg_unit_price || 0));
  } else {
    if (!allowNegative && delta < 0) {
      throw new Error(`Tồn kho tại kho #${warehouseId} không đủ: hiện có 0, cần xuất ${Math.abs(delta)}`);
    }
    await stockRepo.upsertStock(conn, warehouseId, productId, allowNegative ? delta : Math.max(delta, 0), 0);
  }
}

/**
 * [Phase2-Fix DB-03] Nhập kho kèm cập nhật avg_unit_price per-warehouse.
 *
 * Spec IV: Moving Average Weighted Cost phải tính per-warehouse:
 *   new_avg = (qty_before * avg_before + import_qty * import_price) / qty_after
 *
 * Information Expert: logic costing tập trung tại stockHelper, không rải ở routes.
 * Chỉ dùng khi INBOUND — xuất/chuyển kho dùng adjustWarehouseStock.
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} warehouseId
 * @param {number} productId
 * @param {number} delta           - số lượng nhập (> 0, đơn vị base)
 * @param {number} importPricePerBase - giá nhập per base unit (0 = giữ avg cũ)
 * @returns {Promise<number>}      - avg_unit_price mới đã làm tròn 2 chữ số
 */
async function adjustWarehouseStockWithCost(conn, warehouseId, productId, delta, importPricePerBase) {
  if (!warehouseId || !productId || delta <= 0) return 0;

  const existing = await stockRepo.findStock(conn, warehouseId, productId, true);

  const qtyBefore = existing ? Number(existing.stock_qty) : 0;
  const avgBefore = existing ? Number(existing.avg_unit_price || 0) : 0;

  const newAvg = computeMovingAverage(qtyBefore, avgBefore, delta, importPricePerBase);

  await stockRepo.upsertStock(conn, warehouseId, productId, delta, newAvg);

  return newAvg;
}

/**
 * Đặt tồn kho của 1 sản phẩm tại 1 kho thành giá trị tuyệt đối.
 * Dùng sau kiểm kê (stocktaking) để ghi đúng số thực tế.
 */
async function setWarehouseStock(conn, warehouseId, productId, qty) {
  if (!warehouseId || !productId) return;
  const safeQty = Math.max(0, Number(qty) || 0);

  if (safeQty === 0) {
    // Kho trống: reset cả stock_qty VÀ avg_unit_price về 0
    await conn.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, stock_qty, avg_unit_price)
       VALUES (?, ?, 0, 0)
       ON DUPLICATE KEY UPDATE
         stock_qty       = 0,
         avg_unit_price  = 0,
         updated_at      = NOW()`,
      [warehouseId, productId]
    );
  } else {
    // Kho còn hàng: chỉ set stock_qty, giữ nguyên avg_unit_price
    await conn.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, stock_qty, avg_unit_price)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         stock_qty  = VALUES(stock_qty),
         updated_at = NOW()`,
      [warehouseId, productId, safeQty]
    );
  }
}

/**
 * Tăng / giảm reserved_quantity tại 1 kho cụ thể.
 * Gọi khi APPROVE export order (delta > 0) hoặc CANCEL/COMPLETE (delta < 0).
 */
async function adjustWarehouseReserved(conn, warehouseId, productId, delta) {
  if (!warehouseId || !productId || delta === 0) return;
  if (delta > 0) {
    await stockRepo.increaseReservation(conn, warehouseId, productId, delta);
  } else {
    await stockRepo.decreaseReservation(conn, warehouseId, productId, Math.abs(delta));
  }
}

/**
 * [Phase1-Fix DB-02 / BE-01] Quy đổi số lượng về đơn vị cơ sở (base unit).
 */
async function convertToBaseUnit(conn, fromUnitId, toUnitId, quantity) {
  const qty = Number(quantity) || 0;

  if (!fromUnitId || !toUnitId) return qty;
  if (fromUnitId === toUnitId) return qty;

  const [[direct]] = await conn.query(
    'SELECT ratio FROM unit_conversions WHERE from_unit_id = ? AND to_unit_id = ?',
    [fromUnitId, toUnitId]
  );
  if (direct) return Math.round(qty * Number(direct.ratio));

  const [[reverse]] = await conn.query(
    'SELECT ratio FROM unit_conversions WHERE from_unit_id = ? AND to_unit_id = ?',
    [toUnitId, fromUnitId]
  );
  if (reverse && Number(reverse.ratio) > 0) return Math.round(qty / Number(reverse.ratio));

  console.warn(`[stockHelper] Không tìm thấy conversion từ unitId=${fromUnitId} → ${toUnitId}. Trả về qty gốc.`);
  return qty;
}

/**
 * Ghi sổ cái tồn kho (Audit Trail).
 * Lấy running_balance từ warehouse_stock sau khi đã thay đổi.
 */
async function writeStockLedger(conn, {
  warehouseId, productId, transactionId, transactionType,
  quantityChange, costPerUnit = 0, referenceType, referenceId,
  note, createdBy
}) {
  if (!warehouseId || !productId) return;

  const [[ws]] = await conn.query(
    'SELECT stock_qty FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
    [warehouseId, productId]
  );
  const runningBalance = ws ? ws.stock_qty : 0;
  const costImpact = Math.round(quantityChange * costPerUnit * 100) / 100;

  await conn.query(
    `INSERT INTO stock_ledger 
       (warehouse_id, product_id, transaction_id, transaction_type, 
        quantity_change, running_balance, cost_per_unit, cost_impact, 
        reference_type, reference_id, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      warehouseId, productId, transactionId, transactionType,
      quantityChange, runningBalance, costPerUnit, costImpact,
      referenceType, referenceId, note, createdBy
    ]
  );
}

module.exports = {
  adjustWarehouseStock,
  adjustWarehouseStockWithCost,
  adjustWarehouseReserved,
  setWarehouseStock,
  convertToBaseUnit,
  writeStockLedger,
};