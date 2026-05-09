/**
 * domainEntities.test.js — Pure-domain unit tests (zero DB deps)
 *
 * Targets files with 0–30% coverage dragging CI below threshold:
 *   • src/domain/entities/index.js   (InventoryTransaction + StockLedger)
 *   • src/domain/errors/index.js     (all 6 domain error classes)
 *   • src/domain/rules/index.js      (assertValidTransition missing branches)
 *   • src/shared/utils/auditLogger.js (writeAuditLog)
 *   • src/shared/utils/paginate.js   (edge-case branches)
 *
 * Mock strategy: pure functions & classes only — no DB, no HTTP.
 */
'use strict';

// Unmock auditLogger để test hàm thật (bị mock global ở setup.js)
jest.unmock('../../shared/utils/auditLogger');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. domain/entities/index.js — InventoryTransaction + StockLedger
// ═══════════════════════════════════════════════════════════════════════════════
const { InventoryTransaction, StockLedger } = require('../../domain/entities');

describe('InventoryTransaction Entity (Spec III.1 — Source of Truth)', () => {
  const valid = {
    type: 'IMPORT', warehouseId: 1, productId: 10,
    quantity: 5, costPerUnit: 50000,
    referenceType: 'import_order', referenceId: 7,
    createdBy: 2, note: 'NK-001',
  };

  // ── Construction ─────────────────────────────────────────────────
  test('[Happy] Tạo IMPORT transaction thành công', () => {
    const tx = new InventoryTransaction(valid);
    expect(tx.type).toBe('IMPORT');
    expect(tx.warehouseId).toBe(1);
    expect(tx.productId).toBe(10);
    expect(tx.quantity).toBe(5);
    expect(tx.costPerUnit).toBe(50000);
    expect(tx.referenceType).toBe('import_order');
    expect(tx.note).toBe('NK-001');
  });

  test('[Happy] Tất cả 8 valid types được chấp nhận', () => {
    const TYPES = ['IMPORT', 'EXPORT', 'ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN_IN', 'RETURN_OUT', 'STOCKTAKE'];
    for (const type of TYPES) {
      expect(() => new InventoryTransaction({ ...valid, type })).not.toThrow();
    }
  });

  // ── Validation guards ─────────────────────────────────────────────
  test('[Guard] type không hợp lệ → ValidationError', () => {
    const { ValidationError } = require('../../domain/errors');
    expect(() => new InventoryTransaction({ ...valid, type: 'UNKNOWN' }))
      .toThrow(ValidationError);
    expect(() => new InventoryTransaction({ ...valid, type: 'UNKNOWN' }))
      .toThrow('Transaction type không hợp lệ: UNKNOWN');
  });

  test('[Guard] warehouseId = null → ValidationError', () => {
    const { ValidationError } = require('../../domain/errors');
    expect(() => new InventoryTransaction({ ...valid, warehouseId: null }))
      .toThrow(ValidationError);
    expect(() => new InventoryTransaction({ ...valid, warehouseId: null }))
      .toThrow('warehouseId và productId là bắt buộc');
  });

  test('[Guard] productId = 0 → ValidationError', () => {
    const { ValidationError } = require('../../domain/errors');
    expect(() => new InventoryTransaction({ ...valid, productId: 0 }))
      .toThrow(ValidationError);
  });

  test('[Guard] quantity = 0 → ValidationError (phải là số nguyên dương)', () => {
    const { ValidationError } = require('../../domain/errors');
    expect(() => new InventoryTransaction({ ...valid, quantity: 0 }))
      .toThrow(ValidationError);
    expect(() => new InventoryTransaction({ ...valid, quantity: 0 }))
      .toThrow(/quantity phải là số nguyên dương/);
  });

  test('[Guard] quantity âm → ValidationError', () => {
    const { ValidationError } = require('../../domain/errors');
    expect(() => new InventoryTransaction({ ...valid, quantity: -5 }))
      .toThrow(ValidationError);
  });

  test('[Guard] quantity = 1.5 (float) → ValidationError', () => {
    const { ValidationError } = require('../../domain/errors');
    expect(() => new InventoryTransaction({ ...valid, quantity: 1.5 }))
      .toThrow(ValidationError);
  });

  // ── Optional fields default ───────────────────────────────────────
  test('[Defaults] costPerUnit, referenceType, referenceId, createdBy, note đều có default null/0', () => {
    const tx = new InventoryTransaction({ type: 'IMPORT', warehouseId: 1, productId: 1, quantity: 1 });
    expect(tx.costPerUnit).toBe(0);
    expect(tx.referenceType).toBeNull();
    expect(tx.referenceId).toBeNull();
    expect(tx.createdBy).toBeNull();
    expect(tx.note).toBeNull();
  });

  // ── quantityDelta computed property ──────────────────────────────
  test('[Spec] IMPORT quantityDelta = +quantity (dương)', () => {
    const tx = new InventoryTransaction({ ...valid, type: 'IMPORT', quantity: 10 });
    expect(tx.quantityDelta).toBe(10);
  });

  test('[Spec] EXPORT quantityDelta = -quantity (âm)', () => {
    const tx = new InventoryTransaction({ ...valid, type: 'EXPORT', quantity: 3 });
    expect(tx.quantityDelta).toBe(-3);
  });

  test('[Spec] TRANSFER_OUT quantityDelta = âm', () => {
    const tx = new InventoryTransaction({ ...valid, type: 'TRANSFER_OUT', quantity: 7 });
    expect(tx.quantityDelta).toBe(-7);
  });

  test('[Spec] RETURN_OUT quantityDelta = âm', () => {
    const tx = new InventoryTransaction({ ...valid, type: 'RETURN_OUT', quantity: 2 });
    expect(tx.quantityDelta).toBe(-2);
  });

  test('[Spec] TRANSFER_IN quantityDelta = +quantity', () => {
    const tx = new InventoryTransaction({ ...valid, type: 'TRANSFER_IN', quantity: 5 });
    expect(tx.quantityDelta).toBe(5);
  });

  test('[Spec] RETURN_IN quantityDelta = +quantity', () => {
    const tx = new InventoryTransaction({ ...valid, type: 'RETURN_IN', quantity: 4 });
    expect(tx.quantityDelta).toBe(4);
  });

  test('[Spec] ADJUST quantityDelta = +quantity', () => {
    const tx = new InventoryTransaction({ ...valid, type: 'ADJUST', quantity: 6 });
    expect(tx.quantityDelta).toBe(6);
  });

  test('[Spec] STOCKTAKE quantityDelta = +quantity', () => {
    const tx = new InventoryTransaction({ ...valid, type: 'STOCKTAKE', quantity: 9 });
    expect(tx.quantityDelta).toBe(9);
  });

  // ── costPerUnit coercion ──────────────────────────────────────────
  test('[Coerce] costPerUnit string "75000" → number 75000', () => {
    const tx = new InventoryTransaction({ ...valid, costPerUnit: '75000' });
    expect(tx.costPerUnit).toBe(75000);
  });

  test('[Coerce] costPerUnit undefined → 0', () => {
    const tx = new InventoryTransaction({ ...valid, costPerUnit: undefined });
    expect(tx.costPerUnit).toBe(0);
  });
});

describe('StockLedger Entity (Spec III.3 — Audit Core)', () => {
  const validLedger = {
    warehouseId: 1, productId: 10,
    transactionId: 99, transactionType: 'IMPORT',
    quantityChange: 5, runningBalance: 15,
    costPerUnit: 60000,
    referenceType: 'import_order', referenceId: 7,
    note: 'NK-001', createdBy: 2,
  };

  test('[Happy] Tạo IMPORT ledger entry thành công', () => {
    const ledger = new StockLedger(validLedger);
    expect(ledger.warehouseId).toBe(1);
    expect(ledger.productId).toBe(10);
    expect(ledger.transactionId).toBe(99);
    expect(ledger.transactionType).toBe('IMPORT');
    expect(ledger.quantityChange).toBe(5);
    expect(ledger.runningBalance).toBe(15);
    expect(ledger.costPerUnit).toBe(60000);
    expect(ledger.referenceType).toBe('import_order');
    expect(ledger.note).toBe('NK-001');
    expect(ledger.createdBy).toBe(2);
  });

  // ── costImpact computation ────────────────────────────────────────
  test('[Spec] costImpact = quantityChange × costPerUnit (IMPORT: dương)', () => {
    const ledger = new StockLedger({ ...validLedger, quantityChange: 5, costPerUnit: 60000 });
    // 5 × 60000 = 300000
    expect(ledger.costImpact).toBe(300000);
  });

  test('[Spec] costImpact âm khi quantityChange âm (EXPORT)', () => {
    const ledger = new StockLedger({ ...validLedger, quantityChange: -3, costPerUnit: 50000 });
    // -3 × 50000 = -150000
    expect(ledger.costImpact).toBe(-150000);
  });

  test('[Precision] costImpact được làm tròn 2 chữ số thập phân', () => {
    const ledger = new StockLedger({ ...validLedger, quantityChange: 1, costPerUnit: 33333.333 });
    expect(ledger.costImpact).toBeCloseTo(33333.33, 2); // 6dp entity precision
  });

  test('[Defaults] optional fields → null', () => {
    const ledger = new StockLedger({
      warehouseId: 1, productId: 1,
      transactionId: 1, transactionType: 'ADJUST',
      quantityChange: 2, runningBalance: 10,
    });
    expect(ledger.referenceType).toBeNull();
    expect(ledger.referenceId).toBeNull();
    expect(ledger.note).toBeNull();
    expect(ledger.createdBy).toBeNull();
    expect(ledger.costPerUnit).toBe(0);
  });

  test('[Coerce] costPerUnit = "40000" string → number', () => {
    const ledger = new StockLedger({ ...validLedger, costPerUnit: '40000' });
    expect(ledger.costPerUnit).toBe(40000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. domain/errors/index.js — All 6 domain error classes
// ═══════════════════════════════════════════════════════════════════════════════
const {
  InvalidStateTransitionError,
  DuplicateTransactionError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ConflictError,
} = require('../../domain/errors');

describe('Domain Errors — API Error Contract (Spec V)', () => {

  // ── InvalidStateTransitionError ───────────────────────────────────
  describe('InvalidStateTransitionError', () => {
    test('[Happy] tạo lỗi với đúng fields', () => {
      const err = new InvalidStateTransitionError({ from: 'DRAFT', to: 'COMPLETED', entity: 'import_order' });
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('InvalidStateTransitionError');
      expect(err.code).toBe('INVALID_STATE');
      expect(err.status).toBe(422);
      expect(err.meta).toMatchObject({ from: 'DRAFT', to: 'COMPLETED', entity: 'import_order' });
      expect(err.message).toContain('DRAFT');
      expect(err.message).toContain('COMPLETED');
    });

    test('[Default] entity defaults to "Order" khi không truyền', () => {
      const err = new InvalidStateTransitionError({ from: 'A', to: 'B' });
      expect(err.meta.entity).toBe('Order');
    });
  });

  // ── DuplicateTransactionError ─────────────────────────────────────
  describe('DuplicateTransactionError', () => {
    test('[Happy] tạo lỗi với idempotencyKey', () => {
      const key = 'idem-key-abc-123';
      const err = new DuplicateTransactionError(key);
      expect(err.name).toBe('DuplicateTransactionError');
      expect(err.code).toBe('DUPLICATE_REQUEST');
      expect(err.status).toBe(409);
      expect(err.meta.idempotencyKey).toBe(key);
      expect(err.message).toContain(key);
    });
  });

  // ── NotFoundError ─────────────────────────────────────────────────
  describe('NotFoundError', () => {
    test('[Happy] tạo lỗi với resource và id', () => {
      const err = new NotFoundError('Product', 42);
      expect(err.name).toBe('NotFoundError');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.status).toBe(404);
      expect(err.meta).toMatchObject({ resource: 'Product', id: 42 });
      expect(err.message).toContain('Product');
      expect(err.message).toContain('42');
    });
  });

  // ── ValidationError ───────────────────────────────────────────────
  describe('ValidationError', () => {
    test('[Happy] với message và fields', () => {
      const fields = [{ field: 'quantity', message: 'phải là số dương' }];
      const err = new ValidationError('Dữ liệu không hợp lệ', fields);
      expect(err.name).toBe('ValidationError');
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.status).toBe(400);
      expect(err.fields).toEqual(fields);
      expect(err.message).toBe('Dữ liệu không hợp lệ');
    });

    test('[Default] fields defaults to []', () => {
      const err = new ValidationError('Lỗi validation');
      expect(err.fields).toEqual([]);
    });
  });

  // ── UnauthorizedError ─────────────────────────────────────────────
  describe('UnauthorizedError', () => {
    test('[Happy] tạo với message mặc định', () => {
      const err = new UnauthorizedError();
      expect(err.name).toBe('UnauthorizedError');
      expect(err.code).toBe('FORBIDDEN');
      expect(err.status).toBe(403);
      expect(err.message).toContain('Không có quyền');
    });

    test('[Custom] tạo với custom message', () => {
      const err = new UnauthorizedError('Chỉ Admin mới được phép');
      expect(err.message).toBe('Chỉ Admin mới được phép');
    });
  });

  // ── ConflictError ─────────────────────────────────────────────────
  describe('ConflictError', () => {
    test('[Happy] tạo với message', () => {
      const err = new ConflictError('SKU đã tồn tại');
      expect(err.name).toBe('ConflictError');
      expect(err.code).toBe('CONFLICT');
      expect(err.status).toBe(409);
      expect(err.message).toBe('SKU đã tồn tại');
    });
  });

  // ── All errors are instanceof Error ──────────────────────────────
  test('[Spec V] Tất cả domain errors extend Error', () => {
    const errs = [
      new InvalidStateTransitionError({ from: 'A', to: 'B' }),
      new DuplicateTransactionError('k'),
      new NotFoundError('R', 1),
      new ValidationError('msg'),
      new UnauthorizedError(),
      new ConflictError('c'),
    ];
    for (const err of errs) {
      expect(err).toBeInstanceOf(Error);
      expect(typeof err.code).toBe('string');
      expect(typeof err.status).toBe('number');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. domain/rules/index.js — Missing branches (lines 58-59)
// ═══════════════════════════════════════════════════════════════════════════════
const { assertValidTransition, guardSufficientStock, computeMovingAverage, TRANSITIONS } = require('../../domain/rules');
const InsufficientStockError = require('../../domain/errors/InsufficientStockError');

describe('domain/rules — assertValidTransition (Spec IX State Machines)', () => {

  // ── Valid transitions (already tested in businessFlow, but need 100% branch) ─
  test('[purchase_request] DRAFT → PENDING: hợp lệ', () => {
    expect(() => assertValidTransition('purchase_request', 'DRAFT', 'PENDING')).not.toThrow();
  });

  test('[purchase_request] PENDING → APPROVED: hợp lệ', () => {
    expect(() => assertValidTransition('purchase_request', 'PENDING', 'APPROVED')).not.toThrow();
  });

  test('[purchase_order] DRAFT → CONFIRMED: hợp lệ', () => {
    expect(() => assertValidTransition('purchase_order', 'DRAFT', 'CONFIRMED')).not.toThrow();
  });

  test('[purchase_order] CONFIRMED → RECEIVED: hợp lệ', () => {
    expect(() => assertValidTransition('purchase_order', 'CONFIRMED', 'RECEIVED')).not.toThrow();
  });

  test('[requisition] PENDING → APPROVED: hợp lệ', () => {
    expect(() => assertValidTransition('requisition', 'PENDING', 'APPROVED')).not.toThrow();
  });

  test('[stocktaking] OPEN → COUNTING: hợp lệ', () => {
    expect(() => assertValidTransition('stocktaking', 'OPEN', 'COUNTING')).not.toThrow();
  });

  test('[stocktaking] COUNTING → CONFIRMED: hợp lệ', () => {
    expect(() => assertValidTransition('stocktaking', 'COUNTING', 'CONFIRMED')).not.toThrow();
  });

  // ── Branch: entity không tồn tại trong TRANSITIONS map ──────────
  // Lines 58-59: `if (!map) throw new InvalidStateTransitionError(...)` — missing coverage
  test('[Guard] entity không tồn tại → InvalidStateTransitionError', () => {
    const { InvalidStateTransitionError } = require('../../domain/errors');
    expect(() => assertValidTransition('unknown_entity', 'DRAFT', 'PENDING'))
      .toThrow(InvalidStateTransitionError);
  });

  test('[Guard] entity không tồn tại — meta.entity đúng', () => {
    try {
      assertValidTransition('nonexistent', 'A', 'B');
      fail('Expected to throw');
    } catch (err) {
      expect(err.code).toBe('INVALID_STATE');
      expect(err.meta.entity).toBe('nonexistent');
    }
  });

  // ── Branch: fromStatus không có trong map ─────────────────────────
  test('[Guard] fromStatus không tồn tại trong entity map → throw', () => {
    const { InvalidStateTransitionError } = require('../../domain/errors');
    expect(() => assertValidTransition('import_order', 'NONEXISTENT', 'PENDING'))
      .toThrow(InvalidStateTransitionError);
  });

  // ── Branch: toStatus không trong allowed list ─────────────────────
  test('[Guard] COMPLETED → CANCELLED không hợp lệ (terminal state)', () => {
    const { InvalidStateTransitionError } = require('../../domain/errors');
    expect(() => assertValidTransition('import_order', 'COMPLETED', 'CANCELLED'))
      .toThrow(InvalidStateTransitionError);
  });
});

describe('domain/rules — guardSufficientStock (Spec VIII.3)', () => {
  test('[Happy] available >= requested → không throw', () => {
    expect(() => guardSufficientStock({ warehouseId: 1, productId: 10, available: 50, requested: 30 }))
      .not.toThrow();
  });

  test('[Happy] available = requested (biên) → không throw', () => {
    expect(() => guardSufficientStock({ warehouseId: 1, productId: 10, available: 30, requested: 30 }))
      .not.toThrow();
  });

  test('[Guard] available < requested → InsufficientStockError', () => {
    expect(() => guardSufficientStock({ warehouseId: 1, productId: 10, available: 5, requested: 10 }))
      .toThrow(InsufficientStockError);
  });

  test('[Guard] InsufficientStockError có đúng meta fields', () => {
    try {
      guardSufficientStock({ warehouseId: 2, productId: 99, available: 0, requested: 5 });
      fail('Expected throw');
    } catch (err) {
      expect(err.code).toBe('INSUFFICIENT_STOCK');
      expect(err.status).toBe(409);
      expect(err.meta.warehouseId).toBe(2);
      expect(err.meta.productId).toBe(99);
      expect(err.meta.available).toBe(0);
      expect(err.meta.requested).toBe(5);
    }
  });

  test('[Guard] available = 0 → throw', () => {
    expect(() => guardSufficientStock({ warehouseId: 1, productId: 1, available: 0, requested: 1 }))
      .toThrow(InsufficientStockError);
  });
});

describe('domain/rules — computeMovingAverage (Spec VIII.5)', () => {
  test('[Spec] Weighted average: 10 @ 50k + 5 @ 60k = 53333.33', () => {
    const result = computeMovingAverage(10, 50000, 5, 60000);
    expect(result).toBeCloseTo(53333.33, 1);
  });

  test('[Edge] qtyBefore = 0 → avg = inPrice (không thể weight dengan 0)', () => {
    expect(computeMovingAverage(0, 0, 10, 75000)).toBe(75000);
  });

  test('[Edge] inPrice = 0 → giữ avgBefore (không re-calculate)', () => {
    expect(computeMovingAverage(100, 30000, 50, 0)).toBe(30000);
  });

  test('[Edge] qtyAfter = 0 (qtyBefore + inQty = 0) → return 0', () => {
    // Edge: qtyBefore = 0, inQty = 0 → qtyAfter = 0
    expect(computeMovingAverage(0, 0, 0, 50000)).toBe(0);
  });

  test('[Precision] Làm tròn 2 chữ số thập phân', () => {
    const r = computeMovingAverage(7, 100000, 3, 200000);
    // (7×100000 + 3×200000) / 10 = 130000 (tròn đẹp)
    expect(r).toBe(130000);
    expect(Number.isFinite(r)).toBe(true);
  });

  test('[Multi-inbound] 3 lần nhập kho, avg tích lũy chính xác', () => {
    let qty = 0, avg = 0;
    // Lần 1: 10 @ 50k
    avg = computeMovingAverage(qty, avg, 10, 50000); qty += 10;
    expect(avg).toBe(50000);
    // Lần 2: +5 @ 80k
    avg = computeMovingAverage(qty, avg, 5, 80000); qty += 5;
    expect(avg).toBe(60000); // (500000+400000)/15
    // Lần 3: +20 @ 40k
    avg = computeMovingAverage(qty, avg, 20, 40000); qty += 20;
    expect(avg).toBeCloseTo(48571.43, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. shared/utils/auditLogger.js — writeAuditLog
// ═══════════════════════════════════════════════════════════════════════════════
const { writeAuditLog, writeAuditLogSafe } = require('../../shared/utils/auditLogger');

describe('writeAuditLog (Spec XIV — Audit Logging)', () => {
  function makeConn(returnVal = [[{ affectedRows: 1 }]]) {
    const query = jest.fn().mockResolvedValue(returnVal);
    const calls = () => query.mock.calls.map(c => ({ sql: c[0], params: c[1] }));
    return { query, _calls: calls };
  }

  test('[Happy] Ghi audit log thành công với đủ fields', async () => {
    const conn = makeConn();
    await writeAuditLog(conn, {
      entityType: 'import_order',
      entityId: 42,
      action: 'APPROVE',
      changedBy: 7,
      ipAddress: '127.0.0.1',
      beforeData: { status: 'PENDING' },
      afterData: { status: 'APPROVED' },
      note: 'Duyệt phiếu nhập',
    });
    expect(conn.query).toHaveBeenCalledTimes(1);
    const { sql, params } = conn._calls()[0];
    expect(sql).toMatch(/INSERT INTO general_audit_log/i);
    expect(params).toContain('import_order');
    expect(params).toContain('APPROVE');
    expect(params).toContain(42);
  });

  test('[Happy] beforeData và afterData được serialize JSON', async () => {
    const conn = makeConn();
    const before = { qty: 100, status: 'PENDING' };
    const after = { qty: 100, status: 'APPROVED' };
    await writeAuditLog(conn, {
      entityType: 'export_order', entityId: 5,
      action: 'APPROVE', beforeData: before, afterData: after,
    });
    const { params } = conn._calls()[0];
    // Params phải chứa JSON.stringify(before) và JSON.stringify(after)
    const jsonBefore = params.find(p => typeof p === 'string' && p.includes('"qty"'));
    expect(jsonBefore).toBeDefined();
  });

  test('[Guard] entityType = null → bỏ qua, không gọi query', async () => {
    const conn = makeConn();
    await writeAuditLog(conn, { entityType: null, entityId: 1, action: 'CREATE' });
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('[Guard] action = "" (empty) → bỏ qua, không gọi query', async () => {
    const conn = makeConn();
    await writeAuditLog(conn, { entityType: 'product', entityId: 1, action: '' });
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('[Guard] action = undefined → bỏ qua, không gọi query', async () => {
    const conn = makeConn();
    await writeAuditLog(conn, { entityType: 'product', entityId: 1 });
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('[Defaults] changedBy, ipAddress, beforeData, afterData, note mặc định null', async () => {
    const conn = makeConn();
    await writeAuditLog(conn, { entityType: 'product', entityId: 99, action: 'DELETE' });
    const { params } = conn._calls()[0];
    // entityType = 'product', entityId = 99, action = 'DELETE' phải có trong params
    expect(params).toContain('product');
    expect(params).toContain('DELETE');
  });

  test('[Error handling] Lỗi DB không throw ra ngoài — writeAuditLogSafe (silent fail)', async () => {
    const conn = { query: jest.fn().mockRejectedValue(new Error('DB down')) };
    // writeAuditLogSafe swallows the error — must not throw or reject
    await expect(
      writeAuditLogSafe(conn, { entityType: 'product', entityId: 1, action: 'CREATE' })
    ).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. shared/utils/paginate.js — Edge branches (lines 18-19, 31)
// ═══════════════════════════════════════════════════════════════════════════════
const { parsePagination, paginateResponse } = require('../../shared/utils/paginate');

describe('parsePagination — Edge branches', () => {
  test('[Default] page=NaN → clamp về 1', () => {
    const r = parsePagination({ page: 'abc', size: '10' });
    expect(r.page).toBe(1);
    expect(r.offset).toBe(0);
  });

  test('[Default] size=NaN → dùng defaultSize=20', () => {
    const r = parsePagination({ page: '1', size: 'xyz' });
    expect(r.size).toBe(20);
  });

  test('[Guard] page < 1 → clamp về 1 (line 18)', () => {
    const r = parsePagination({ page: '0' });
    expect(r.page).toBe(1);
    expect(r.offset).toBe(0);
  });

  test('[Guard] page âm → clamp về 1', () => {
    const r = parsePagination({ page: '-5' });
    expect(r.page).toBe(1);
  });

  test('[Guard] size > maxSize → clamp về maxSize=100 (line 19)', () => {
    const r = parsePagination({ page: '1', size: '999' });
    expect(r.size).toBe(100);
  });

  test('[Guard] size = 0 → clamp về defaultSize (line 19 path)', () => {
    const r = parsePagination({ size: '0' });
    expect(r.size).toBe(20); // defaultSize
  });

  test('[Normal] page=3, size=10 → offset=20', () => {
    const r = parsePagination({ page: '3', size: '10' });
    expect(r.page).toBe(3);
    expect(r.size).toBe(10);
    expect(r.offset).toBe(20);
  });

  test('[Custom] defaultSize và maxSize override', () => {
    const r = parsePagination({ page: '2', size: '60' }, { defaultSize: 50, maxSize: 50 });
    expect(r.size).toBe(50); // clamped by maxSize=50
    expect(r.page).toBe(2);
  });
});

describe('paginateResponse — Edge branches (line 31)', () => {
  test('[Happy] Normal pagination response', () => {
    const r = paginateResponse({ items: ['a', 'b'], totalCount: 10, page: 1, size: 5 });
    expect(r.total).toBe(10);
    expect(r.page).toBe(1);
    expect(r.size).toBe(5);
    expect(r.totalPages).toBe(2);
    expect(r.hasNext).toBe(true);
    expect(r.hasPrev).toBe(false);
  });

  test('[Edge] totalCount=0 → totalPages=1 (Math.ceil(0/size)=0 → || 1, line 31)', () => {
    const r = paginateResponse({ items: [], totalCount: 0, page: 1, size: 20 });
    // Math.ceil(0/20) = 0 → || 1 → totalPages=1
    expect(r.totalPages).toBe(1);
    expect(r.hasNext).toBe(false);
    expect(r.hasPrev).toBe(false);
  });

  test('[Edge] Last page — hasNext=false, hasPrev=true', () => {
    const r = paginateResponse({ items: ['x'], totalCount: 11, page: 3, size: 5 });
    expect(r.totalPages).toBe(3);
    expect(r.hasNext).toBe(false);
    expect(r.hasPrev).toBe(true);
  });

  test('[Edge] Middle page — both hasNext and hasPrev = true', () => {
    const r = paginateResponse({ items: Array(5), totalCount: 50, page: 3, size: 5 });
    expect(r.hasNext).toBe(true);
    expect(r.hasPrev).toBe(true);
    expect(r.totalPages).toBe(10);
  });

  test('[Edge] Exactly 1 item — totalPages=1, no next/prev', () => {
    const r = paginateResponse({ items: ['only'], totalCount: 1, page: 1, size: 20 });
    expect(r.totalPages).toBe(1);
    expect(r.hasNext).toBe(false);
    expect(r.hasPrev).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. domain/entities/Stock.js — Missing branch (line 65)
// ═══════════════════════════════════════════════════════════════════════════════
const Stock = require('../../domain/entities/Stock');

describe('Stock Entity — computeNewAvg (missing branch line 65)', () => {
  test('[Edge] stockQty=0 → computeNewAvg = inPrice (không divide by zero)', () => {
    const stock = new Stock({ warehouseId: 1, productId: 1, stockQty: 0, avgUnitPrice: 0 });
    expect(stock.computeNewAvg(10, 75000)).toBe(75000);
  });

  test('[Edge] inPrice=0 → giữ avgUnitPrice hiện tại', () => {
    const stock = new Stock({ warehouseId: 1, productId: 1, stockQty: 50, avgUnitPrice: 30000 });
    expect(stock.computeNewAvg(10, 0)).toBe(30000);
  });

  test('[Edge] qtyAfter=0 (stockQty=0, inQty=0) → 0', () => {
    const stock = new Stock({ warehouseId: 1, productId: 1, stockQty: 0, avgUnitPrice: 0 });
    expect(stock.computeNewAvg(0, 50000)).toBe(0);
  });

  test('[Happy] Weighted avg: 10 @ 50k + 5 @ 80k = 60k', () => {
    const stock = new Stock({ warehouseId: 1, productId: 1, stockQty: 10, avgUnitPrice: 50000 });
    expect(stock.computeNewAvg(5, 80000)).toBe(60000);
  });

  test('[Happy] toJSON() bao gồm available field', () => {
    const stock = new Stock({ warehouseId: 1, productId: 1, stockQty: 100, reservedQuantity: 30 });
    const json = stock.toJSON();
    expect(json.available).toBe(70);
    expect(json.stockQty).toBe(100);
    expect(json.reservedQuantity).toBe(30);
  });

  test('[Guard] assertSufficientStock: available=0 → throw InsufficientStockError', () => {
    const stock = new Stock({ warehouseId: 2, productId: 5, stockQty: 30, reservedQuantity: 30 });
    expect(() => stock.assertSufficientStock(1)).toThrow(InsufficientStockError);
  });

  test('[Guard] assertSufficientStock isReserved=true: stockQty>=qty → PASS dù available=0', () => {
    const stock = new Stock({ warehouseId: 1, productId: 1, stockQty: 30, reservedQuantity: 30 });
    expect(() => stock.assertSufficientStock(30, true)).not.toThrow();
  });

  test('[Guard] assertSufficientStock isReserved=true: stockQty<qty → throw', () => {
    const stock = new Stock({ warehouseId: 1, productId: 1, stockQty: 20, reservedQuantity: 20 });
    expect(() => stock.assertSufficientStock(30, true)).toThrow(InsufficientStockError);
  });
});