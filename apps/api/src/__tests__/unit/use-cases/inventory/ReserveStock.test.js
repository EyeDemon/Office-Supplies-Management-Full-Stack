'use strict';

const ReserveStock = require('../../../../use-cases/inventory/ReserveStock');
const { InsufficientStockError } = require('../../../../domain/errors');

describe('ReserveStock Use-Case', () => {
  let stockRepo;
  let useCase;

  beforeEach(() => {
    stockRepo = {
      findStock: jest.fn(),
      increaseReservation: jest.fn().mockResolvedValue(),
    };
    useCase = new ReserveStock({ stockRepository: stockRepo });
  });

  const conn = { query: jest.fn() };

  test('Should throw InsufficientStockError when stock is low', async () => {
    stockRepo.findStock.mockResolvedValue({ stock_qty: 10, reserved_quantity: 5 });
    
    const items = [{ productId: 1, quantity: 10 }];

    await expect(useCase.execute(conn, { warehouseId: 1, items }))
      .rejects.toThrow(InsufficientStockError);
  });

  test('Should succeed and call increaseReservation when stock is enough', async () => {
    stockRepo.findStock.mockResolvedValue({ stock_qty: 20, reserved_quantity: 5 });
    
    const items = [{ productId: 1, quantity: 10 }];

    const result = await useCase.execute(conn, { warehouseId: 1, items });

    expect(stockRepo.increaseReservation).toHaveBeenCalledWith(conn, 1, 1, 10);
    expect(result.reserved).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });
});
