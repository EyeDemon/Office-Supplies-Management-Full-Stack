'use strict';
/**
 * StartCountingStocktaking.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Transition: OPEN → COUNTING
 * Locks the warehouse for operations.
 */
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog }         = require('../../shared/utils/auditLogger');
const { NotFoundError }           = require('../../domain/errors');

class StartCountingStocktaking {
  constructor({ stocktakingRepository } = {}) {
    this.repo = stocktakingRepository;
  }

  async execute(conn, { sessionId, actorId, ipAddress }) {
    const session = await this.repo.findById(conn, sessionId, true);
    if (!session) throw new NotFoundError('StocktakingSession', sessionId);

    assertValidTransition('stocktaking', session.status, 'COUNTING');

    await this.repo.updateStatus(conn, sessionId, { status: 'COUNTING' });

    await writeAuditLog(conn, {
      entityType: 'stocktaking_session', entityId: sessionId, action: 'START_COUNTING',
      changedBy: actorId, ipAddress,
      beforeData: { status: session.status },
      afterData: { status: 'COUNTING' },
    });

    return { sessionId, status: 'COUNTING' };
  }
}

module.exports = StartCountingStocktaking;
