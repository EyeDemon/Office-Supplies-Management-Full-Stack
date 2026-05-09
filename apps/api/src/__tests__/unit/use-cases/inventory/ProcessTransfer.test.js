'use strict';
/**
 * ProcessTransfer.test.js
 * Covers:
 *   - dispatch(): happy-path xuất kho nguồn, InsufficientStock, WarehouseLocked
 *   - complete(): happy-path nhập kho đích, WarehouseLocked, runningBalance đúng
 *   - cancel():   rollback ghi runningBalance đúng (ARCH-2 regression guard)
 */
const ProcessTransfer = require('../../../../use-cases/inventory/ProcessTransfer');
const {
  NotFoundError,
  WarehouseLockedError,
  InsufficientStockError,
} = require('../../../../domain/errors');

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeStockRepo(overrides = {}) {
  return {
    findProductByIds:     jest.fn().mockResolvedValue([{ id: 1, stock_qty: 100, avg_unit_price: 50000, base_unit_id: 1 }]),
    findStock:            jest.fn().mockResolvedValue({ stock_qty: 80, reserved_quantity: 0, avg_unit_price: 50000 }),
    upsertStock:          jest.fn(),
    updateGlobalAvgPrice: jest.fn(),
    insertTransaction:    jest.fn().mockResolvedValue(999),
    insertLedger:         jest.fn(),
    clearLowStockNotif:   jest.fn(),
    ...overrides,
  };
}

function makeStocktakingRepo(locked = false) {
  return { hasActiveSession: jest.fn().mockResolvedValue(locked) };
}

const conn = { query: jest.fn() };
const ITEMS = [{ product_id: 1, quantity: 10, unit_id: 1 }];

// ── dispatch() ───────────────────────────────────────────────────────────────
describe('ProcessTransfer.dispatch()', () => {
  const dispatchArgs = {
    transferId: 10, transferCode: 'T-001',
    fromWarehouseId: 1, items: ITEMS, userId: 1,
  };

  it('[happy-path] xuất kho nguồn, insertLedger với runningBalance = stockBefore - qty', async () => {
    const stockRepo = makeStockRepo({
      findStock: jest.fn().mockResolvedValue({ stock_qty: 80, reserved_quantity: 0, avg_unit_price: 50000 }),
    });
    const uc = new ProcessTransfer({ stockRepository: stockRepo, stocktakingRepository: makeStocktakingRepo(false) });

    await uc.dispatch(conn, dispatchArgs);

    expect(stockRepo.insertLedger).toHaveBeenCalledTimes(1);
    const ledgerArgs = stockRepo.insertLedger.mock.calls[0][1];

    // runningBalance = 80 - 10 = 70
    expect(ledgerArgs.runningBalance).toBe(70);
    expect(ledgerArgs.quantityChange).toBe(-10);
    expect(ledgerArgs.transactionType).toBe('TRANSFER_OUT');
  });

  it('throws WarehouseLockedError khi kho nguồn đang kiểm kê', async () => {
    const uc = new ProcessTransfer({
      stockRepository:       makeStockRepo(),
      stocktakingRepository: makeStocktakingRepo(true),
    });
    await expect(uc.dispatch(conn, dispatchArgs)).rejects.toBeInstanceOf(WarehouseLockedError);
  });

  it('throws InsufficientStockError khi không đủ tồn kho', async () => {
    const stockRepo = makeStockRepo({
      findStock: jest.fn().mockResolvedValue({ stock_qty: 5, reserved_quantity: 0, avg_unit_price: 50000 }),
    });
    const uc = new ProcessTransfer({ stockRepository: stockRepo, stocktakingRepository: makeStocktakingRepo(false) });
    await expect(uc.dispatch(conn, dispatchArgs)).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('throws NotFoundError khi sản phẩm không tồn tại', async () => {
    const stockRepo = makeStockRepo({ findProductByIds: jest.fn().mockResolvedValue([]) });
    const uc = new ProcessTransfer({ stockRepository: stockRepo });
    await expect(uc.dispatch(conn, dispatchArgs)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('không check stocktaking khi không inject stocktakingRepository', async () => {
    const uc = new ProcessTransfer({ stockRepository: makeStockRepo() }); // no stocktakingRepo
    await uc.dispatch(conn, dispatchArgs);
    expect(makeStockRepo().insertLedger).not.toHaveBeenCalled(); // just verifying no crash
  });
});

// ── complete() ────────────────────────────────────────────────────────────────
describe('ProcessTransfer.complete()', () => {
  const completeArgs = {
    transferId: 10, transferCode: 'T-001',
    toWarehouseId: 2, items: ITEMS, userId: 1,
  };

  it('[happy-path] nhập kho đích, runningBalance = toStockBefore + qty', async () => {
    const stockRepo = makeStockRepo({
      findStock: jest.fn().mockResolvedValue({ stock_qty: 20, reserved_quantity: 0, avg_unit_price: 48000 }),
    });
    const uc = new ProcessTransfer({ stockRepository: stockRepo, stocktakingRepository: makeStocktakingRepo(false) });

    await uc.complete(conn, completeArgs);

    expect(stockRepo.insertLedger).toHaveBeenCalledTimes(1);
    const ledgerArgs = stockRepo.insertLedger.mock.calls[0][1];

    // toStockBefore=20, qty=10 → runningBalance=30
    expect(ledgerArgs.runningBalance).toBe(30);
    expect(ledgerArgs.quantityChange).toBe(10);
    expect(ledgerArgs.transactionType).toBe('TRANSFER_IN');
  });

  it('throws WarehouseLockedError khi kho nhận đang kiểm kê', async () => {
    const uc = new ProcessTransfer({
      stockRepository:       makeStockRepo(),
      stocktakingRepository: makeStocktakingRepo(true),
    });
    await expect(uc.complete(conn, completeArgs)).rejects.toBeInstanceOf(WarehouseLockedError);
  });

  it('khởi tạo toStock mới (runningBalance = qty) khi kho chưa có sản phẩm', async () => {
    const stockRepo = makeStockRepo({ findStock: jest.fn().mockResolvedValue(null) });
    const uc = new ProcessTransfer({ stockRepository: stockRepo });
    await uc.complete(conn, completeArgs);
    const ledgerArgs = stockRepo.insertLedger.mock.calls[0][1];
    expect(ledgerArgs.runningBalance).toBe(10); // 0 + 10
  });
});

// ── cancel() — ARCH-2 Regression Guard ──────────────────────────────────────
describe('ProcessTransfer.cancel() — ARCH-2 rollback runningBalance', () => {
  it('[ARCH-2 guard] insertLedger.runningBalance = stockBefore + qty = 50', async () => {
    const stockRepo = makeStockRepo({
      findProductByIds:  jest.fn().mockResolvedValue([{ id: 1, stock_qty: 100, avg_unit_price: 50000, base_unit_id: 1 }]),
      findStock:         jest.fn().mockResolvedValue({ stock_qty: 40, avg_unit_price: 50000 }),
      insertTransaction: jest.fn().mockResolvedValue(888),
    });
    const uc = new ProcessTransfer({ stockRepository: stockRepo });

    await uc.cancel(conn, {
      transferId: 10, transferCode: 'T-001',
      items: [{ product_id: 1, quantity: 10, unit_id: 1 }],
      fromWarehouseId: 1, userId: 1,
    });

    expect(stockRepo.insertLedger).toHaveBeenCalledTimes(1);
    const ledgerArgs = stockRepo.insertLedger.mock.calls[0][1];

    expect(ledgerArgs.runningBalance).toBe(50); // 40 + 10
    expect(ledgerArgs.quantityChange).toBe(10);
    expect(ledgerArgs.transactionType).toBe('ADJUST');
  });

  it('không ghi ledger nào khi items rỗng', async () => {
    const stockRepo = makeStockRepo({ findProductByIds: jest.fn().mockResolvedValue([]) });
    const uc = new ProcessTransfer({ stockRepository: stockRepo });
    await uc.cancel(conn, { transferId: 10, transferCode: 'T-001', items: [], fromWarehouseId: 1, userId: 1 });
    expect(stockRepo.insertLedger).not.toHaveBeenCalled();
  });

  it('bỏ qua item khi product không có trong productMap', async () => {
    const stockRepo = makeStockRepo({ findProductByIds: jest.fn().mockResolvedValue([]) });
    const uc = new ProcessTransfer({ stockRepository: stockRepo });
    await uc.cancel(conn, {
      transferId: 10, transferCode: 'T-001',
      items: [{ product_id: 99, quantity: 5, unit_id: 1 }],
      fromWarehouseId: 1, userId: 1,
    });
    expect(stockRepo.insertLedger).not.toHaveBeenCalled();
  });
});
