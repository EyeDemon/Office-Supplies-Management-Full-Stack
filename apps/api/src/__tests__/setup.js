'use strict';
require('dotenv').config();
/**
 * src/__tests__/setup.js
 * Toàn cục Mocking cho Integration Tests
 */

const mockQuery = jest.fn().mockImplementation((sql, params) => {
  const s = sql.toLowerCase();
  if (s.includes('get_lock')) return Promise.resolve([[{ lockAcq: 1 }]]);
  if (s.includes('count(*)')) return Promise.resolve([[{ total: 10 }]]);
  if (s.includes('max(')) return Promise.resolve([[{ maxSeq: 0 }]]);
  if (s.includes('coalesce(max')) return Promise.resolve([[{ maxSeq: 0 }]]);
  
  // Mock login for 'admin'
  if (s.includes('from users') && s.includes('username=?')) {
    if (params && params[0] === 'admin') {
      return Promise.resolve([[{
        id: 1,
        username: 'admin',
        password: '$2a$12$idza8aCc/G0TLDhXDvromej02DHSDu3KE47ldq45YZTnKvRccdRNW', // hash for qlvpp_pw
        role: 'ADMIN',
        full_name: 'System Admin',
        email: 'admin@qlvpp.com',
        deleted: 0,
        active: 1
      }]]);
    }
  }

  // Mock Master Data existence (findById)
  const isMatch = (table) => s.includes(`from ${table}`) && (s.includes('id=?') || s.includes('id = ?'));

  if (isMatch('products')) return Promise.resolve([[{ id: params[0], name: 'Test Product', sku: 'TEST-SKU', deleted: 0 }]]);
  if (isMatch('departments')) return Promise.resolve([[{ id: params[0], name: 'Test Dept' }]]);
  if (isMatch('warehouses')) return Promise.resolve([[{ id: params[0], name: 'Test Warehouse' }]]);
  if (s.includes('from warehouse_stock')) return Promise.resolve([[{ stock_qty: 100 }]]);
  if (isMatch('requisitions')) return Promise.resolve([[{ id: params[0], status: 'PENDING', created_by: 1 }]]);

  return Promise.resolve([[]]);
});

// 1. Giả lập (Mock) database config
/*
jest.mock('../shared/config/db', () => ({
  query: mockQuery,
  getConnection: jest.fn().mockResolvedValue({
    ping:    jest.fn().mockResolvedValue(true),
    release: jest.fn(),
    query:   mockQuery,
    execute: jest.fn().mockResolvedValue([[]]),
    beginTransaction: jest.fn().mockResolvedValue(true),
    commit:  jest.fn().mockResolvedValue(true),
    rollback: jest.fn().mockResolvedValue(true),
  }),
  execute:       jest.fn().mockResolvedValue([[]]),
  isHealthy:     jest.fn().mockResolvedValue(true),
  beginTransactionWithTimeout: jest.fn().mockResolvedValue(true),
  end:           jest.fn().mockResolvedValue(true),
}));
*/

// 2. Giả lập Auth & RBAC Middleware
const mockAuth = {
  requireLogin: (req, res, next) => {
    req.session = { 
      userId: 1, 
      username: 'admin', 
      role: 'ADMIN',
      cookie: { secure: false, httpOnly: true, maxAge: 3600000 },
      touch: () => {},
      destroy: (cb) => cb && cb(),
      save: (cb) => cb && cb()
    };
    next();
  },
  requireAdmin: (req, res, next) => next(),
  requireManagerOrAdmin: (req, res, next) => next(),
  requireWarehouseOrAdmin: (req, res, next) => next(),
  requireSelfOrAdmin: (req, res, next) => next(),
  sanitizeLike: (v) => v,
  parsePage: (q) => ({ page: 0, size: 50 }),
  getClientIp: () => '127.0.0.1'
};

// Note: cả 2 path đều trỏ về cùng authenticate module
jest.mock('../shared/middleware/authenticate', () => mockAuth);

jest.mock('../shared/middleware/authorize', () => ({
  csrfProtect: (req, res, next) => next(),
  generateCsrfToken: () => 'mock-csrf-token'
}));

jest.mock('../shared/middleware/rbac', () => ({
  attachUserWarehouses: (req, res, next) => {
    req.userWarehouseIds = null;
    next();
  },
  buildWarehouseFilter: () => ({ clause: '1=1', params: [] }),
  requireWarehouseAccess: () => (req, res, next) => next(),
  getUserWarehouseIds: jest.fn().mockResolvedValue(null)
}));

// 3. Giả lập Idempotency
jest.mock('../shared/middleware/idempotency', () => ({
  idempotencyCheck: (req, res, next) => next(),
  cleanupExpiredKeys: jest.fn()
}));

// 4. Giả lập Audit Log
jest.mock('../shared/utils/auditLogger', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(true)
}));

// 5. Giả lập Redis & Rate Limiter (to avoid connection refused)
jest.mock('../shared/config/redis', () => ({
  get: () => Promise.resolve(null),
  set: () => Promise.resolve('OK'),
  del: () => Promise.resolve(1),
  on: () => {},
  status: 'ready'
}));

jest.mock('../shared/middleware/rate-limiter', () => {
  const mw = (req, res, next) => next();
  return {
    globalRateLimit: mw,
    loginRateLimit: mw,
    registerRateLimit: mw,
    forgotPasswordRateLimit: mw,
    resetPasswordRateLimit: mw,
    recordFailure: jest.fn(),
    resetOnSuccess: jest.fn(),
    recordLockFailure: jest.fn(),
    resetLockout: jest.fn(),
    quit: jest.fn()
  };
});

// Mock ioredis as a proper class so both require() and ESM default import work
const MockRedisInstance = {
  get: () => Promise.resolve(null),
  set: () => Promise.resolve('OK'),
  del: () => Promise.resolve(1),
  on: () => {},
  status: 'ready',
  pipeline: () => ({
    zremrangebyscore: function() { return this; },
    zcard: function() { return this; },
    zadd: function() { return this; },
    pexpire: function() { return this; },
    exec: () => Promise.resolve([[null, 0], [null, 0], [null, 0]])
  }),
  quit: () => Promise.resolve()
};

class MockRedis {
  constructor() { return MockRedisInstance; }
  static Cluster = class { constructor() { return MockRedisInstance; } }
}
// Ensure both CJS require() and ESM `import ioredis from 'ioredis'` (.default) resolve to the class
MockRedis.default = MockRedis;

jest.mock('ioredis', () => MockRedis);

// Mock bullmq entirely to avoid internal ioredis ESM resolution issues
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    close: jest.fn().mockResolvedValue(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(),
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(),
  })),
}));

console.log('[Jest Setup] System is fully mocked for integration testing.');
