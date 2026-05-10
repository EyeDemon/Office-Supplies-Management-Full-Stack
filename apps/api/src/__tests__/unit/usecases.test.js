'use strict';
/**
 * usecases.test.js — Unit Tests: Core Use-Cases
 *
 * Covers:
 *   1. ApproveAdjustment — Duyệt/Từ chối điều chỉnh tồn kho
 *   2. ProcessReturn — Xử lý trả hàng (SUPPLIER_RETURN + EMPLOYEE_RETURN)
 */

// ── 1. ApproveAdjustment ──────────────────────────────────────────
describe('ApproveAdjustment Use-Case', () => {
  let ApproveAdjustment;
  let adjRepo, stockRepo;
  let useCase;

  const mockAdj = {
    id: 10, status: 'PENDING',
    warehouse_id: 1, product_id: 5,
    old_qty: 100, new_qty: 120, delta: 20,
    reason: 'Kiểm kho thực tế', note: '', created_by: 1,
  };

  beforeEach(() => {
    jest.resetModules();
    ApproveAdjustment = require('../../use-cases/inventory/ApproveAdjustment');

    adjRepo = {
      findAdjustmentById: jest.fn().mockResolvedValue(mockAdj),
      updateAdjustmentStatus: jest.fn().mockResolvedValue(),
    };
    stockRepo = {
      findStock: jest.fn().mockResolvedValue({ stock_qty: 100, avg_unit_price: 50000 }),
      // [FIX] ApproveAdjustment.js calls findProduct for global avg calculation (BUG-2 fix)
      findProduct: jest.fn().mockResolvedValue({ id: 5, stock_qty: 100, avg_unit_price: 50000 }),
      upsertStock: jest.fn().mockResolvedValue(),
      updateGlobalAvgPrice: jest.fn().mockResolvedValue(),
      insertTransaction: jest.fn().mockResolvedValue(999),
      insertLedger: jest.fn().mockResolvedValue(),
    };

    useCase = new ApproveAdjustment({ stockRepository: stockRepo, adjustmentRepository: adjRepo });
  });

  const conn = { query: jest.fn(), release: jest.fn() };

  test('APPROVE: Duyệt thành công, tính đúng realDelta và tạo transaction', async () => {
    const result = await useCase.execute(conn, { adjId: 10, actorId: 1, action: 'APPROVE' });
    expect(result.status).toBe('APPROVED');
    expect(result.realDelta).toBe(20); // new_qty(120) - currentQty(100)
    expect(result.txId).toBe(999);
    expect(stockRepo.upsertStock).toHaveBeenCalledWith(conn, 1, 5, 20, 50000);
    expect(stockRepo.insertTransaction).toHaveBeenCalled();
    expect(stockRepo.insertLedger).toHaveBeenCalled();
    expect(adjRepo.updateAdjustmentStatus).toHaveBeenCalledWith(conn, 10, { status: 'APPROVED', actorId: 1 });
  });

  test('APPROVE: Zero-delta (realDelta=0) — chỉ update status, không tạo transaction', async () => {
    // currentQty == new_qty → delta = 0
    stockRepo.findStock.mockResolvedValue({ stock_qty: 120, avg_unit_price: 50000 });
    const result = await useCase.execute(conn, { adjId: 10, actorId: 1, action: 'APPROVE' });
    expect(result.status).toBe('APPROVED');
    expect(result.realDelta).toBe(0);
    expect(result.txId).toBeNull();
    expect(stockRepo.insertTransaction).not.toHaveBeenCalled();
  });

  test('REJECT: Từ chối — chỉ update status REJECTED', async () => {
    const result = await useCase.execute(conn, { adjId: 10, actorId: 2, action: 'REJECT' });
    expect(result.status).toBe('REJECTED');
    expect(adjRepo.updateAdjustmentStatus).toHaveBeenCalledWith(conn, 10, { status: 'REJECTED', actorId: 2 });
    expect(stockRepo.upsertStock).not.toHaveBeenCalled();
  });

  test('NotFoundError khi adj không tồn tại', async () => {
    adjRepo.findAdjustmentById.mockResolvedValue(null);
    const { NotFoundError } = require('../../domain/errors');
    await expect(useCase.execute(conn, { adjId: 99, actorId: 1, action: 'APPROVE' }))
      .rejects.toThrow(NotFoundError);
  });

  test('ConflictError khi adj.status không phải PENDING', async () => {
    adjRepo.findAdjustmentById.mockResolvedValue({ ...mockAdj, status: 'APPROVED' });
    const { ConflictError } = require('../../domain/errors');
    await expect(useCase.execute(conn, { adjId: 10, actorId: 1, action: 'APPROVE' }))
      .rejects.toThrow(ConflictError);
  });

  test('ValidationError khi action không hợp lệ', async () => {
    const { ValidationError } = require('../../domain/errors');
    await expect(useCase.execute(conn, { adjId: 10, actorId: 1, action: 'INVALID' }))
      .rejects.toThrow(ValidationError);
  });

  test('APPROVE: Kho chưa có dữ liệu stock (ws=null) → currentQty=0', async () => {
    stockRepo.findStock.mockResolvedValue(null);
    // new_qty = 120, currentQty = 0 → realDelta = 120
    const result = await useCase.execute(conn, { adjId: 10, actorId: 1, action: 'APPROVE' });
    expect(result.realDelta).toBe(120);
  });
});

// ── 2. ProcessReturn ──────────────────────────────────────────────
describe('ProcessReturn Use-Case', () => {
  let ProcessReturn;
  let stockRepo, returnRepo;
  let useCase;

  const mockReturn = {
    id: 5, status: 'DRAFT', return_type: 'SUPPLIER_RETURN',
    warehouse_id: 1, return_code: 'RTN-001',
  };

  const mockItems = [
    { product_id: 10, quantity: 5 },
  ];

  const mockProd = { id: 10, stock_qty: 100, avg_unit_price: 50000 };
  const mockWS = { stock_qty: 80, avg_unit_price: 50000, reserved_quantity: 0 };

  beforeEach(() => {
    jest.resetModules();
    ProcessReturn = require('../../use-cases/inventory/ProcessReturn');

    returnRepo = {
      getReturnForUpdate: jest.fn().mockResolvedValue(mockReturn),
      getReturnItems: jest.fn().mockResolvedValue(mockItems),
      complete: jest.fn().mockResolvedValue(),
    };
    stockRepo = {
      findProduct: jest.fn().mockResolvedValue(mockProd),
      findStock: jest.fn().mockResolvedValue(mockWS),
      upsertStock: jest.fn().mockResolvedValue(),
      updateGlobalAvgPrice: jest.fn().mockResolvedValue(),
      clearLowStockNotif: jest.fn().mockResolvedValue(),
      insertTransaction: jest.fn().mockResolvedValue(888),
      insertLedger: jest.fn().mockResolvedValue(),
    };

    useCase = new ProcessReturn({ stockRepository: stockRepo, returnRepository: returnRepo });
  });

  const conn = { query: jest.fn(), release: jest.fn() };

  test('SUPPLIER_RETURN: Trả hàng NCC → GIẢM tồn kho', async () => {
    const result = await useCase.execute(conn, 5, 1, '127.0.0.1');
    expect(result.isSupplierReturn).toBe(true);
    expect(result.processedCount).toBe(1);
    // stockRepo.upsertStock called with -qty (decrease)
    expect(stockRepo.upsertStock).toHaveBeenCalledWith(conn, 1, 10, -5, 50000);
    expect(returnRepo.complete).toHaveBeenCalledWith(conn, 5, 1);
  });

  test('EMPLOYEE_RETURN: Nhân viên trả hàng → TĂNG tồn kho', async () => {
    returnRepo.getReturnForUpdate.mockResolvedValue({
      ...mockReturn, return_type: 'EMPLOYEE_RETURN',
    });
    const result = await useCase.execute(conn, 5, 1, '127.0.0.1');
    expect(result.isSupplierReturn).toBe(false);
    expect(result.processedCount).toBe(1);
    // stockRepo.upsertStock called with +qty (increase)
    expect(stockRepo.upsertStock).toHaveBeenCalledWith(conn, 1, 10, 5, expect.any(Number));
    expect(stockRepo.clearLowStockNotif).toHaveBeenCalled();
  });

  test('NotFoundError khi return không tồn tại', async () => {
    returnRepo.getReturnForUpdate.mockResolvedValue(null);
    const { NotFoundError } = require('../../domain/errors');
    await expect(useCase.execute(conn, 99, 1, '127.0.0.1'))
      .rejects.toThrow(NotFoundError);
  });

  test('InvalidStateTransitionError khi status không phải DRAFT', async () => {
    returnRepo.getReturnForUpdate.mockResolvedValue({ ...mockReturn, status: 'COMPLETED' });
    const { InvalidStateTransitionError } = require('../../domain/errors');
    await expect(useCase.execute(conn, 5, 1, '127.0.0.1'))
      .rejects.toThrow(InvalidStateTransitionError);
  });

  test('ValidationError khi return không có warehouse_id', async () => {
    returnRepo.getReturnForUpdate.mockResolvedValue({ ...mockReturn, warehouse_id: null });
    const { ValidationError } = require('../../domain/errors');
    await expect(useCase.execute(conn, 5, 1, '127.0.0.1'))
      .rejects.toThrow(ValidationError);
  });

  test('ValidationError khi return không có items', async () => {
    returnRepo.getReturnItems.mockResolvedValue([]);
    const { ValidationError } = require('../../domain/errors');
    await expect(useCase.execute(conn, 5, 1, '127.0.0.1'))
      .rejects.toThrow(ValidationError);
  });

  test('SUPPLIER_RETURN: InsufficientStockError khi tồn kho không đủ', async () => {
    // available = stockBeforeWH(80) - reserved(0) = 80, but qty = 100
    returnRepo.getReturnItems.mockResolvedValue([{ product_id: 10, quantity: 100 }]);
    const InsufficientStockError = require('../../domain/errors/InsufficientStockError');
    await expect(useCase.execute(conn, 5, 1, '127.0.0.1'))
      .rejects.toThrow(InsufficientStockError);
  });

  test('Product skip khi findProduct trả về null', async () => {
    stockRepo.findProduct.mockResolvedValue(null);
    const result = await useCase.execute(conn, 5, 1, '127.0.0.1');
    // processedCount = 0 because product not found → skip
    expect(result.processedCount).toBe(0);
  });
});