'use strict';
/**
 * CreateStocktakingSession.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.6: Stocktaking creation
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');

class CreateStocktakingSession {
  constructor({ stocktakingRepository } = {}) {
    this.repo = stocktakingRepository;
  }

  async execute(conn, { note, productIds, warehouseId, createdBy, ipAddress }) {
    const sessionCode = await this.repo.genSessionCode(conn);
    const sessionId = await this.repo.createSession(conn, {
      sessionCode, note, warehouseId, createdBy
    });

    // Lấy tồn kho hệ thống tại thời điểm tạo phiếu
    const prods = await this.repo.getProductsForStocktaking(conn, { warehouseId, productIds });
    await this.repo.insertSessionItems(conn, sessionId, prods);

    await writeAuditLog(conn, {
      entityType: 'stocktaking_session', entityId: sessionId, action: 'CREATE',
      changedBy: createdBy, ipAddress,
      afterData: { sessionCode, status: 'OPEN', warehouseId, itemCount: prods.length },
    });

    return { id: sessionId, sessionCode };
  }
}

module.exports = CreateStocktakingSession;
