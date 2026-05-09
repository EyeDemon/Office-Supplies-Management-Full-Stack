'use strict';
/**
 * ProcessReturn.test.js
 * Covers:
 *   - EMPLOYEE_RETURN: tăng stock, ghi ledger IMPORT
 *   - SUPPLIER_RETURN: giảm stock, ghi ledger EXPORT
 *   - WarehouseLockedError khi kho đang kiểm kê (ARCH-1 regression guard)
 *   - InsufficientStockError khi supplier-return thiếu tồn kho
 *   - NotFoundError khi return không tồn tại
 *   - ValidationError khi không có items
 */
const ProcessReturn = require('../../../../use-cases/inventory/ProcessReturn');
const {
  NotFoundError,
  ValidationError,
  WarehouseLockedError,
  InsufficientStockError,
} = require('../../../../domain/errors');

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeStockRepo(overrides = {}) {
  return {
    findProduct:          jest.fn().mockResolvedValue({ id: 1, stock_qty: 50, avg_unit_price: 40000 }),
    findStock:            jest.fn().mockResolvedValue({ stock_qty: 30, reserved_quantity: 0, avg_unit_price: 40000 }),
    upsertStock:          jest.fn(),
    updateGlobalAvgPrice: jest.fn(),
    insertTransaction:    jest.fn().mockResolvedValue(777),
    insertLedger:         jest.fn(),
    clearLowStockNotif:   jest.fn(),
    ...overrides,
  };
}

function makeReturnRepo(returnObj, items = []) {
  return {
    getReturnForUpdate: jest.fn().mockResolvedValue(returnObj),
    getReturnItems:     jest.fn().mockResolvedValue(items),
    complete:           jest.fn(),
  };
}

function makeStocktakingRepo(locked = false) {
  return { hasActiveSession: jest.fn().mockResolvedValue(locked) };
}

const conn = { query: jest.fn() };

const EMPLOYEE_RETURN = {
  id: 5, return_code: 'RTN-001', status: 'DRAFT',
  return_type: 'EMPLOYEE_RETURN', warehouse_id: 1,
};
const SUPPLIER_RETURN = {
  id: 6, return_code: 'RTN-002', status: 'DRAFT',
  return_type: 'SUPPLIER_RETURN', warehouse_id: 1,
};
const ITEMS = [{ product_id: 1, quantity: 5 }];

// ── Test Suites ───────────────────────────────────────────────────────────────
describe('ProcessReturn — EMPLOYEE_RETURN (nhân viên trả hàng → tăng kho)', () => {
  it('[happy-path] tăng stock, insertLedger với transactionType IMPORT và runningBalance', async () => {
    const stockRepo  = makeStockRepo();
    const returnRepo = makeReturnRepo(EMPLOYEE_RETURN, ITEMS);
    const uc = new ProcessReturn({ stockRepository: stockRepo, returnRepository: returnRepo, stocktakingRepository: makeStocktakingRepo() });

    const result = await uc.execute(conn, 5, 1, '127.0.0.1');

    expect(result.isSupplierReturn).toBe(false);
    expect(result.processedCount).toBe(1);

    // upsertStock phải cộng +5
    expect(stockRepo.upsertStock).toHaveBeenCalledWith(conn, 1, 1, 5, expect.any(Number));

    // Ledger phải là IMPORT
    const ledgerArgs = stockRepo.insertLedger.mock.calls[0][1];
    expect(ledgerArgs.transactionType).toBe('IMPORT');
    expect(ledgerArgs.quantityChange).toBe(5);
    expect(ledgerArgs.runningBalance).toBe(35); // 30 + 5
  });

  it('gọi clearLowStockNotif sau khi tăng stock', async () => {
    const stockRepo  = makeStockRepo();
    const returnRepo = makeReturnRepo(EMPLOYEE_RETURN, ITEMS);
    const uc = new ProcessReturn({ stockRepository: stockRepo, returnRepository: returnRepo });
    await uc.execute(conn, 5, 1, '127.0.0.1');
    expect(stockRepo.clearLowStockNotif).toHaveBeenCalledWith(conn, 1);
  });
});

describe('ProcessReturn — SUPPLIER_RETURN (trả hàng cho NCC → giảm kho)', () => {
  it('[happy-path] giảm stock, insertLedger với transactionType EXPORT', async () => {
    const stockRepo  = makeStockRepo();
    const returnRepo = makeReturnRepo(SUPPLIER_RETURN, ITEMS);
    const uc = new ProcessReturn({ stockRepository: stockRepo, returnRepository: returnRepo, stocktakingRepository: makeStocktakingRepo() });

    const result = await uc.execute(conn, 6, 1, '127.0.0.1');

    expect(result.isSupplierReturn).toBe(true);
    expect(result.processedCount).toBe(1);

    // upsertStock phải trừ -5
    expect(stockRepo.upsertStock).toHaveBeenCalledWith(conn, 1, 1, -5, expect.any(Number));

    // Ledger phải là EXPORT
    const ledgerArgs = stockRepo.insertLedger.mock.calls[0][1];
    expect(ledgerArgs.transactionType).toBe('EXPORT');
    expect(ledgerArgs.quantityChange).toBe(-5);
    expect(ledgerArgs.runningBalance).toBe(25); // 30 - 5
  });

  it('throws InsufficientStockError khi available < qty', async () => {
    const stockRepo  = makeStockRepo({
      findStock: jest.fn().mockResolvedValue({ stock_qty: 3, reserved_quantity: 0, avg_unit_price: 40000 }),
    });
    const returnRepo = makeReturnRepo(SUPPLIER_RETURN, ITEMS); // qty=5 > available=3
    const uc = new ProcessReturn({ stockRepository: stockRepo, returnRepository: returnRepo });
    await expect(uc.execute(conn, 6, 1, '127.0.0.1')).rejects.toBeInstanceOf(InsufficientStockError);
  });
});

describe('ProcessReturn — Guard conditions', () => {
  it('[ARCH-1 guard] throws WarehouseLockedError khi kho đang kiểm kê', async () => {
    const returnRepo = makeReturnRepo(EMPLOYEE_RETURN, ITEMS);
    const uc = new ProcessReturn({
      stockRepository:      makeStockRepo(),
      returnRepository:     returnRepo,
      stocktakingRepository: makeStocktakingRepo(true), // locked = true
    });
    await expect(uc.execute(conn, 5, 1, '127.0.0.1')).rejects.toBeInstanceOf(WarehouseLockedError);
  });

  it('throws NotFoundError khi return_id không tồn tại', async () => {
    const returnRepo = { getReturnForUpdate: jest.fn().mockResolvedValue(null) };
    const uc = new ProcessReturn({ stockRepository: makeStockRepo(), returnRepository: returnRepo });
    await expect(uc.execute(conn, 999, 1, '127.0.0.1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ValidationError khi return không có sản phẩm', async () => {
    const returnRepo = makeReturnRepo(EMPLOYEE_RETURN, []); // empty items
    const uc = new ProcessReturn({ stockRepository: makeStockRepo(), returnRepository: returnRepo });
    await expect(uc.execute(conn, 5, 1, '127.0.0.1')).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError khi return không có warehouse_id', async () => {
    const returnWithoutWH = { ...EMPLOYEE_RETURN, warehouse_id: null };
    const returnRepo = makeReturnRepo(returnWithoutWH, ITEMS);
    const uc = new ProcessReturn({ stockRepository: makeStockRepo(), returnRepository: returnRepo });
    await expect(uc.execute(conn, 5, 1, '127.0.0.1')).rejects.toBeInstanceOf(ValidationError);
  });

  it('hoạt động bình thường khi không inject stocktakingRepository', async () => {
    const stockRepo  = makeStockRepo();
    const returnRepo = makeReturnRepo(EMPLOYEE_RETURN, ITEMS);
    // Không truyền stocktakingRepository — ProcessReturn bỏ qua check
    const uc = new ProcessReturn({ stockRepository: stockRepo, returnRepository: returnRepo });
    const result = await uc.execute(conn, 5, 1, '127.0.0.1');
    expect(result.processedCount).toBe(1);
  });
});

describe('ProcessReturn — Moving Average costing (EMPLOYEE_RETURN)', () => {
  it('[Spec VIII] tính newAvgWH đúng khi nhập lại với giá hiện tại', async () => {
    // stockBeforeWH=30, avgBeforeWH=40000, qty=10, incomingPrice=40000 (global avg)
    // → newAvgWH = (30*40000 + 10*40000) / 40 = 40000
    const stockRepo = makeStockRepo({
      findProduct: jest.fn().mockResolvedValue({ id: 1, stock_qty: 100, avg_unit_price: 40000 }),
      findStock:   jest.fn().mockResolvedValue({ stock_qty: 30, reserved_quantity: 0, avg_unit_price: 40000 }),
    });
    const returnRepo = makeReturnRepo(EMPLOYEE_RETURN, [{ product_id: 1, quantity: 10 }]);
    const uc = new ProcessReturn({ stockRepository: stockRepo, returnRepository: returnRepo });

    await uc.execute(conn, 5, 1, '127.0.0.1');

    // upsertStock(conn, warehouseId, productId, qty, newAvgWH) → index 4
    const [, , , , newAvg] = stockRepo.upsertStock.mock.calls[0];
    expect(newAvg).toBeCloseTo(40000, 2);
  });
});
