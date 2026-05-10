'use strict';
const { emit } = require('../infrastructure/EventBus');
const db = require('../config/db');

/**
 * Check if stock is low for a product and emit STOCK_LOW event if needed.
 */
async function checkAndEmitStockLow(conn, productId) {
  const checkAction = async (dbConn) => {
    try {
      const [[p]] = await dbConn.query(
        'SELECT id, name, sku, stock_qty, min_stock_qty FROM products WHERE id = ?',
        [productId]
      );
      if (p && p.stock_qty <= p.min_stock_qty) {
        await emit('STOCK_LOW', {
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          stockQty: p.stock_qty,
          minStockQty: p.min_stock_qty,
          isOut: p.stock_qty <= 0
        });
      }
    } catch (err) {
      console.error('[eventHelper] Stock check failed:', err.message);
    }
  };

  if (conn && conn._deferredEvents) {
    // If deferred, we MUST use the pool later because conn will be released
    conn._deferredEvents.push(() => checkAction(db)); 
  } else {
    await checkAction(conn || db);
  }
}

/**
 * Emit APPROVAL_REQUIRED event.
 */
async function emitApprovalRequired(entityType, entityId, data, conn = null) {
  const action = () => emit('APPROVAL_REQUIRED', { entityType, entityId, ...data });
  if (conn && conn._deferredEvents) {
    conn._deferredEvents.push(action);
  } else {
    await action();
  }
}

/**
 * Emit TRANSACTION_COMPLETED event.
 */
async function emitTransactionCompleted(type, refId, data, conn = null) {
  const action = () => emit('TRANSACTION_COMPLETED', { type, refId, ...data });
  if (conn && conn._deferredEvents) {
    conn._deferredEvents.push(action);
  } else {
    await action();
  }
}

module.exports = { 
  checkAndEmitStockLow, 
  emitApprovalRequired, 
  emitTransactionCompleted 
};
