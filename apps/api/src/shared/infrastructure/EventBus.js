'use strict';
/**
 * EventBus.js — Infrastructure Layer
 *
 * Spec IX / X.3: Event-driven architecture using BullMQ.
 * Decouples business logic from side-effects (Notifications, Logging).
 *
 * [FIX-BUG1] Lazy Redis initialization + error handler để không crash
 * khi Redis chưa sẵn sàng (dev local không có Redis).
 */
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redisConfig = require('../config/redis');

// [FIX] Lazy init — không tạo kết nối ngay lúc require()
let _connection = null;
let _eventsQueue = null;

function getConnection() {
  if (!_connection) {
    _connection = new Redis({
      ...redisConfig,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    // [FIX] BẮT BUỘC có error handler — không có thì Node.js crash
    _connection.on('error', (err) => {
      console.error('[EventBus] Redis connection error (non-fatal):', err.message);
    });
  }
  return _connection;
}

function getQueue() {
  if (!_eventsQueue) {
    _eventsQueue = new Queue('qlvpp-events', { connection: getConnection() });
  }
  return _eventsQueue;
}

/**
 * Emit an event to the background worker.
 * @param {string} eventName - e.g. 'REQUEST_CREATED', 'STOCK_LOW'
 * @param {object} data - payload
 */
async function emit(eventName, data) {
  try {
    await getQueue().add(eventName, {
      eventName,
      data,
      timestamp: new Date().toISOString(),
    }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    console.log(`[EventBus] Emitted: ${eventName}`);
  } catch (err) {
    console.error(`[EventBus] Failed to emit ${eventName}:`, err.message);
  }
}

module.exports = { emit };