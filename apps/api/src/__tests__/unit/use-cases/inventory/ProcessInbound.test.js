'use strict';
const ProcessInbound = require('../../../../use-cases/inventory/ProcessInbound');
const { computeMovingAverage } = require('../../../../domain/rules');
const { NotFoundError, WarehouseLockedError } = require('../../../../domain/errors');

describe('ProcessInbound Unit Test', () => {
  let uc, mockStockRepo, mockStocktakingRepo, mockUnitService;
  const conn = {}; // dummy connection

  beforeEach(() => {
    mockStockRepo = {
      findProduct: jest.fn(),
      findStock: jest.fn(),
      upsertStock: jest.fn(),
      updateGlobalAvgPrice: jest.fn(),
      insertTransaction: jest.fn().mockResolvedValue(100),
      insertLedger: jest.fn(),
      clearLowStockNotif: jest.fn()
    };
    mockStocktakingRepo = {
      hasActiveSession: jest.fn().mockResolvedValue(false)
    };
    mockUnitService = {
      convertToBase: jest.fn((conn, pid, uid, q) => q)
    };

    uc = new ProcessInbound({
      stockRepository: mockStockRepo,
      stocktakingRepository: mockStocktakingRepo,
      unitService: mockUnitService
    });
  });

  it('should throw WarehouseLockedError if warehouse is in stocktaking', async () => {
    mockStocktakingRepo.hasActiveSession.mockResolvedValue(true);
    await expect(uc.execute(conn, { warehouseId: 1, items: [] }))
      .rejects.toThrow(WarehouseLockedError);
  });

  it('should process inbound and update moving average correctly', async () => {
    const items = [{
      productId: 1,
      quantity: 10,
      unitPrice: 100,
      unitId: 1,
      locationId: 1
    }];

    // Existing: qty=20, avg=50
    mockStockRepo.findProduct.mockResolvedValue({
      id: 1,
      stock_qty: 20,
      avg_unit_price: 50,
      min_stock_qty: 5
    });
    // Warehouse stock existing: qty=20, avg=50
    mockStockRepo.findStock.mockResolvedValue({
      stock_qty: 20,
      avg_unit_price: 50
    });

    const result = await uc.execute(conn, {
      orderId: 10,
      orderCode: 'PO123',
      warehouseId: 1,
      items,
      completedBy: 1
    });

    // New avg = (20*50 + 10*100) / 30 = (1000 + 1000) / 30 = 66.666667
    const expectedNewAvg = computeMovingAverage(20, 50, 10, 100);
    
    expect(mockStockRepo.upsertStock).toHaveBeenCalledWith(
      conn, 1, 1, 10, expectedNewAvg, 1
    );
    expect(mockStockRepo.updateGlobalAvgPrice).toHaveBeenCalledWith(
      conn, 1, expectedNewAvg
    );
    expect(mockStockRepo.insertLedger).toHaveBeenCalledWith(
      conn, 
      expect.objectContaining({
        runningBalance: 30,
        quantityChange: 10
      })
    );
    expect(result.completedItems[0].stockAfter).toBe(30);
  });

  it('should use pricePerBase as avg if warehouse stock does not exist', async () => {
    const items = [{ productId: 1, quantity: 10, unitPrice: 100 }];
    mockStockRepo.findProduct.mockResolvedValue({ stock_qty: 0, avg_unit_price: 0, min_stock_qty: 5 });
    mockStockRepo.findStock.mockResolvedValue(null);

    await uc.execute(conn, { warehouseId: 1, items, completedBy: 1 });

    expect(mockStockRepo.upsertStock).toHaveBeenCalledWith(
      conn, 1, 1, 10, 100, null
    );
  });
});
