'use strict';
/**
 * CancelRequisition.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.3: Request cancellation
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { NotFoundError, InvalidStateTransitionError, UnauthorizedError } = require('../../domain/errors');

class CancelRequisition {
  constructor({ requisitionRepository, stockRepository } = {}) {
    this.reqRepo   = requisitionRepository;
    this.stockRepo = stockRepository;
  }

  async execute(conn, { requisitionId, cancelledBy, userRole, reason, ipAddress }) {
    const r = await this.reqRepo.findById(conn, requisitionId, true);
    if (!r) throw new NotFoundError('Phiếu yêu cầu', requisitionId);

    // Chỉ có thể huỷ khi PENDING hoặc APPROVED
    if (!['PENDING', 'APPROVED'].includes(r.status)) {
      throw new InvalidStateTransitionError({ from: r.status, to: 'CANCELLED', entity: 'Requisition' });
    }

    // Nếu không phải ADMIN/MANAGER thì chỉ người tạo mới được huỷ
    if (!['ADMIN', 'MANAGER'].includes(userRole) && r.requester_id !== cancelledBy) {
      throw new UnauthorizedError('Bạn không có quyền huỷ phiếu này');
    }

    const prevStatus = r.status;
    await this.reqRepo.updateStatus(conn, requisitionId, {
      status: 'CANCELLED',
      cancelledAt: 'NOW()',
    });

    // Nếu đã APPROVED (có giữ chỗ tồn kho) -> Giải phóng tồn kho (Reserved -= approved_qty)
    let stockReleased = false;
    if (prevStatus === 'APPROVED') {
      const items = await this.reqRepo.findItems(conn, requisitionId);
      for (const item of items) {
        if (item.quantity_approved > 0) {
          // Release from specific warehouse stock
          // [FIX] Use StockRepository method and remove manual global update (handled by trigger)
          await this.stockRepo.decreaseReservation(conn, r.warehouse_id, item.product_id, item.quantity_approved);
        }
      }
      stockReleased = true;
    }

    await writeAuditLog(conn, {
      entityType: 'requisition', entityId: requisitionId, action: 'CANCEL',
      changedBy: cancelledBy, ipAddress,
      beforeData: { status: prevStatus }, afterData: { status: 'CANCELLED', reason },
    });

    return { reqCode: r.req_code, stockReleased };
  }
}

module.exports = CancelRequisition;
