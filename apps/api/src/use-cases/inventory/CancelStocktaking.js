'use strict';
/**
 * CancelStocktaking.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.6: Huỷ đợt kiểm kê
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { NotFoundError, ValidationError } = require('../../domain/errors');

class CancelStocktaking {
  constructor({ stocktakingRepository } = {}) {
    this.repo = stocktakingRepository;
  }

  async execute(conn, { sessionId, cancelledBy, ipAddress }) {
    const status = await this.repo.getSessionStatusForUpdate(conn, sessionId);
    if (!status) throw new NotFoundError('Đợt kiểm kê', sessionId);
    if (!['OPEN', 'COUNTING'].includes(status)) {
        throw new ValidationError(`Chỉ có thể huỷ đợt kiểm kê đang OPEN hoặc COUNTING (trạng thái hiện tại: ${status})`);
    }

    await this.repo.cancelSession(conn, sessionId);

    await writeAuditLog(conn, {
      entityType: 'stocktaking_session', entityId: sessionId, action: 'CANCEL',
      changedBy: cancelledBy, ipAddress,
      beforeData: { status: 'OPEN' }, afterData: { status: 'CANCELLED' },
    });

    return { success: true };
  }
}

module.exports = CancelStocktaking;
