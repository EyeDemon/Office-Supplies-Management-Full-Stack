'use strict';
const { emit } = require('../infrastructure/EventBus');
const db = require('../config/db');

/**
 * Check if stock is low for a product and emit STOCK_LOW event if needed.
 */
async function checkAndEmitStockLow(conn, productId) {
  try {
    const [[p]] = await conn.query(
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
}

/**
 * Emit APPROVAL_REQUIRED event.
 */
async function emitApprovalRequired(entityType, entityId, data) {
  await emit('APPROVAL_REQUIRED', { entityType, entityId, ...data });
}

/**
 * Emit TRANSACTION_COMPLETED event.
 */
async function emitTransactionCompleted(type, refId, data) {
  await emit('TRANSACTION_COMPLETED', { type, refId, ...data });
}

module.exports = { 
  checkAndEmitStockLow, 
  emitApprovalRequired, 
  emitTransactionCompleted 
};
