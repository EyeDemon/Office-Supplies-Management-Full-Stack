'use strict';
/**
 * CreateRequisition.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.3: Request creation
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { emit: emitEvent } = require('../../shared/infrastructure/EventBus');

class CreateRequisition {
  constructor({ requisitionRepository, userRepository, quotaRepository, productRepository } = {}) {
    this.reqRepo = requisitionRepository;
    this.userRepo = userRepository;
    this.quotaRepo = quotaRepository;
    this.productRepo = productRepository;
  }

  async execute(conn, { requesterId, warehouseId, note, items, ipAddress }) {
    await this.reqRepo.validateProductsExist(conn, items.map(i => i.productId));

    // MISS-04: Quota validation
    const requester = await this.userRepo.findById(requesterId);
    if (requester && requester.departmentId && this.quotaRepo) {
      let totalEstAmount = 0;
      for (const item of items) {
        const product = await this.productRepo.findById(conn, item.productId);
        if (product) {
          totalEstAmount += Number(product.price || 0) * Number(item.quantity);
        }
      }

      const hasQuota = await this.quotaRepo.hasEnoughQuota(conn, requester.departmentId, totalEstAmount);
      if (!hasQuota) {
        const err = new Error('Hạn mức tiêu thụ của phòng ban đã vượt quá giới hạn tháng này');
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }
    }

    const reqCode = await this.reqRepo.genReqCode(conn);
    const requisitionId = await this.reqRepo.create(conn, {
      reqCode, requesterId, warehouseId, note
    });

    await this.reqRepo.createItems(conn, requisitionId, items);


    await writeAuditLog(conn, {
      entityType: 'requisition', entityId: requisitionId, action: 'CREATE',
      changedBy: requesterId, ipAddress,
      afterData: { reqCode, status: 'PENDING', warehouseId, itemCount: items.length },
    });

    const requesterName = await this.userRepo.findNameById(conn, requesterId);
    emitEvent('REQUISITION_CREATED', {
      requisitionId,
      reqCode,
      requesterId,
      requesterName
    });

    return { id: requisitionId, reqCode };
  }
}

module.exports = CreateRequisition;
