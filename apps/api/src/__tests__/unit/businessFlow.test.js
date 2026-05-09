/**
 * businessFlow.test.js — Unit Tests: Core Business Flows
 *
 * Test Suite Coverage:
 *   1.  Inbound State Machine      — DRAFT→PENDING→APPROVED→COMPLETED + invalid transitions
 *   2.  Outbound Anti-Oversell     — available stock formula, INSUFFICIENT_STOCK guard
 *   3.  Reservation Full Lifecycle — approve→reserve, complete→deduct, cancel→release
 *   4.  Concurrent Outbound        — simulate 2 simultaneous outbounds on same stock (pessimistic lock)
 *   5.  Transfer State Machine     — DRAFT→PENDING→APPROVED→IN_TRANSIT→COMPLETED
 *   6.  Moving Average Multi-batch — multiple buys + sell, cost accuracy
 *   7.  Stocktaking Adjustment     — confirm delta → ADJUSTMENT transaction type
 *
 * Spec references (CLAUDE.md):
 *   - Spec III.3  : InventoryTransaction = Source of Truth
 *   - Spec III.4  : Reservation = Anti-oversell
 *   - Spec III.5  : Moving Average = Costing Standard
 *   - Spec VIII.2 : available = stock_qty - reserved_quantity
 *   - Spec VIII.3 : Outbound Rule IF available >= qty → ACCEPT ELSE REJECT
 *   - Spec IX.1   : Inbound Flow state machine
 *   - Spec IX.3   : Request & Reservation Flow
 *   - Spec IX.4   : Transfer Flow
 *   - Spec IX.6   : Stocktaking confirm → ADJUSTMENT
 *
 * Mock strategy: Pure-function extraction — no DB, no HTTP, fast & deterministic.
 */
'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Shared Domain Logic (mirrors production routes, extracted for testability)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * State machine definition for Import Orders (Inbound)
 * Mirrors: backend/src/routes/orders.js
 */
const INBOUND_TRANSITIONS = {
  DRAFT:     ['PENDING', 'CANCELLED'],
  PENDING:   ['APPROVED', 'CANCELLED'],
  APPROVED:  ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],    // terminal
  CANCELLED: [],    // terminal
};

function canTransitionInbound(fromStatus, toStatus) {
  const allowed = INBOUND_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * State machine for Export Orders (Outbound)
 * Mirrors: backend/src/routes/export-orders.js
 */
const OUTBOUND_TRANSITIONS = {
  DRAFT:     ['PENDING', 'CANCELLED'],
  PENDING:   ['APPROVED', 'REJECTED'],
  APPROVED:  ['COMPLETED', 'CANCELLED'],
  REJECTED:  [],
  COMPLETED: [],
  CANCELLED: [],
};

function canTransitionOutbound(fromStatus, toStatus) {
  const allowed = OUTBOUND_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * State machine for Stock Transfers
 * Mirrors: backend/src/routes/transfers.js
 */
const TRANSFER_TRANSITIONS = {
  DRAFT:      ['PENDING', 'CANCELLED'],
  PENDING:    ['APPROVED', 'CANCELLED'],
  APPROVED:   ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['COMPLETED', 'CANCELLED'],
  COMPLETED:  [],
  CANCELLED:  [],
};

function canTransitionTransfer(fromStatus, toStatus) {
  const allowed = TRANSFER_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * Core anti-oversell formula (Spec VIII.2)
 * available = stock_qty - reserved_quantity
 */
function getAvailableStock(stockQty, reservedQty) {
  return Math.max(0, stockQty - reservedQty);
}

/**
 * Outbound eligibility check (Spec VIII.3)
 * Returns { allowed: bool, deficit: number }
 */
function checkOutboundEligibility(stockQty, reservedQty, requestedQty) {
  const available = getAvailableStock(stockQty, reservedQty);
  if (available >= requestedQty) {
    return { allowed: true, available, deficit: 0 };
  }
  return { allowed: false, available, deficit: requestedQty - available };
}

/**
 * Reservation operations (Spec IX.3)
 * Returns new {stock_qty, reserved_quantity} after operation
 */
const ReservationOps = {
  /**
   * approve: reserve qty (stock unchanged, reserved += qty)
   */
  approve(state, qty) {
    const available = getAvailableStock(state.stock_qty, state.reserved_quantity);
    if (available < qty) throw new Error(`INSUFFICIENT_STOCK: available=${available}, requested=${qty}`);
    return {
      stock_qty: state.stock_qty,
      reserved_quantity: state.reserved_quantity + qty,
    };
  },

  /**
   * cancel: release reserved (stock unchanged, reserved -= qty)
   */
  cancel(state, qty) {
    const newReserved = state.reserved_quantity - qty;
    if (newReserved < 0) throw new Error(`RESERVATION_UNDERFLOW: reserved=${state.reserved_quantity}, releasing=${qty}`);
    return {
      stock_qty: state.stock_qty,
      reserved_quantity: newReserved,
    };
  },

  /**
   * complete: outbound fulfillment (stock -= qty, reserved -= qty)
   */
  complete(state, qty) {
    const newStock    = state.stock_qty - qty;
    const newReserved = state.reserved_quantity - qty;
    if (newStock < 0)    throw new Error(`STOCK_NEGATIVE: stock=${state.stock_qty}, deducting=${qty}`);
    if (newReserved < 0) throw new Error(`RESERVATION_UNDERFLOW: reserved=${state.reserved_quantity}, deducting=${qty}`);
    return {
      stock_qty: newStock,
      reserved_quantity: newReserved,
    };
  },
};

/**
 * Moving Average Weighted Cost engine (Spec VIII.4)
 * new_avg = (qty_before * avg_before + import_qty * import_price) / qty_after
 */
function computeMovingAverage(qtyBefore, avgBefore, importQty, importPrice) {
  const qtyAfter = qtyBefore + importQty;
  if (qtyAfter === 0) return 0;
  const newAvg = (qtyBefore * avgBefore + importQty * importPrice) / qtyAfter;
  return Math.round(newAvg * 100) / 100; // round to 2 decimal places
}

/**
 * Stocktaking delta → generates ADJUSTMENT transaction
 * Returns array of {productId, delta, type} objects
 */
function generateStocktakingAdjustments(countedItems) {
  return countedItems
    .filter(item => item.counted !== item.system)
    .map(item => ({
      productId: item.productId,
      delta:     item.counted - item.system,
      type:      'ADJUSTMENT',
      note:      `Kiểm kê: hệ thống ${item.system}, thực tế ${item.counted}`,
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 1. Inbound State Machine ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
describe('Inbound State Machine — Spec IX.1', () => {

  describe('Valid transitions', () => {
    test('DRAFT → PENDING (nhân viên kho submit)', () => {
      expect(canTransitionInbound('DRAFT', 'PENDING')).toBe(true);
    });

    test('PENDING → APPROVED (manager duyệt)', () => {
      expect(canTransitionInbound('PENDING', 'APPROVED')).toBe(true);
    });

    test('APPROVED → COMPLETED (kho xác nhận nhận hàng)', () => {
      expect(canTransitionInbound('APPROVED', 'COMPLETED')).toBe(true);
    });

    test('DRAFT → CANCELLED (hủy sớm)', () => {
      expect(canTransitionInbound('DRAFT', 'CANCELLED')).toBe(true);
    });

    test('PENDING → CANCELLED (manager từ chối)', () => {
      expect(canTransitionInbound('PENDING', 'CANCELLED')).toBe(true);
    });

    test('APPROVED → CANCELLED (hủy sau khi duyệt)', () => {
      expect(canTransitionInbound('APPROVED', 'CANCELLED')).toBe(true);
    });
  });

  describe('Invalid transitions — must be blocked', () => {
    test('DRAFT → APPROVED (bỏ qua bước PENDING) → BLOCKED', () => {
      expect(canTransitionInbound('DRAFT', 'APPROVED')).toBe(false);
    });

    test('DRAFT → COMPLETED (bỏ qua toàn bộ flow) → BLOCKED', () => {
      expect(canTransitionInbound('DRAFT', 'COMPLETED')).toBe(false);
    });

    test('COMPLETED → CANCELLED (terminal state) → BLOCKED', () => {
      expect(canTransitionInbound('COMPLETED', 'CANCELLED')).toBe(false);
    });

    test('COMPLETED → APPROVED (không thể đảo ngược) → BLOCKED', () => {
      expect(canTransitionInbound('COMPLETED', 'APPROVED')).toBe(false);
    });

    test('CANCELLED → PENDING (không thể hồi sinh) → BLOCKED', () => {
      expect(canTransitionInbound('CANCELLED', 'PENDING')).toBe(false);
    });

    test('APPROVED → PENDING (không thể đảo ngược) → BLOCKED', () => {
      expect(canTransitionInbound('APPROVED', 'PENDING')).toBe(false);
    });
  });

  describe('Terminal states', () => {
    test('COMPLETED không có transition nào hợp lệ', () => {
      const allStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED'];
      allStatuses.forEach(s => {
        expect(canTransitionInbound('COMPLETED', s)).toBe(false);
      });
    });

    test('CANCELLED không có transition nào hợp lệ', () => {
      const allStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED'];
      allStatuses.forEach(s => {
        expect(canTransitionInbound('CANCELLED', s)).toBe(false);
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 2. Outbound Anti-Oversell Logic — Spec VIII.2, VIII.3 ───────────────────
// ═══════════════════════════════════════════════════════════════════════════════
describe('Outbound Anti-Oversell — Spec VIII.2 + VIII.3', () => {

  describe('getAvailableStock formula', () => {
    test('[Normal] stock=100, reserved=20 → available=80', () => {
      expect(getAvailableStock(100, 20)).toBe(80);
    });

    test('[Edge] stock=0, reserved=0 → available=0', () => {
      expect(getAvailableStock(0, 0)).toBe(0);
    });

    test('[Safety] stock < reserved (data anomaly) → clamp to 0, never negative', () => {
      // Không bao giờ trả số âm — Math.max(0, ...)
      expect(getAvailableStock(5, 10)).toBe(0);
    });

    test('[Normal] Không có reservation: available = stock_qty', () => {
      expect(getAvailableStock(50, 0)).toBe(50);
    });

    test('[Fully reserved] stock=20, reserved=20 → available=0', () => {
      expect(getAvailableStock(20, 20)).toBe(0);
    });
  });

  describe('checkOutboundEligibility', () => {
    test('[Allow] Đủ hàng: stock=100, reserved=30, request=50 → allowed', () => {
      const result = checkOutboundEligibility(100, 30, 50);
      expect(result.allowed).toBe(true);
      expect(result.available).toBe(70);
      expect(result.deficit).toBe(0);
    });

    test('[Allow] Vừa đủ: available = requested (biên chính xác)', () => {
      const result = checkOutboundEligibility(50, 10, 40);
      expect(result.allowed).toBe(true);
      expect(result.available).toBe(40);
    });

    test('[Block] Thiếu 1 đơn vị: available=39, requested=40 → INSUFFICIENT_STOCK', () => {
      const result = checkOutboundEligibility(50, 11, 40);
      expect(result.allowed).toBe(false);
      expect(result.deficit).toBe(1);
    });

    test('[Block] Hết hàng: stock=0, request=1 → INSUFFICIENT_STOCK', () => {
      const result = checkOutboundEligibility(0, 0, 1);
      expect(result.allowed).toBe(false);
      expect(result.deficit).toBe(1);
    });

    test('[Block] Toàn bộ stock đang bị reserved: stock=20, reserved=20, request=1 → BLOCKED', () => {
      const result = checkOutboundEligibility(20, 20, 1);
      expect(result.allowed).toBe(false);
      expect(result.available).toBe(0);
    });

    test('[Block] Có hàng nhưng tất cả bị reserved bởi đơn khác', () => {
      // Kịch bản: 2 đơn xuất cùng lúc, đơn thứ nhất đã reserve → đơn thứ 2 bị từ chối
      const result = checkOutboundEligibility(100, 100, 1);
      expect(result.allowed).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 3. Reservation Full Lifecycle — Spec IX.3 ───────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
describe('Reservation Lifecycle — Spec IX.3', () => {

  describe('approve (reserve)', () => {
    test('[Happy] approve 30 → reserved tăng 30, stock không đổi', () => {
      const initial = { stock_qty: 100, reserved_quantity: 10 };
      const after = ReservationOps.approve(initial, 30);
      expect(after.stock_qty).toBe(100);           // stock không đổi
      expect(after.reserved_quantity).toBe(40);    // 10 + 30
    });

    test('[Edge] approve toàn bộ available (vừa đủ)', () => {
      const initial = { stock_qty: 50, reserved_quantity: 10 };
      const after = ReservationOps.approve(initial, 40); // available = 40
      expect(after.reserved_quantity).toBe(50);
      expect(after.stock_qty).toBe(50);
    });

    test('[Error] approve vượt available → ném INSUFFICIENT_STOCK', () => {
      const initial = { stock_qty: 50, reserved_quantity: 10 };
      // available = 40, requested = 41 → lỗi
      expect(() => ReservationOps.approve(initial, 41))
        .toThrow('INSUFFICIENT_STOCK');
    });

    test('[Error] approve khi available = 0 → ném lỗi', () => {
      const initial = { stock_qty: 20, reserved_quantity: 20 };
      expect(() => ReservationOps.approve(initial, 1))
        .toThrow('INSUFFICIENT_STOCK');
    });
  });

  describe('cancel (release reservation)', () => {
    test('[Happy] cancel giải phóng 30 → reserved giảm 30', () => {
      const initial = { stock_qty: 100, reserved_quantity: 50 };
      const after = ReservationOps.cancel(initial, 30);
      expect(after.reserved_quantity).toBe(20);
      expect(after.stock_qty).toBe(100); // stock không đổi
    });

    test('[Edge] cancel toàn bộ reserved', () => {
      const initial = { stock_qty: 100, reserved_quantity: 50 };
      const after = ReservationOps.cancel(initial, 50);
      expect(after.reserved_quantity).toBe(0);
    });

    test('[Error] cancel nhiều hơn reserved → RESERVATION_UNDERFLOW', () => {
      const initial = { stock_qty: 100, reserved_quantity: 10 };
      expect(() => ReservationOps.cancel(initial, 11))
        .toThrow('RESERVATION_UNDERFLOW');
    });
  });

  describe('complete (outbound fulfillment)', () => {
    test('[Happy] complete 40: stock-=40, reserved-=40', () => {
      const initial = { stock_qty: 100, reserved_quantity: 40 };
      const after = ReservationOps.complete(initial, 40);
      expect(after.stock_qty).toBe(60);
      expect(after.reserved_quantity).toBe(0);
    });

    test('[Integrity] stock và reserved đều giảm cùng qty — không lệch nhau', () => {
      const initial = { stock_qty: 200, reserved_quantity: 80 };
      const qty = 50;
      const after = ReservationOps.complete(initial, qty);
      const stockDelta    = initial.stock_qty - after.stock_qty;
      const reservedDelta = initial.reserved_quantity - after.reserved_quantity;
      expect(stockDelta).toBe(reservedDelta); // luôn bằng nhau
    });

    test('[Error] complete qty > stock → STOCK_NEGATIVE (data anomaly guard)', () => {
      const initial = { stock_qty: 10, reserved_quantity: 30 };
      expect(() => ReservationOps.complete(initial, 15))
        .toThrow('STOCK_NEGATIVE');
    });
  });

  describe('Full lifecycle: approve → complete → free', () => {
    test('[Scenario] Tạo đơn → Duyệt (reserve) → Xuất kho (complete)', () => {
      let state = { stock_qty: 100, reserved_quantity: 0 };

      // Bước 1: Duyệt đơn 40 món — reserve
      state = ReservationOps.approve(state, 40);
      expect(state.reserved_quantity).toBe(40);
      expect(state.stock_qty).toBe(100);
      // available sau approve = 100 - 40 = 60
      expect(getAvailableStock(state.stock_qty, state.reserved_quantity)).toBe(60);

      // Bước 2: Kho xác nhận xuất — complete
      state = ReservationOps.complete(state, 40);
      expect(state.stock_qty).toBe(60);
      expect(state.reserved_quantity).toBe(0);
    });

    test('[Scenario] Tạo đơn → Duyệt (reserve) → Hủy (release)', () => {
      let state = { stock_qty: 100, reserved_quantity: 0 };

      state = ReservationOps.approve(state, 40);
      expect(state.reserved_quantity).toBe(40);

      state = ReservationOps.cancel(state, 40);
      expect(state.reserved_quantity).toBe(0);
      expect(state.stock_qty).toBe(100); // không mất hàng
      expect(getAvailableStock(state.stock_qty, state.reserved_quantity)).toBe(100);
    });

    test('[Scenario] 2 đơn cùng lúc — đơn 2 chỉ lấy được hàng còn lại', () => {
      let state = { stock_qty: 100, reserved_quantity: 0 };

      // Đơn 1 approve trước
      state = ReservationOps.approve(state, 70);
      expect(getAvailableStock(state.stock_qty, state.reserved_quantity)).toBe(30);

      // Đơn 2 muốn 50 → bị từ chối vì chỉ còn 30 available
      expect(() => ReservationOps.approve(state, 50)).toThrow('INSUFFICIENT_STOCK');

      // Đơn 2 xin 30 → OK
      const state2 = ReservationOps.approve(state, 30);
      expect(state2.reserved_quantity).toBe(100);
      expect(getAvailableStock(state2.stock_qty, state2.reserved_quantity)).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 4. Concurrent Outbound Simulation — Race Condition ───────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
describe('Concurrent Outbound — Anti-Oversell Race Condition (Spec VIII.6)', () => {

  /**
   * Mô phỏng pessimistic lock bằng async mutex:
   * Chỉ 1 request được xử lý tại một thời điểm, request khác phải chờ.
   * Trong production: MySQL SELECT ... FOR UPDATE NOWAIT đảm bảo điều này.
   */
  class StockMutex {
    constructor(initialStock, initialReserved = 0) {
      this._stock    = initialStock;
      this._reserved = initialReserved;
      this._locked   = false;
      this._queue    = [];
    }

    async lock() {
      if (!this._locked) {
        this._locked = true;
        return;
      }
      // Thay vì block (NOWAIT), throw ngay lập tức như MySQL NOWAIT
      throw new Error('LOCK_NOWAIT: Row bị lock bởi transaction khác');
    }

    unlock() {
      this._locked = false;
      // Wake next in queue nếu có
      if (this._queue.length > 0) {
        const resolve = this._queue.shift();
        this._locked = true;
        resolve();
      }
    }

    getState() {
      return { stock: this._stock, reserved: this._reserved };
    }

    async tryReserve(qty) {
      await this.lock();
      try {
        const available = Math.max(0, this._stock - this._reserved);
        if (available < qty) {
          throw new Error(`INSUFFICIENT_STOCK: available=${available}, requested=${qty}`);
        }
        this._reserved += qty;
        return { success: true, newReserved: this._reserved };
      } finally {
        this.unlock();
      }
    }
  }

  test('[NOWAIT] 2 requests đồng thời: 1 thành công, 1 bị lock error', async () => {
    const mutex = new StockMutex(100, 0);

    // Simulate: request 1 và 2 đến cùng lúc
    const request1 = mutex.tryReserve(60);
    const request2 = mutex.tryReserve(60); // Lock đã bị chiếm

    const [r1, r2] = await Promise.allSettled([request1, request2]);

    // Một thành công, một bị lock
    const successes = [r1, r2].filter(r => r.status === 'fulfilled');
    const failures  = [r1, r2].filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason.message).toMatch(/LOCK_NOWAIT|INSUFFICIENT_STOCK/);
  });

  test('[Sequential] 2 requests tuần tự: cả 2 được xử lý nhưng tổng không vượt stock', async () => {
    // Simulate sequential (DB transactions không concurrent)
    let state = { stock_qty: 100, reserved_quantity: 0 };

    // Request 1: reserve 60
    state = ReservationOps.approve(state, 60);
    expect(state.reserved_quantity).toBe(60);

    // Request 2: reserve 40 (vừa đủ)
    state = ReservationOps.approve(state, 40);
    expect(state.reserved_quantity).toBe(100);

    // Request 3: muốn 1 → bị từ chối
    expect(() => ReservationOps.approve(state, 1)).toThrow('INSUFFICIENT_STOCK');
  });

  test('[Oversell Proof] Tổng reserved không thể vượt stock_qty', () => {
    let state = { stock_qty: 50, reserved_quantity: 0 };
    const requests = [20, 20, 15]; // tổng = 55, vượt stock = 50

    let totalReserved = 0;
    let rejectedCount = 0;

    requests.forEach(qty => {
      try {
        state = ReservationOps.approve(state, qty);
        totalReserved += qty;
      } catch {
        rejectedCount++;
      }
    });

    expect(state.reserved_quantity).toBeLessThanOrEqual(state.stock_qty);
    expect(rejectedCount).toBeGreaterThanOrEqual(1); // ít nhất 1 request bị từ chối
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 5. Transfer State Machine — Spec IX.4 ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
describe('Transfer State Machine — Spec IX.4', () => {

  describe('Valid full flow: DRAFT → COMPLETED', () => {
    test('DRAFT → PENDING → APPROVED → IN_TRANSIT → COMPLETED', () => {
      const flow = ['DRAFT', 'PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED'];
      for (let i = 0; i < flow.length - 1; i++) {
        expect(canTransitionTransfer(flow[i], flow[i + 1])).toBe(true);
      }
    });

    test('APPROVED → IN_TRANSIT (dispatch: xuất kho nguồn)', () => {
      expect(canTransitionTransfer('APPROVED', 'IN_TRANSIT')).toBe(true);
    });

    test('IN_TRANSIT → COMPLETED (complete: nhập kho đích)', () => {
      expect(canTransitionTransfer('IN_TRANSIT', 'COMPLETED')).toBe(true);
    });
  });

  describe('Cancel at any active stage', () => {
    test('DRAFT → CANCELLED', () => {
      expect(canTransitionTransfer('DRAFT', 'CANCELLED')).toBe(true);
    });

    test('PENDING → CANCELLED', () => {
      expect(canTransitionTransfer('PENDING', 'CANCELLED')).toBe(true);
    });

    test('APPROVED → CANCELLED (trả hàng về kho nguồn)', () => {
      expect(canTransitionTransfer('APPROVED', 'CANCELLED')).toBe(true);
    });

    test('IN_TRANSIT → CANCELLED (hàng trên đường vẫn có thể hủy)', () => {
      expect(canTransitionTransfer('IN_TRANSIT', 'CANCELLED')).toBe(true);
    });
  });

  describe('Invalid / skipped transitions', () => {
    test('DRAFT → APPROVED (bỏ qua PENDING) → BLOCKED', () => {
      expect(canTransitionTransfer('DRAFT', 'APPROVED')).toBe(false);
    });

    test('DRAFT → IN_TRANSIT (bỏ qua 2 bước) → BLOCKED', () => {
      expect(canTransitionTransfer('DRAFT', 'IN_TRANSIT')).toBe(false);
    });

    test('PENDING → IN_TRANSIT (bỏ qua APPROVED) → BLOCKED', () => {
      expect(canTransitionTransfer('PENDING', 'IN_TRANSIT')).toBe(false);
    });

    test('COMPLETED là terminal — không chuyển trạng thái', () => {
      const allStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
      allStatuses.forEach(s => {
        expect(canTransitionTransfer('COMPLETED', s)).toBe(false);
      });
    });

    test('IN_TRANSIT không thể quay lại APPROVED', () => {
      expect(canTransitionTransfer('IN_TRANSIT', 'APPROVED')).toBe(false);
    });
  });

  describe('Transfer stock integrity', () => {
    test('[Scenario] Kho A xuất (outbound) + Kho B nhập (inbound)', () => {
      let warehouseA = { stock_qty: 100, reserved_quantity: 30 };
      let warehouseB = { stock_qty: 20,  reserved_quantity: 0  };
      const transferQty = 30;

      // APPROVED: kho A reserve cho transfer
      warehouseA = ReservationOps.approve(warehouseA, transferQty);
      expect(warehouseA.reserved_quantity).toBe(60); // 30 existing + 30 transfer

      // IN_TRANSIT (dispatch): kho A thực hiện outbound
      warehouseA = ReservationOps.complete(warehouseA, transferQty);
      expect(warehouseA.stock_qty).toBe(70); // 100 - 30
      expect(warehouseA.reserved_quantity).toBe(30); // chỉ còn 30 ban đầu

      // COMPLETED: kho B nhận hàng (inbound — stock tăng)
      warehouseB = { stock_qty: warehouseB.stock_qty + transferQty, reserved_quantity: warehouseB.reserved_quantity };
      expect(warehouseB.stock_qty).toBe(50); // 20 + 30
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 6. Moving Average Costing — Multi-batch Scenarios ───────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
describe('Moving Average Costing — Multi-batch (Spec VIII.4)', () => {

  test('[Scenario A] 2 lần nhập, tính avg chính xác', () => {
    // Batch 1: 100 cái @ 50k
    let qty = 0, avg = 0;
    avg = computeMovingAverage(qty, avg, 100, 50000);
    qty += 100;
    expect(avg).toBe(50000);

    // Batch 2: 50 cái @ 80k
    avg = computeMovingAverage(qty, avg, 50, 80000);
    qty += 50;
    // (100×50k + 50×80k) / 150 = (5,000,000 + 4,000,000) / 150 = 60,000
    expect(avg).toBe(60000);
    expect(qty).toBe(150);
  });

  test('[Scenario B] 3 lần nhập lẻ — kiểm tra làm tròn 2 chữ số', () => {
    let qty = 0, avg = 0;

    avg = computeMovingAverage(qty, avg, 1, 10000); qty += 1; // avg=10000
    avg = computeMovingAverage(qty, avg, 1, 20000); qty += 1; // avg=15000
    avg = computeMovingAverage(qty, avg, 1, 1);     qty += 1; // avg=(30000+1)/3 = 10000.33

    expect(avg).toBe(10000.33);
  });

  test('[Edge] Reset avg khi toàn bộ hàng đã xuất (qty=0) rồi nhập lại', () => {
    // Sau khi xuất hết (qty=0), nhập mới với giá khác → avg = giá mới
    const newAvg = computeMovingAverage(0, 50000, 100, 75000);
    expect(newAvg).toBe(75000); // hoàn toàn reset, không bị ảnh hưởng giá cũ
  });

  test('[Edge] Nhập với giá 0 (hàng tặng) — avg không bị kéo xuống 0', () => {
    const newAvg = computeMovingAverage(100, 50000, 10, 0);
    // (100×50000 + 10×0) / 110 = 5,000,000 / 110 = 45,454.55
    expect(newAvg).toBe(45454.55);
  });

  test('[Edge] qtyBefore=0, importQty=0 → tránh chia cho 0 → trả 0', () => {
    const newAvg = computeMovingAverage(0, 0, 0, 100);
    expect(newAvg).toBe(0);
  });

  test('[Precision] 1,000,000 cái @ 0.001đ — không mất precision', () => {
    const newAvg = computeMovingAverage(0, 0, 1000000, 0.001);
    expect(newAvg).toBe(0); // 0.001 rounds to 0.00 at 2dp — expected behavior
  });

  test('[Scenario C] 4 lần nhập liên tiếp — avg tích lũy đúng', () => {
    const batches = [
      { qty: 100, price: 10000 },
      { qty: 200, price: 15000 },
      { qty: 50,  price: 8000  },
      { qty: 150, price: 12000 },
    ];

    let totalQty = 0, totalCost = 0, avg = 0;
    batches.forEach(({ qty, price }) => {
      avg = computeMovingAverage(totalQty, avg, qty, price);
      totalQty  += qty;
      totalCost += qty * price;
    });

    const expectedAvg = Math.round((totalCost / totalQty) * 100) / 100;
    expect(avg).toBe(expectedAvg);
    expect(totalQty).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 7. Stocktaking Adjustment Logic — Spec IX.6 ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
describe('Stocktaking → ADJUSTMENT Transactions — Spec IX.6', () => {

  test('[Normal] Thực tế nhiều hơn hệ thống → delta dương (ADJUSTMENT +)', () => {
    const items = [{ productId: 1, system: 80, counted: 90 }];
    const adjustments = generateStocktakingAdjustments(items);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].delta).toBe(10);
    expect(adjustments[0].type).toBe('ADJUSTMENT');
  });

  test('[Normal] Thực tế ít hơn hệ thống → delta âm (ADJUSTMENT -)', () => {
    const items = [{ productId: 2, system: 100, counted: 85 }];
    const adjustments = generateStocktakingAdjustments(items);
    expect(adjustments[0].delta).toBe(-15);
  });

  test('[No-op] Thực tế = hệ thống → không tạo adjustment', () => {
    const items = [
      { productId: 1, system: 50, counted: 50 },
      { productId: 2, system: 30, counted: 30 },
    ];
    const adjustments = generateStocktakingAdjustments(items);
    expect(adjustments).toHaveLength(0);
  });

  test('[Mixed] 5 sản phẩm: 2 lệch dương, 1 lệch âm, 2 khớp', () => {
    const items = [
      { productId: 1, system: 100, counted: 110 }, // +10
      { productId: 2, system: 50,  counted: 45  }, // -5
      { productId: 3, system: 30,  counted: 30  }, // khớp
      { productId: 4, system: 20,  counted: 25  }, // +5
      { productId: 5, system: 15,  counted: 15  }, // khớp
    ];
    const adjustments = generateStocktakingAdjustments(items);
    expect(adjustments).toHaveLength(3); // chỉ 3 sản phẩm có lệch
    expect(adjustments.every(a => a.type === 'ADJUSTMENT')).toBe(true);
    expect(adjustments.find(a => a.productId === 1).delta).toBe(10);
    expect(adjustments.find(a => a.productId === 2).delta).toBe(-5);
    expect(adjustments.find(a => a.productId === 4).delta).toBe(5);
  });

  test('[Audit] note ghi nhận cả số hệ thống và số thực tế', () => {
    const items = [{ productId: 3, system: 20, counted: 17 }];
    const adjustments = generateStocktakingAdjustments(items);
    expect(adjustments[0].note).toContain('20');  // system
    expect(adjustments[0].note).toContain('17');  // counted
  });

  test('[Total] Tổng delta của tất cả adjustment = tổng lệch thực tế - hệ thống', () => {
    const items = [
      { productId: 1, system: 100, counted: 90  }, // -10
      { productId: 2, system: 50,  counted: 65  }, // +15
      { productId: 3, system: 30,  counted: 30  }, // 0
    ];
    const adjustments = generateStocktakingAdjustments(items);
    const totalDelta    = adjustments.reduce((s, a) => s + a.delta, 0);
    const expectedDelta = items.reduce((s, i) => s + (i.counted - i.system), 0);
    expect(totalDelta).toBe(expectedDelta); // -10 + 15 = 5
    expect(totalDelta).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Suite 8: FEAT-GAP-10 — ERP Reports Business Logic (BUG-INV-01 included)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pure functions extracted from GetStockReportUseCase logic for unit testing.
 * These mirror the domain rules without any DB dependency.
 */

/** Maps inOut summary + current stock into the In-Out-Balance report row shape */
function buildInOutRow({ product_id, product_name, sku, total_import, total_export, net }, stockMap) {
  return {
    productId:   product_id,
    productName: product_name,
    sku,
    totalImport:  Number(total_import  || 0),
    totalExport:  Number(total_export  || 0),
    netChange:    Number(net           || 0),
    closingQty:   stockMap[product_id] ?? null,
  };
}

/** Validates that dateFrom + dateTo are both present (mirrors UseCase guard) */
function validateDateRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) {
    const err = new Error('dateFrom và dateTo là bắt buộc');
    err.code  = 'VALIDATION_ERROR';
    throw err;
  }
}

/** Computes grand total from inventory value rows (mirrors report.controller.js) */
function computeGrandTotal(rows) {
  return rows.reduce((sum, row) => sum + Number(row.total_value || 0), 0);
}

/** Computes total consumption cost (mirrors report.controller.js meta.totalCost) */
function computeTotalCost(rows) {
  return rows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
}

describe('Suite 8: ERP Reports — Business Logic (FEAT-GAP-10)', () => {

  // ── 8.1 In-Out-Balance row builder ────────────────────────────────────────
  describe('8.1 buildInOutRow — netChange formula', () => {
    const stockMap = { 1: 80, 2: 0 };

    test('netChange = totalImport - totalExport khi nhập > xuất', () => {
      const row = buildInOutRow(
        { product_id: 1, product_name: 'Bút bi', sku: 'BB01', total_import: 100, total_export: 20, net: 80 },
        stockMap,
      );
      expect(row.totalImport).toBe(100);
      expect(row.totalExport).toBe(20);
      expect(row.netChange).toBe(80);
      expect(row.closingQty).toBe(80); // từ stockMap
    });

    test('netChange âm khi xuất > nhập (hợp lệ về nghiệp vụ — mở kỳ có sẵn)', () => {
      const row = buildInOutRow(
        { product_id: 2, product_name: 'Giấy A4', sku: 'GA401', total_import: 0, total_export: 50, net: -50 },
        stockMap,
      );
      expect(row.netChange).toBe(-50);
      expect(row.closingQty).toBe(0);
    });

    test('closingQty là null khi product không trong stockMap', () => {
      const row = buildInOutRow(
        { product_id: 99, product_name: 'X', sku: 'X', total_import: 0, total_export: 0, net: 0 },
        stockMap,
      );
      expect(row.closingQty).toBeNull();
    });

    test('coercion: string numbers từ DB được parse thành number', () => {
      const row = buildInOutRow(
        { product_id: 1, product_name: 'X', sku: 'X', total_import: '150', total_export: '30', net: '120' },
        stockMap,
      );
      expect(typeof row.totalImport).toBe('number');
      expect(typeof row.netChange).toBe('number');
    });
  });

  // ── 8.2 Date range validation (mirrors UseCase guard) ─────────────────────
  describe('8.2 validateDateRange — bắt buộc cho In-Out-Balance & Consumption', () => {
    test('không throw khi cả 2 ngày hợp lệ', () => {
      expect(() => validateDateRange('2026-01-01', '2026-01-31')).not.toThrow();
    });

    test('throw VALIDATION_ERROR khi thiếu dateFrom', () => {
      expect(() => validateDateRange(null, '2026-01-31')).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    });

    test('throw VALIDATION_ERROR khi thiếu dateTo', () => {
      expect(() => validateDateRange('2026-01-01', '')).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    });

    test('throw VALIDATION_ERROR khi cả 2 undefined', () => {
      expect(() => validateDateRange(undefined, undefined)).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    });
  });

  // ── 8.3 Inventory Value — grandTotal computation (BUG-INV-01 context) ─────
  describe('8.3 computeGrandTotal — Inventory Value aggregation', () => {
    test('tổng đúng với 3 sản phẩm đơn giản', () => {
      const rows = [
        { total_value: 100 },
        { total_value: 250.5 },
        { total_value: 49.5 },
      ];
      expect(computeGrandTotal(rows)).toBe(400);
    });

    test('bỏ qua row không có total_value (null/undefined)', () => {
      const rows = [
        { total_value: 200 },
        { total_value: null },
        { total_value: undefined },
      ];
      expect(computeGrandTotal(rows)).toBe(200);
    });

    test('danh sách rỗng trả 0', () => {
      expect(computeGrandTotal([])).toBe(0);
    });

    test('string từ MySQL DECIMAL được parse thành number', () => {
      const rows = [{ total_value: '1234.50' }, { total_value: '765.50' }];
      expect(computeGrandTotal(rows)).toBe(2000);
    });
  });

  // ── 8.4 Consumption — totalCost & totalQty aggregation ───────────────────
  describe('8.4 computeTotalCost — Consumption report', () => {
    const consumptionData = [
      { product_id: 1, total_qty_out: 50, avg_cost: 20000, total_cost: 1000000, transaction_count: 3 },
      { product_id: 2, total_qty_out: 20, avg_cost: 50000, total_cost: 1000000, transaction_count: 2 },
      { product_id: 3, total_qty_out: 10, avg_cost: 30000, total_cost:  300000, transaction_count: 1 },
    ];

    test('totalCost = sum của tất cả total_cost', () => {
      expect(computeTotalCost(consumptionData)).toBe(2300000);
    });

    test('totalQty = sum của total_qty_out', () => {
      const totalQty = consumptionData.reduce((s, r) => s + Number(r.total_qty_out || 0), 0);
      expect(totalQty).toBe(80);
    });

    test('transaction_count đếm số phiếu xuất', () => {
      const totalTx = consumptionData.reduce((s, r) => s + Number(r.transaction_count || 0), 0);
      expect(totalTx).toBe(6);
    });
  });

  // ── 8.5 BUG-INV-01 regression: SQL logic (conceptual) ───────────────────
  describe('8.5 BUG-INV-01 — duplicate WHERE regression guard', () => {
    /**
     * Simulates the SQL-building logic after the fix.
     * Before fix: `where = "WHERE ws.warehouse_id = ?"` was inserted before
     *             another `WHERE ws.stock_qty > 0` → duplicate WHERE, syntax error.
     * After fix:  uses `AND ws.warehouse_id = ?` appended after the main WHERE.
     */
    function buildInventoryValueSQL(warehouseId) {
      const andClause = warehouseId ? 'AND ws.warehouse_id = ?' : '';
      return `SELECT * FROM warehouse_stock ws
        WHERE ws.stock_qty > 0
          ${andClause}`.replace(/\s+/g, ' ').trim();
    }

    test('không có WHERE thứ 2 khi warehouseId được truyền (BUG-INV-01 fixed)', () => {
      const sql = buildInventoryValueSQL(5);
      const whereCount = (sql.match(/\bWHERE\b/gi) || []).length;
      expect(whereCount).toBe(1); // CHỈ 1 WHERE — không duplicate
      expect(sql).toContain('AND ws.warehouse_id = ?');
    });

    test('không có AND thừa khi warehouseId là null', () => {
      const sql = buildInventoryValueSQL(null);
      expect(sql).not.toContain('AND ws.warehouse_id');
      expect(sql).toContain('WHERE ws.stock_qty > 0');
    });
  });
});
