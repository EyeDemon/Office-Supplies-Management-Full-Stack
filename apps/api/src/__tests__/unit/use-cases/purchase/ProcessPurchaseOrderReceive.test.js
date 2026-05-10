'use strict';

const ProcessPurchaseOrderReceive = require('../../../../use-cases/purchase/ProcessPurchaseOrderReceive');
const { InvalidStateTransitionError } = require('../../../../domain/errors');

describe('ProcessPurchaseOrderReceive Use-Case', () => {
  let purchaseRepo, productRepo, inboundUC;
  let useCase;

  const mockPO = { id: 1, po_code: 'PO-001', status: 'CONFIRMED', warehouse_id: 1 };
  const mockItems = [
    { product_id: 10, quantity: 10, quantity_received: 0, unit_price: 100 }
  ];

  beforeEach(() => {
    purchaseRepo = {
      findPOById: jest.fn().mockResolvedValue(mockPO),
      findPOItems: jest.fn().mockResolvedValue(mockItems),
      updatePOItemReceivedQty: jest.fn().mockResolvedValue(),
      markPOReceived: jest.fn().mockResolvedValue(),
    };
    productRepo = {
      insertPriceHistory: jest.fn().mockResolvedValue(),
    };
    inboundUC = {
      execute: jest.fn().mockResolvedValue(),
    };

    useCase = new ProcessPurchaseOrderReceive({
      purchaseRepository: purchaseRepo,
      productRepository: productRepo,
      inboundUseCase: inboundUC
    });
  });

  const conn = { query: jest.fn() };

  test('Should transition to PARTIAL if not all items received', async () => {
    const receivedItems = [{ productId: 10, quantityReceived: 5 }];

    await useCase.execute(conn, {
      poId: 1, receivedBy: 1, receivedItems, ipAddress: '127.0.0.1'
    });

    expect(purchaseRepo.markPOReceived).toHaveBeenCalledWith(conn, 1, 1, 'PARTIAL');
  });

  test('Should transition to RECEIVED if all items received', async () => {
    const receivedItems = [{ productId: 10, quantityReceived: 10 }];

    await useCase.execute(conn, {
      poId: 1, receivedBy: 1, receivedItems, ipAddress: '127.0.0.1'
    });

    expect(purchaseRepo.markPOReceived).toHaveBeenCalledWith(conn, 1, 1, 'RECEIVED');
  });

  test('Should fail if trying to receive on RECEIVED PO', async () => {
    purchaseRepo.findPOById.mockResolvedValue({ ...mockPO, status: 'RECEIVED' });
    const receivedItems = [{ productId: 10, quantityReceived: 5 }];

    await expect(useCase.execute(conn, {
      poId: 1, receivedBy: 1, receivedItems, ipAddress: '127.0.0.1'
    })).rejects.toThrow(InvalidStateTransitionError);
  });
});
