'use strict';
/**
 * UpdateRequisition.js — Use Case for updating/resubmitting a rejected requisition.
 * (Clean Architecture — Layer 2: Application Business Rules)
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { ValidationError, NotFoundError, UnauthorizedError } = require('../../domain/errors');

class UpdateRequisition {
  constructor({ requisitionRepository } = {}) {
    this.reqRepo = requisitionRepository;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   * @param {number} opts.id
   * @param {number} opts.userId
   * @param {object} opts.dto
   * @param {string} opts.ipAddress
   */
  async execute(conn, { id, userId, dto, ipAddress }) {
    const existing = await this.reqRepo.findById(conn, id, true);
    if (!existing) throw new NotFoundError('Phiếu yêu cầu', id);
    if (existing.requester_id !== userId) throw new UnauthorizedError('Không có quyền sửa phiếu này');
    if (existing.status !== 'REJECTED') throw new ValidationError('Chỉ có thể sửa phiếu bị Từ chối');

    await this.reqRepo.validateProductsExist(conn, dto.items.map(i => i.productId));
    
    await this.reqRepo.updateHeader(conn, id, { 
      note: dto.note, 
      warehouseId: dto.warehouseId, 
      status: 'PENDING' 
    });
    
    await this.reqRepo.deleteItemsByReqId(conn, id);
    await this.reqRepo.createItems(conn, id, dto.items.map(i => ({
      productId: i.productId, 
      quantity: i.quantityRequested, 
      note: i.note
    })));

    await writeAuditLog(conn, {
      entityType: 'requisition', 
      entityId: id, 
      action: 'UPDATE_RESUBMIT',
      changedBy: userId, 
      ipAddress,
      beforeData: { status: 'REJECTED' },
      afterData: { status: 'PENDING', warehouse_id: dto.warehouseId, item_count: dto.items.length },
    });

    return { id, reqCode: existing.req_code };
  }
}

module.exports = UpdateRequisition;
