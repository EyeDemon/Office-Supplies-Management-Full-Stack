'use strict';

const WarehouseConfirmRequisition = require('../../../../use-cases/requisition/WarehouseConfirmRequisition');
const { NotFoundError } = require('../../../../domain/errors');

describe('WarehouseConfirmRequisition Use-Case', () => {
  let stockRepo, reqRepo, orderRepo;
  let useCase;

  const mockReq = {
    id: 1, req_code: 'REQ-001', status: 'APPROVED',
    warehouse_id: 1, requester_name: 'User A', department: 'Dept A'
  };

  const mockItems = [
    { id: 10, product_id: 100, quantity_approved: 5, unit_id: 1 }
  ];

  const mockStock = { stock_qty: 100, reserved_quantity: 5, avg_unit_price: 50000 };

  beforeEach(() => {
    stockRepo = {
      findStock: jest.fn().mockResolvedValue(mockStock),
      upsertStock: jest.fn().mockResolvedValue(),
      decreaseReservation: jest.fn().mockResolvedValue(),
      insertTransaction: jest.fn().mockResolvedValue(123),
      insertLedger: jest.fn().mockResolvedValue(),
    };
    reqRepo = {
      findForWarehouseConfirm: jest.fn().mockResolvedValue(mockReq),
      findApprovedItemsForDispense: jest.fn().mockResolvedValue(mockItems),
      markWarehouseConfirmed: jest.fn().mockResolvedValue(),
    };
    orderRepo = {
      findExportByRequisitionId: jest.fn(),
      completeExportWithItems: jest.fn().mockResolvedValue(),
      generateExportCode: jest.fn().mockResolvedValue('XK-2026-0001'),
      createExport: jest.fn().mockResolvedValue(456),
      insertExportItems: jest.fn().mockResolvedValue(),
    };

    useCase = new WarehouseConfirmRequisition({
      stockRepository: stockRepo,
      requisitionRepository: reqRepo,
      orderRepository: orderRepo
    });
  });

  const conn = { query: jest.fn() };

  test('Should reuse existing export order if found', async () => {
    const existingOrder = { id: 500, order_code: 'XK-PREVIOUS' };
    orderRepo.findExportByRequisitionId.mockResolvedValue(existingOrder);

    const result = await useCase.execute(conn, {
      requisitionId: 1,
      confirmedBy: 1,
      confirmedItems: [{ itemId: 10, quantityDispensed: 5 }]
    });

    expect(orderRepo.findExportByRequisitionId).toHaveBeenCalledWith(conn, 1);
    expect(orderRepo.completeExportWithItems).toHaveBeenCalledWith(conn, 500, {
      userId: 1,
      totalQty: 5,
      items: expect.any(Array)
    });
    expect(orderRepo.createExport).not.toHaveBeenCalled();
    expect(result.exportOrderId).toBe(500);
  });

  test('Should create new export order if none exists', async () => {
    orderRepo.findExportByRequisitionId.mockResolvedValue(null);

    const result = await useCase.execute(conn, {
      requisitionId: 1,
      confirmedBy: 1,
      confirmedItems: [{ itemId: 10, quantityDispensed: 5 }]
    });

    expect(orderRepo.findExportByRequisitionId).toHaveBeenCalledWith(conn, 1);
    expect(orderRepo.completeExportWithItems).not.toHaveBeenCalled();
    expect(orderRepo.createExport).toHaveBeenCalled();
    expect(result.exportOrderId).toBe(456);
  });
});
