'use strict';
/**
 * server.js — QLVPP API Entry Point v4.1
 * Refactored for stability, security, and performance.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');

const db = require('./src/shared/config/db');
const logger = require('./src/shared/logger');
const { pinoHttp } = logger;
const swagger = require('./src/shared/docs/swagger');
const globalErrorHandler = require('./src/shared/middleware/globalErrorHandler');
const { cleanupExpiredKeys } = require('./src/shared/middleware/idempotency');
const { csrfProtect } = require('./src/shared/middleware/authorize');
const { scheduleDailySnapshot } = require('./src/jobs/dailySnapshot');
const { scheduleInventoryIntelligence } = require('./src/jobs/inventoryIntelligence');
const { globalRateLimit } = require('./src/shared/middleware/rate-limiter');
const crypto = require('crypto');

// ── 0. Security Boot Check (SEC-01) ───────────────────────────────
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('❌ CRITICAL: SESSION_SECRET is missing or too short (min 32 chars).');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 8080;

// [DO-05] Structured logging middleware with requestId
// ── 0. Logger (DO-01) ─────────────────────────────────────────────
app.use(pinoHttp);

// ── 1. Middleware Cơ bản (BUG-03) ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    }
  }
}));
app.use(compression()); // Tối ưu hóa dung lượng truyền tải
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 2. Session Store ──────────────────────────────────────────────
// server.js — express-mysql-session v3: truyền pool làm tham số thứ 2
// Không dùng createDatabaseConnection (API v1/v2 cũ đã bị loại bỏ trong v3)
const sessionStore = new MySQLStore({
  expiration: 86400000, // 24h — khớp với cookie.maxAge
  createDatabaseTable: false,    // Bảng sessions đã có trong schema.sql
  schema: { tableName: 'sessions' }
}, db.pool);
app.use(session({
  key: 'qlvpp.sid',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));
app.use(globalRateLimit);

// ── 3. CSRF Protection ───────────────────────────────────────────
app.use(csrfProtect);

// ── 4. Static Files ───────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── 5. Routes ─────────────────────────────────────────────────────

// Auth & Users
app.use('/api/auth', require('./src/controllers/auth.controller'));
app.use('/api/users', require('./src/controllers/user.controller'));
app.use('/api/user-warehouses', require('./src/controllers/user-warehouse.controller'));
app.use('/api/departments', require('./src/controllers/department.controller'));

// Master Data
app.use('/api/products', require('./src/controllers/product.controller'));
app.use('/api/categories', require('./src/controllers/category.controller'));
app.use('/api/units', require('./src/controllers/unit.controller'));
app.use('/api/unit-conversions', require('./src/controllers/unit-conversion.controller'));
app.use('/api/warehouses', require('./src/controllers/warehouse.controller'));
app.use('/api/suppliers', require('./src/controllers/supplier.controller'));

// Inventory & Stock
app.use('/api/adjustments', require('./src/controllers/adjustment.controller')); // BUG-01 Fix
app.use('/api/transfers', require('./src/controllers/transfer.controller'));
app.use('/api/stocktaking', require('./src/controllers/stocktaking.controller'));
app.use('/api/returns', require('./src/controllers/return.controller'));
app.use('/api/lots', require('./src/controllers/lot.controller'));
app.use('/api/stock-ledger', require('./src/controllers/stock-ledger.controller'));
app.use('/api/warehouse-locations', require('./src/controllers/warehouse-location.controller'));

// Procurement
app.use('/api/purchases', require('./src/controllers/purchase.controller'));

// Requisitions & Orders
app.use('/api/requisitions', require('./src/controllers/requisition.controller'));
app.use('/api/export-orders', require('./src/controllers/export-order.controller'));
app.use('/api/orders', require('./src/controllers/order.controller'));

// Analytics & Reports
app.use('/api/analytics', require('./src/controllers/analytics.controller'));
app.use('/api/reports', require('./src/controllers/report.controller'));
app.use('/api/dashboard', require('./src/controllers/dashboard.controller'));
app.use('/api/audit', require('./src/controllers/audit.controller'));

// API Documentation
app.use('/api-docs', swagger.serve, swagger.setup);

// Notifications
app.use('/api/notifications', require('./src/controllers/notification.controller'));

// CSRF Token
app.get('/api/csrf-token', (req, res) => {
  try {
    if (!req.session) {
      console.error('[CSRF] Session missing in req');
      return res.status(500).json({ success: false, message: 'Session not initialized' });
    }
    const { generateCsrfToken } = require('./src/shared/middleware/authorize');
    const token = generateCsrfToken(req);
    req.session.save(); // Force session persistence to prevent race conditions
    res.json({ success: true, token });
  } catch (err) {
    console.error('[CSRF] Token generation error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 6. Health Check (BUG-02 Fix) ───────────────────────────────────
const healthHandler = async (req, res) => {
  const dbHealthy = await db.isHealthy();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'UP' : 'DOWN',
    timestamp: new Date(),
    version: '4.1.0'
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler); // Backward compatibility for Docker

// ── 7. Global Error Handler ──────────────────────────────────────
app.use(globalErrorHandler);

// ── 8. Start Server ──────────────────────────────────────────────
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`QLVPP API v4.1.0 -> http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
    scheduleDailySnapshot();
    scheduleInventoryIntelligence();
    require('./src/shared/infrastructure/EventWorker');
    setInterval(cleanupExpiredKeys, 3600000);
    setTimeout(cleanupExpiredKeys, 5000);
  });
}

// ── 9. Graceful Shutdown (DO-04 + DO-05) ─────────────────────────
const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down server...');
  
  // [ARCH-05] Force exit timeout guard (30s)
  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, force exiting.');
    process.exit(1);
  }, 30000);
  forceExit.unref();

  if (server) {
    await new Promise(resolve => {
      server.close(() => {
        logger.info('HTTP server closed.');
        resolve();
      });
      setTimeout(() => resolve(), 3000);
    });
  }

  try {
    const worker = require('./src/shared/infrastructure/EventWorker');
    await worker.close();
    logger.info('EventWorker closed.');
  } catch (e) { }

  try {
    const { quit } = require('./src/shared/middleware/rate-limiter');
    await quit();
    logger.info('Redis Limiter closed.');
  } catch (e) { }

  try {
    await db.end();
    logger.info('MySQL Pool closed.');
  } catch (e) { }

  if (signal !== 'TEST') {
    logger.info('Shutdown complete. Goodbye!');
    clearTimeout(forceExit);
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', reason => console.error('[UnhandledRejection]', reason));
process.on('uncaughtException', err => { console.error('[UncaughtException]', err.stack); shutdown('ERROR'); });

module.exports = app;