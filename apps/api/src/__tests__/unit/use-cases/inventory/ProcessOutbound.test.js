'use strict';
const ProcessOutbound = require('../../../../use-cases/inventory/ProcessOutbound');
const { NotFoundError, ValidationError, WarehouseLockedError, InsufficientStockError } = require('../../../../domain/errors');

describe('ProcessOutbound Unit Test', () => {
  let uc, mockStockRepo, mockLotRepo, mockOrderRepo, mockStocktakingRepo, mockUnitService;
  const conn = { query: jest.fn() };

  beforeEach(() => {
    mockStockRepo = {
      findStock: jest.fn(),
      findProduct: jest.fn(),
      upsertStock: jest.fn(),
      updateGlobalAvgPrice: jest.fn(),
      decreaseReservation: jest.fn(),
      insertTransaction: jest.fn().mockResolvedValue(200),
      insertLedger: jest.fn(),
      clearLowStockNotif: jest.fn()
    };
    mockLotRepo = { findById: jest.fn() };
    mockOrderRepo = { updateFulfilledQuantity: jest.fn(), checkAndMarkExportFulfillment: jest.fn() };
    mockStocktakingRepo = { hasActiveSession: jest.fn().mockResolvedValue(false) };
    mockUnitService = { convertToBase: jest.fn((c, p, u, q) => q) };

    uc = new ProcessOutbound({
      stockRepository: mockStockRepo,
      lotRepository: mockLotRepo,
      orderRepository: mockOrderRepo,
      stocktakingRepository: mockStocktakingRepo,
      unitService: mockUnitService
    });
  });

  it('should throw INSUFFICIENT_STOCK if not enough available stock', async () => {
    mockStockRepo.findStock.mockResolvedValue({
      stock_qty: 10,
      reserved_quantity: 8, // available = 2
      avg_unit_price: 100
    });

    const items = [{ productId: 1, quantity: 5 }]; // requesting 5 > 2

    await expect(uc.execute(conn, { warehouseId: 1, items, completedBy: 1 }))
      .rejects.toThrow(InsufficientStockError);
  });

  it('should allow dispatch if requesting from reservation', async () => {
    mockStockRepo.findStock.mockResolvedValue({
      stock_qty: 10,
      reserved_quantity: 10, // available = 0, but total = 10
      avg_unit_price: 100
    });
    mockStockRepo.findProduct.mockResolvedValue({ stock_qty: 10 });

    const items = [{ productId: 1, quantity: 5 }];

    const result = await uc.execute(conn, {
      warehouseId: 1,
      items,
      hasReservation: true, // indicates we are using the reserved quantity
      completedBy: 1
    });

    expect(result.dispatchedItems[0].qtyDispatched).toBe(5);
    expect(mockStockRepo.decreaseReservation).toHaveBeenCalledWith(conn, 1, 1, 5);
    expect(mockStockRepo.upsertStock).toHaveBeenCalledWith(conn, 1, 1, -5, 100);
  });

  it('should reset global avg if global stock reaches zero', async () => {
    mockStockRepo.findStock.mockResolvedValue({
      stock_qty: 5,
      reserved_quantity: 0,
      avg_unit_price: 100
    });
    // Simulate trigger effect or manual update check
    mockStockRepo.findProduct.mockResolvedValue({ id: 1, stock_qty: 0 });

    const items = [{ productId: 1, quantity: 5 }];

    await uc.execute(conn, { warehouseId: 1, items, completedBy: 1 });

    expect(mockStockRepo.updateGlobalAvgPrice).toHaveBeenCalledWith(conn, 1, 0);
  });
});
