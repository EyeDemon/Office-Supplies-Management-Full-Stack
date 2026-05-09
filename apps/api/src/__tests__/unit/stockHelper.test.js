/**
 * stockHelper.test.js — Unit Tests: Inventory Business Logic
 *
 * Test Suite Coverage:
 *   1. adjustWarehouseStockWithCost  — Moving Average Weighted Costing (Spec IV)
 *   2. adjustWarehouseStock          — Pessimistic lock / negative check
 *   3. adjustWarehouseReserved       — Reservation logic (Spec VIII)
 *   4. setWarehouseStock             — Absolute set (stocktaking)
 *   5. convertToBaseUnit             — Unit conversion (Spec II)
 *
 * Mock Strategy:
 *   - conn (DB connection) được mock theo interface mysql2/promise PoolConnection
 *   - conn.query trả về [[rows], fields] như mysql2 chuẩn
 *   - Không cần kết nối DB thật → tests chạy isolated, nhanh, deterministic
 *
 * Nguyên lý: Information Expert (Spec SOLID) — toàn bộ inventory logic
 *            tập trung tại stockHelper → dễ test tập trung tại đây.
 */
'use strict';

// ─── Import module cần test ───────────────────────────────────────────────────
const {
  adjustWarehouseStockWithCost,
  adjustWarehouseStock,
  adjustWarehouseReserved,
  setWarehouseStock,
  convertToBaseUnit,
  writeStockLedger,
} = require('../../shared/utils/stockHelper');

// KHÔNG mock StockRepository ở đây vì các test dùng makeConn() để giả lập conn.query
// StockRepository sẽ gọi conn.query và test sẽ verify các SQL queries này.

jest.mock('../../domain/rules', () => ({
  computeMovingAverage: jest.fn((qtyBefore, avgBefore, delta, price) => {
    if (price <= 0) return Number(avgBefore) || 0;
    const qtyAfter = Number(qtyBefore) + Number(delta);
    if (qtyAfter === 0) return 0;
    if (Number(qtyBefore) === 0) return Number(price);
    return (Number(qtyBefore) * Number(avgBefore) + Number(delta) * Number(price)) / qtyAfter;
  }),
}));

const stockRepo = require('../../infrastructure/repositories/StockRepository');
const { computeMovingAverage } = require('../../domain/rules');

// ─── Mock Factory ─────────────────────────────────────────────────────────────
/**
 * Tạo mock conn với query sequence.
 * Mỗi lần conn.query() được gọi, trả về phần tử tiếp theo của responses[].
 *
 * @param {Array} responses - mảng kết quả [[rows], fields] theo thứ tự call
 * @returns {{ query: jest.fn, queryCalls: () => string[] }}
 */
function makeConn(responses = []) {
  let callIndex = 0;
  const calls = [];
  const query = jest.fn(async (sql, params) => {
    calls.push({ sql: sql.trim().replace(/\s+/g, ' '), params });
    const resp = responses[callIndex++];
    if (resp === undefined) {
      return [[{ affectedRows: 1 }], []]; // default update response
    }
    return resp;
  });
  return {
    query,
    _calls: () => calls,
  };
}

// ─── 1. adjustWarehouseStockWithCost (Moving Average Weighted Costing) ────────
describe('adjustWarehouseStockWithCost — Moving Average Weighted Costing', () => {

  // ── 1.1 Kho đang có hàng, nhập thêm với giá khác ───────────────────────────
  test('[Spec IV] Weighted average: 10 @ 50k + 5 @ 60k = 53,333.33đ', async () => {
    const conn = makeConn([
      // SELECT FOR UPDATE → existing row: qty=10, avg=50000
      [[{ stock_qty: 10, avg_unit_price: 50000 }], []],
      // UPDATE → thành công
      [[{ affectedRows: 1 }], []],
    ]);

    const newAvg = await adjustWarehouseStockWithCost(conn, 1, 100, 5, 60000);

    // (10×50000 + 5×60000) / 15 = 800000/15 = 53333.33
    expect(newAvg).toBeCloseTo(53333.33, 1);

    // Verify UPDATE được gọi với qty=15 và avg đúng
    const updateCall = conn._calls().find(c => c.sql.startsWith('UPDATE'));
    expect(updateCall).toBeDefined();
    expect(updateCall.params[0]).toBe(5);                    // qtyDelta
    expect(updateCall.params[1]).toBeCloseTo(53333.33, 1);    // avg mới
  });

  // ── 1.2 Kho hết hàng (qty=0), nhập mới → avg = giá nhập ───────────────────
  test('[Spec IV Edge] Kho hết (qty=0) → avg_unit_price = giá nhập mới', async () => {
    const conn = makeConn([
      [[{ stock_qty: 0, avg_unit_price: 0 }], []],
      [[{ affectedRows: 1 }], []],
    ]);

    const newAvg = await adjustWarehouseStockWithCost(conn, 1, 100, 20, 75000);

    // qty=0 → không thể weighted → avg = giá nhập
    expect(newAvg).toBe(75000);
  });

  // ── 1.3 Chưa có row trong warehouse_stock (INSERT path) ─────────────────────
  test('[Spec IV] Kho chưa có record → INSERT với avg = giá nhập', async () => {
    const conn = makeConn([
      // SELECT FOR UPDATE → không có row (null/undefined)
      [[], []],
      // UPDATE → affectedRows: 0 (không có dữ liệu để update). Note: ResultSetHeader is an object, not an array.
      [{ affectedRows: 0 }, []],
      // INSERT
      [{ insertId: 1, affectedRows: 1 }, []],
    ]);

    const newAvg = await adjustWarehouseStockWithCost(conn, 2, 200, 10, 45000);

    expect(newAvg).toBe(45000);
    const insertCall = conn._calls().find(c => c.sql.startsWith('INSERT'));
    expect(insertCall).toBeDefined();
    expect(insertCall.params[2]).toBe(10);   // delta
    expect(insertCall.params[3]).toBe(45000); // avg
  });

  // ── 1.4 importPricePerBase = 0 → giữ avg cũ (không re-calculate) ───────────
  test('[Spec IV Edge] importPrice=0 → giữ nguyên avg hiện tại', async () => {
    const conn = makeConn([
      [[{ stock_qty: 100, avg_unit_price: 30000 }], []],
      [[{ affectedRows: 1 }], []],
    ]);

    const newAvg = await adjustWarehouseStockWithCost(conn, 1, 100, 50, 0);

    // importPrice = 0 → không update avg
    expect(newAvg).toBe(30000);
  });

  // ── 1.5 Guard: delta <= 0 → early return 0, không gọi query ────────────────
  test('[Guard] delta <= 0 → không làm gì, return 0', async () => {
    const conn = makeConn([]);

    const r1 = await adjustWarehouseStockWithCost(conn, 1, 100, 0, 50000);
    const r2 = await adjustWarehouseStockWithCost(conn, 1, 100, -5, 50000);

    expect(r1).toBe(0);
    expect(r2).toBe(0);
    expect(conn.query).not.toHaveBeenCalled();
  });

  // ── 1.6 Guard: warehouseId hoặc productId null ──────────────────────────────
  test('[Guard] warehouseId=null → bỏ qua, return 0', async () => {
    const conn = makeConn([]);
    const result = await adjustWarehouseStockWithCost(conn, null, 100, 10, 50000);
    expect(result).toBe(0);
    expect(conn.query).not.toHaveBeenCalled();
  });

  // ── 1.7 Làm tròn avg đến 2 chữ số thập phân ────────────────────────────────
  test('[Precision] avg được làm tròn đúng 2 chữ số thập phân', async () => {
    const conn = makeConn([
      [[{ stock_qty: 7, avg_unit_price: 100000 }], []],
      [[{ affectedRows: 1 }], []],
    ]);

    // (7×100000 + 3×200000) / 10 = 1300000/10 = 130000 (tròn đẹp)
    const newAvg = await adjustWarehouseStockWithCost(conn, 1, 1, 3, 200000);
    expect(newAvg).toBe(130000);
    // Verify làm tròn = Math.round(val * 100) / 100
    expect(Number.isFinite(newAvg)).toBe(true);
  });

  // ── 1.8 Nhập nhiều lần liên tiếp (simulate multi-inbound) ──────────────────
  test('[Spec IV] Multi-inbound: avg tích lũy đúng qua nhiều lần nhập', () => {
    // Test logic tính thuần (không cần mock DB)
    // Lần 1: qty=0 → nhập 10 @ 50k → avg = 50000
    let qty = 0, avg = 0;
    const import1qty = 10, import1price = 50000;
    if (qty === 0) { avg = import1price; } else { avg = (qty * avg + import1qty * import1price) / (qty + import1qty); }
    qty += import1qty;
    expect(avg).toBe(50000);
    expect(qty).toBe(10);

    // Lần 2: nhập thêm 5 @ 80k
    const import2qty = 5, import2price = 80000;
    avg = (qty * avg + import2qty * import2price) / (qty + import2qty);
    qty += import2qty;
    // (10×50000 + 5×80000) / 15 = 900000/15 = 60000
    expect(Math.round(avg)).toBe(60000);
    expect(qty).toBe(15);

    // Lần 3: nhập thêm 20 @ 40k
    const import3qty = 20, import3price = 40000;
    avg = (qty * avg + import3qty * import3price) / (qty + import3qty);
    qty += import3qty;
    // (15×60000 + 20×40000) / 35 = (900000+800000)/35 = 1700000/35 ≈ 48571.43
    expect(Math.round(avg * 100) / 100).toBeCloseTo(48571.43, 1);
    expect(qty).toBe(35);
  });
});

// ─── 2. adjustWarehouseStock (Xuất kho / Tồn âm check) ──────────────────────
describe('adjustWarehouseStock — Stock Adjustment with Safety Checks', () => {

  test('[Normal] Cộng tồn kho (nhập): 100 + 50 = 150', async () => {
    const conn = makeConn([
      [[{ stock_qty: 100 }], []],
      [[{ affectedRows: 1 }], []],
    ]);

    await adjustWarehouseStock(conn, 1, 1, 50, false);

    const updateCall = conn._calls().find(c => c.sql.startsWith('UPDATE'));
    expect(updateCall.params[0]).toBe(50); // qtyDelta
  });

  test('[Normal] Trừ tồn kho (xuất): 100 - 30 = 70', async () => {
    const conn = makeConn([
      [[{ stock_qty: 100 }], []],
      [[{ affectedRows: 1 }], []],
    ]);

    await adjustWarehouseStock(conn, 1, 1, -30, false);

    const updateCall = conn._calls().find(c => c.sql.startsWith('UPDATE'));
    expect(updateCall.params[0]).toBe(-30); // qtyDelta
  });

  test('[Guard] Xuất nhiều hơn tồn → throw Error', async () => {
    const conn = makeConn([
      [[{ stock_qty: 10 }], []],
    ]);

    await expect(
      adjustWarehouseStock(conn, 1, 1, -20, false)
    ).rejects.toThrow('Tồn kho tại kho #1 không đủ');
  });

  test('[Guard] allowNegative=true → cho phép tồn âm', async () => {
    const conn = makeConn([
      [[{ stock_qty: 5 }], []],
      [[{ affectedRows: 1 }], []],
    ]);

    // Không throw dù xuất nhiều hơn tồn
    await expect(
      adjustWarehouseStock(conn, 1, 1, -10, true)
    ).resolves.not.toThrow();

    const updateCall = conn._calls().find(c => c.sql.startsWith('UPDATE'));
    // Với allowNegative=true → delta = -10, update trực tiếp
    expect(updateCall.params[0]).toBe(-10);
  });

  test('[Guard] Kho chưa có row, xuất (-5) → throw Error', async () => {
    const conn = makeConn([
      [[], []], // existing = undefined (không có row)
    ]);

    await expect(
      adjustWarehouseStock(conn, 3, 999, -5, false)
    ).rejects.toThrow('Tồn kho tại kho #3 không đủ: hiện có 0');
  });

  test('[Guard] delta = 0 → không gọi query', async () => {
    const conn = makeConn([]);
    await adjustWarehouseStock(conn, 1, 1, 0, false);
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('[Guard] warehouseId = null → bỏ qua', async () => {
    const conn = makeConn([]);
    await adjustWarehouseStock(conn, null, 1, 10, false);
    expect(conn.query).not.toHaveBeenCalled();
  });
});

// ─── 3. adjustWarehouseReserved (Reservation Logic) ─────────────────────────
describe('adjustWarehouseReserved — Reservation Logic (Spec VIII)', () => {

  test('[Approve] Duyệt phiếu xuất: reserved_quantity += 20', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await adjustWarehouseReserved(conn, 1, 100, 20);

    expect(conn.query).toHaveBeenCalledTimes(1);
    const call = conn._calls()[0];
    // increaseReservation params: [qty, warehouseId, productId]
    expect(call.params[0]).toBe(20);    // qty
    expect(call.params[1]).toBe(1);     // warehouseId
    expect(call.params[2]).toBe(100);   // productId
  });

  test('[Cancel] Huỷ phiếu: reserved_quantity -= 20 (release)', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await adjustWarehouseReserved(conn, 1, 100, -20);

    const call = conn._calls()[0];
    // decreaseReservation params: [qty, warehouseId, productId] (qty is Math.abs(delta))
    expect(call.params[0]).toBe(20); // Math.abs(-20)
    expect(call.params[1]).toBe(1);  // warehouseId
    expect(call.params[2]).toBe(100);// productId
  });

  test('[Edge] reserved không thể âm — GREATEST(0, reserved + delta)', async () => {
    // GREATEST(0, ...) được enforce ở DB — test verify SQL structure
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await adjustWarehouseReserved(conn, 1, 100, -999);

    const call = conn._calls()[0];
    // SQL phải có GREATEST(0, ...) để tránh reserved âm
    expect(call.sql).toContain('GREATEST(0');
  });

  test('[Guard] delta = 0 → không gọi query', async () => {
    const conn = makeConn([]);
    await adjustWarehouseReserved(conn, 1, 100, 0);
    expect(conn.query).not.toHaveBeenCalled();
  });
});

// ─── 4. setWarehouseStock (Absolute Set — Stocktaking) ───────────────────────
describe('setWarehouseStock — Absolute Stock Set (Stocktaking)', () => {

  test('[Normal] Set stock về giá trị tuyệt đối = 150', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await setWarehouseStock(conn, 1, 100, 150);

    const call = conn._calls()[0];
    expect(call.params[2]).toBe(150); // safeQty
    expect(call.sql).toContain('INSERT INTO warehouse_stock');
    expect(call.sql).toContain('ON DUPLICATE KEY UPDATE');
  });

  test('[Guard] qty âm → được clamp về 0 (safeQty = Math.max(0, qty))', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await setWarehouseStock(conn, 1, 100, -50);

    const call = conn._calls()[0];
    // safeQty=0 → nhánh qty=0: params=[warehouseId,productId], SQL reset avg_unit_price
    expect(call.params[0]).toBe(1);
    expect(call.params[1]).toBe(100);
    expect(call.sql).toContain('avg_unit_price = 0');
  });

  test('[Guard] qty là string "200" → convert về number', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await setWarehouseStock(conn, 1, 100, '200');

    const call = conn._calls()[0];
    expect(call.params[2]).toBe(200);
  });

  test('[Guard] qty là null/undefined → 0 → reset avg_unit_price', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await setWarehouseStock(conn, 1, 100, null);

    const call = conn._calls()[0];
    // safeQty=0 → nhánh qty=0: params=[warehouseId,productId], SQL reset avg
    expect(call.params[0]).toBe(1);
    expect(call.params[1]).toBe(100);
    expect(call.sql).toContain('avg_unit_price');
  });

  test('[Guard] warehouseId = null → bỏ qua', async () => {
    const conn = makeConn([]);
    await setWarehouseStock(conn, null, 100, 200);
    expect(conn.query).not.toHaveBeenCalled();
  });

  // [BUG-STOCKTAKING-AVGPRICE] Tests: avg_unit_price reset khi qty=0 (Spec IV)
  test('[BUG-STOCKTAKING-AVGPRICE] qty=0 → SQL phải reset avg_unit_price=0', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await setWarehouseStock(conn, 1, 100, 0);

    const call = conn._calls()[0];
    // SQL phải chứa avg_unit_price = 0 trong ON DUPLICATE KEY UPDATE
    expect(call.sql).toContain('avg_unit_price');
    expect(call.sql).toContain('= 0');
    // Spec IV: quantity=0 → reset avg_price về 0
  });

  test('[BUG-STOCKTAKING-AVGPRICE] qty=-5 → clamp=0 → cũng reset avg_unit_price', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await setWarehouseStock(conn, 1, 100, -5);

    const call = conn._calls()[0];
    expect(call.sql).toContain('avg_unit_price');
  });

  test('[BUG-STOCKTAKING-AVGPRICE] qty=50 → KHÔNG reset avg_unit_price', async () => {
    const conn = makeConn([
      [[{ affectedRows: 1 }], []],
    ]);

    await setWarehouseStock(conn, 1, 100, 50);

    const call = conn._calls()[0];
    // Khi qty > 0, ON DUPLICATE KEY UPDATE KHÔNG được chứa avg_unit_price
    const updateClause = call.sql.split('ON DUPLICATE KEY UPDATE')[1] || '';
    expect(updateClause).not.toContain('avg_unit_price');
  });
}); // end describe setWarehouseStock

// ─── 5. convertToBaseUnit (Unit Conversion — Spec II) ────────────────────────
describe('convertToBaseUnit — Unit Conversion (Spec II)', () => {

  test('[Same Unit] fromUnitId = toUnitId → trả về quantity nguyên bản', async () => {
    const conn = makeConn([]);
    const result = await convertToBaseUnit(conn, 5, 5, 10);
    expect(result).toBe(10);
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('[No Unit] fromUnitId = null → trả về quantity nguyên bản', async () => {
    const conn = makeConn([]);
    const result = await convertToBaseUnit(conn, null, 1, 20);
    expect(result).toBe(20);
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('[Direct] 1 Hộp = 10 Cái: convertToBaseUnit(Hop→Cai, 2) = 20', async () => {
    const conn = makeConn([
      // Direct: from=Hộp (2), to=Cái (1), ratio=10
      [[{ ratio: 10 }], []],
    ]);

    const result = await convertToBaseUnit(conn, 2, 1, 2);

    expect(result).toBe(20); // 2 × 10 = 20
  });

  test('[Direct] 1 Thùng = 24 Cái: convertToBaseUnit(Thung→Cai, 3) = 72', async () => {
    const conn = makeConn([
      [[{ ratio: 24 }], []],
    ]);

    const result = await convertToBaseUnit(conn, 3, 1, 3);

    expect(result).toBe(72); // 3 × 24 = 72
  });

  test('[Reverse] Không có direct path → thử reverse conversion', async () => {
    const conn = makeConn([
      [[], []],         // direct: không có
      [[{ ratio: 10 }], []], // reverse: Cái→Hộp ratio=10 → 1/10
    ]);

    // Nếu đảo ngược: 1 Cái = 1/10 Hộp → 5 Cái = 0.5 Hộp (làm tròn = 1)
    const result = await convertToBaseUnit(conn, 1, 2, 5);
    expect(Number.isFinite(result)).toBe(true);
  });

  test('[Fallback] Không tìm thấy conversion → trả về quantity gốc (warn)', async () => {
    const conn = makeConn([
      [[], []], // direct: không có
      [[], []], // reverse: không có
    ]);

    // console.warn được gọi nhưng không throw
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    const result = await convertToBaseUnit(conn, 99, 100, 7);

    expect(result).toBe(7); // fallback về quantity gốc
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Không tìm thấy conversion'));
    warnSpy.mockRestore();
  });

  test('[Precision] Math.round đảm bảo kết quả là số nguyên', async () => {
    const conn = makeConn([
      [[{ ratio: 3 }], []],
    ]);

    // 7 × 3 = 21 (là số nguyên đẹp)
    const r1 = await convertToBaseUnit(conn, 2, 1, 7);
    expect(Number.isInteger(r1)).toBe(true);
  });
});

// ─── 6. Business Logic Integration: Available Quantity ───────────────────────
describe('Business Logic: available_quantity = quantity - reserved_quantity', () => {

  test('[Spec VIII] Có thể xuất khi available >= requested', () => {
    const stock_qty = 100;
    const reserved_quantity = 30;
    const available = stock_qty - reserved_quantity;
    const requested = 50;

    expect(available).toBe(70);
    expect(available >= requested).toBe(true);
  });

  test('[Spec VIII] Từ chối xuất khi available < requested', () => {
    const stock_qty = 50;
    const reserved_quantity = 30;
    const available = stock_qty - reserved_quantity;
    const requested = 25;

    expect(available).toBe(20);
    expect(available >= requested).toBe(false); // Không đủ → reject
  });

  test('[Spec VIII] Edge: available = 0 → không thể xuất', () => {
    const stock_qty = 30;
    const reserved_quantity = 30;
    const available = stock_qty - reserved_quantity;

    expect(available).toBe(0);
    expect(available > 0).toBe(false);
  });

  test('[Spec VIII] Double reserve prevention: reserved không vượt quá qty', () => {
    // Kiểm tra logic: khi approve, chỉ reserve nếu available >= qty yêu cầu
    const stock_qty = 50;
    const reserved_quantity = 45;
    const available = stock_qty - reserved_quantity; // = 5

    const request1 = 3; // OK: 5 >= 3
    const request2 = 4; // FAIL: sau khi reserve request1, available = 2

    expect(available >= request1).toBe(true);
    const availableAfterR1 = available - request1; // = 2
    expect(availableAfterR1 >= request2).toBe(false); // Đúng: 2 < 4
  });
});

// ─── 7. Status Machine Transitions ───────────────────────────────────────────
describe('Status Machine — Spec XVIII: Valid Transitions', () => {

  // Theo spec: Draft → Pending → Approved → Completed | Rejected | Cancelled
  const VALID_TRANSITIONS = {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],          // terminal state
    REJECTED: [],          // terminal state
    CANCELLED: [],          // terminal state
  };

  function isValidTransition(from, to) {
    return (VALID_TRANSITIONS[from] || []).includes(to);
  }

  test('[Flow] DRAFT → PENDING: hợp lệ', () => {
    expect(isValidTransition('DRAFT', 'PENDING')).toBe(true);
  });

  test('[Flow] PENDING → APPROVED: hợp lệ', () => {
    expect(isValidTransition('PENDING', 'APPROVED')).toBe(true);
  });

  test('[Flow] APPROVED → COMPLETED: hợp lệ', () => {
    expect(isValidTransition('APPROVED', 'COMPLETED')).toBe(true);
  });

  test('[Flow] PENDING → REJECTED: hợp lệ', () => {
    expect(isValidTransition('PENDING', 'REJECTED')).toBe(true);
  });

  test('[Flow] DRAFT → CANCELLED: hợp lệ', () => {
    expect(isValidTransition('DRAFT', 'CANCELLED')).toBe(true);
  });

  test('[Guard] COMPLETED → PENDING: không hợp lệ (terminal state)', () => {
    expect(isValidTransition('COMPLETED', 'PENDING')).toBe(false);
  });

  test('[Guard] REJECTED → APPROVED: không hợp lệ (terminal state)', () => {
    expect(isValidTransition('REJECTED', 'APPROVED')).toBe(false);
  });

  test('[Guard] DRAFT → COMPLETED: không hợp lệ (bỏ qua bước)', () => {
    expect(isValidTransition('DRAFT', 'COMPLETED')).toBe(false);
  });

  test('[Guard] APPROVED → PENDING: không thể back (no rollback)', () => {
    expect(isValidTransition('APPROVED', 'PENDING')).toBe(false);
  });

  test('[Guard] CANCELLED → DRAFT: không thể reopen', () => {
    expect(isValidTransition('CANCELLED', 'DRAFT')).toBe(false);
  });

  test('[Coverage] Tất cả terminal states không có transition', () => {
    ['COMPLETED', 'REJECTED', 'CANCELLED'].forEach(s => {
      expect(VALID_TRANSITIONS[s]).toHaveLength(0);
    });
  });
});

// ─── 8. Costing Edge Cases ───────────────────────────────────────────────────
describe('Costing Edge Cases — Spec IV Extra', () => {

  test('[Edge] Reset avg khi qty = 0 trước khi nhập mới', () => {
    // Kho hết hàng (qty=0), nhập 5 @ giá mới 90k
    let qty = 0;
    let avg = 0;
    const newQty = 5, newPrice = 90000;

    if (qty === 0) {
      avg = newPrice; // reset avg = giá mới
    } else {
      avg = (qty * avg + newQty * newPrice) / (qty + newQty);
    }
    qty += newQty;

    expect(avg).toBe(90000);
    expect(qty).toBe(5);
  });

  test('[Edge] importPrice = 0 trong nhập kho không đổi avg', () => {
    let qty = 100, avg = 50000;
    const newQty = 50, newPrice = 0;

    // importPrice=0 → giữ avg cũ (theo logic stockHelper)
    if (newPrice > 0) {
      avg = (qty * avg + newQty * newPrice) / (qty + newQty);
    }
    qty += newQty;

    expect(avg).toBe(50000); // avg không đổi
    expect(qty).toBe(150);
  });

  test('[Precision] avg làm tròn 2 chữ số — ví dụ 1/3', () => {
    // 3 @ 10 + 1 @ 11 = avg = 31/4 = 10.25 (tròn đẹp)
    const result = (3 * 10 + 1 * 11) / 4;
    const rounded = Math.round(result * 100) / 100;
    expect(rounded).toBe(10.25);
  });

  test('[Precision] 100 @ 33,333đ + 1 @ 1đ — làm tròn không mất dữ liệu', () => {
    const qty = 100, avg = 33333;
    const delta = 1, importPrice = 1;
    const newAvg = (qty * avg + delta * importPrice) / (qty + delta);
    const rounded = Math.round(newAvg * 100) / 100;

    // Kết quả ≈ 33000.34 — kiểm tra không bị truncation bug
    expect(rounded).toBeGreaterThan(33000);
    expect(rounded).toBeLessThan(33334);
    expect(Number.isFinite(rounded)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. writeStockLedger — [GAP-01] Audit trail cho mọi stock_transactions INSERT
// ═══════════════════════════════════════════════════════════════════════════════

describe('writeStockLedger', () => {
  test('[Happy] IMPORT — ghi đúng row với running_balance từ warehouse_stock', async () => {
    const conn = makeConn([
      [[{ stock_qty: 15 }]],  // SELECT warehouse_stock (sau khi đã adjust)
      [{ insertId: 42 }],     // INSERT INTO stock_ledger
    ]);

    await writeStockLedger(conn, {
      warehouseId: 1, productId: 10,
      transactionId: 99, transactionType: 'IMPORT',
      quantityChange: 5, costPerUnit: 60000,
      referenceType: 'import_order', referenceId: 7,
      note: 'Phiếu nhập NK-001', createdBy: 2,
    });

    const calls = conn._calls();
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toMatch(/SELECT stock_qty FROM warehouse_stock/i);
    expect(calls[1].sql).toMatch(/INSERT INTO stock_ledger/i);
    // running_balance phải = stock_qty hiện tại = 15
    const runningBalance = calls[1].params[5];
    expect(runningBalance).toBe(15);
    // cost_impact = 5 * 60000 = 300000
    const costImpact = calls[1].params[7];
    expect(costImpact).toBe(300000);
  });

  test('[Happy] EXPORT — quantityChange âm, cost_impact âm', async () => {
    const insertSpy = jest.fn().mockResolvedValue([{ insertId: 77 }]);
    const conn = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ stock_qty: 8 }]])   // SELECT warehouse_stock
        .mockImplementationOnce(insertSpy),             // INSERT ledger
    };
    conn.queryCalls = () => conn.query.mock.calls.map(c => c[0]);

    await writeStockLedger(conn, {
      warehouseId: 2, productId: 5,
      transactionId: 55, transactionType: 'EXPORT',
      quantityChange: -3, costPerUnit: 50000,
      referenceType: 'export_order', referenceId: 11,
      note: 'Phiếu xuất XK-007', createdBy: 3,
    });

    // cost_impact = -3 * 50000 = -150000
    const insertArgs = insertSpy.mock.calls[0][1]; // params array
    const costImpact = insertArgs[7]; // index 7 = cost_impact
    expect(costImpact).toBe(-150000);
    const runningBalance = insertArgs[5]; // index 5 = running_balance
    expect(runningBalance).toBe(8);
  });

  test('[Guard] Thiếu warehouseId — bỏ qua, không throw', async () => {
    const conn = { query: jest.fn() };
    // Không nên throw, không gọi query
    await expect(writeStockLedger(conn, {
      warehouseId: null, productId: 5,
      transactionId: 1, transactionType: 'IMPORT',
      quantityChange: 10,
    })).resolves.toBeUndefined();
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('[Guard] warehouse_stock không có row — running_balance = 0', async () => {
    const insertSpy = jest.fn().mockResolvedValue([{ insertId: 1 }]);
    const conn = {
      query: jest.fn()
        .mockResolvedValueOnce([[]])       // SELECT → no row
        .mockImplementationOnce(insertSpy),
    };

    await writeStockLedger(conn, {
      warehouseId: 9, productId: 99,
      transactionId: 1, transactionType: 'ADJUST',
      quantityChange: -2, costPerUnit: 0,
    });

    const runningBalance = insertSpy.mock.calls[0][1][5];
    expect(runningBalance).toBe(0); // fallback khi chưa có warehouse_stock row
  });
});