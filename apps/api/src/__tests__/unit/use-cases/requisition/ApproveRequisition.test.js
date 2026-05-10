'use strict';

const ApproveRequisition = require('../../../../use-cases/requisition/ApproveRequisition');
const { NotFoundError } = require('../../../../domain/errors');

describe('ApproveRequisition Use-Case', () => {
  let reqRepo, userRepo, stockRepo, orderRepo, reserveUC;
  let useCase;

  const mockReq = { id: 1, req_code: 'REQ-001', status: 'PENDING', warehouse_id: 1, requester_id: 10 };
  const mockItems = [{ id: 100, product_id: 20, quantity_requested: 5, unit_id: 1 }];

  beforeEach(() => {
    reqRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(mockReq),
      findItems: jest.fn().mockResolvedValue(mockItems),
      updateItemApprovedQty: jest.fn().mockResolvedValue(),
      updateStatus: jest.fn().mockResolvedValue(),
      findMeta: jest.fn().mockResolvedValue({ req_code: 'REQ-001', requester_id: 10 }),
    };
    userRepo = { findById: jest.fn().mockResolvedValue({ fullName: 'John Doe', department: 'IT' }) };
    stockRepo = {};
    orderRepo = {
      generateExportCode: jest.fn().mockResolvedValue('EX-001'),
      createExport: jest.fn().mockResolvedValue(1001),
      insertExportItems: jest.fn().mockResolvedValue(),
    };
    reserveUC = { execute: jest.fn().mockResolvedValue({ reserved: [], warnings: [] }) };

    useCase = new ApproveRequisition({
      requisitionRepository: reqRepo,
      userRepository: userRepo,
      stockRepository: stockRepo,
      orderRepository: orderRepo,
      reserveStockUseCase: reserveUC
    });
  });

  const conn = { query: jest.fn() };

  test('Should delegate reservation to reserveStockUseCase', async () => {
    await useCase.execute(conn, { requisitionId: 1, approvedBy: 99 });

    expect(reserveUC.execute).toHaveBeenCalledWith(conn, {
      warehouseId: 1,
      items: [{ productId: 20, quantity: 5 }]
    });
    expect(reqRepo.updateStatus).toHaveBeenCalled();
  });
});
