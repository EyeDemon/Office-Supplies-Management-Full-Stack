'use strict';
/**
 * utils.test.js — Unit Tests for Shared Utilities & Domain Services
 *
 * Covers:
 *   1. cacheHelper (getOrSet, invalidate) — Redis cache wrapper
 *   2. eventHelper (checkAndEmitStockLow, emitApprovalRequired, emitTransactionCompleted)
 *   3. UnitService (convertToBase, getConversionRatio with BFS)
 */

// ── 1. cacheHelper ────────────────────────────────────────────────
describe('cacheHelper', () => {
  let mockRedis;
  let getOrSet, invalidate;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    jest.mock('../../shared/infrastructure/RedisClient', () => ({
      getClient: () => mockRedis,
    }));
    // Re-require to use fresh mock
    jest.resetModules();
    jest.mock('../../shared/infrastructure/RedisClient', () => ({
      getClient: () => mockRedis,
    }));
    const helper = require('../../shared/utils/cacheHelper');
    getOrSet = helper.getOrSet;
    invalidate = helper.invalidate;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('getOrSet: returns cached value on hit', async () => {
    const cachedData = { name: 'cached product' };
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));
    const fetchFn = jest.fn().mockResolvedValue({ name: 'fresh' });

    const result = await getOrSet('products:1', fetchFn);

    expect(result).toEqual(cachedData);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('getOrSet: fetches and caches on miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    const freshData = { name: 'fresh product' };
    const fetchFn = jest.fn().mockResolvedValue(freshData);

    const result = await getOrSet('products:1', fetchFn, 60);

    expect(result).toEqual(freshData);
    expect(fetchFn).toHaveBeenCalled();
    expect(mockRedis.set).toHaveBeenCalledWith(
      'products:1',
      JSON.stringify(freshData),
      'EX',
      60
    );
  });

  test('getOrSet: returns data even if Redis SET fails (graceful degradation)', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockRejectedValue(new Error('Redis down'));
    const freshData = { name: 'fallback data' };
    const fetchFn = jest.fn().mockResolvedValue(freshData);

    const result = await getOrSet('products:1', fetchFn);
    expect(result).toEqual(freshData); // Still returns data
  });

  test('getOrSet: returns data even if Redis GET fails (graceful degradation)', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis down'));
    const freshData = { name: 'fallback data' };
    const fetchFn = jest.fn().mockResolvedValue(freshData);

    const result = await getOrSet('products:1', fetchFn);
    expect(result).toEqual(freshData);
  });

  test('invalidate: calls redis.del with key', async () => {
    await invalidate('products:1');
    expect(mockRedis.del).toHaveBeenCalledWith('products:1');
  });

  test('invalidate: handles Redis DEL error gracefully', async () => {
    mockRedis.del.mockRejectedValue(new Error('Redis down'));
    // Should not throw
    await expect(invalidate('products:1')).resolves.toBeUndefined();
  });
});

// ── 2. eventHelper ────────────────────────────────────────────────
describe('eventHelper', () => {
  let mockEmit;
  let checkAndEmitStockLow, emitApprovalRequired, emitTransactionCompleted;

  beforeEach(() => {
    jest.resetModules();
    mockEmit = jest.fn().mockResolvedValue();
    jest.mock('../../shared/infrastructure/EventBus', () => ({
      emit: mockEmit,
    }));
    const helper = require('../../shared/utils/eventHelper');
    checkAndEmitStockLow = helper.checkAndEmitStockLow;
    emitApprovalRequired = helper.emitApprovalRequired;
    emitTransactionCompleted = helper.emitTransactionCompleted;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('checkAndEmitStockLow: emits STOCK_LOW when stock <= min_stock_qty', async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([[{
        id: 5, name: 'Product A', sku: 'SKU-A', stock_qty: 3, min_stock_qty: 5
      }]])
    };
    await checkAndEmitStockLow(conn, 5);
    expect(mockEmit).toHaveBeenCalledWith('STOCK_LOW', expect.objectContaining({
      productId: 5, sku: 'SKU-A', stockQty: 3, isOut: false
    }));
  });

  test('checkAndEmitStockLow: does NOT emit when stock > min_stock_qty', async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([[{
        id: 5, name: 'Product A', sku: 'SKU-A', stock_qty: 20, min_stock_qty: 5
      }]])
    };
    await checkAndEmitStockLow(conn, 5);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  test('checkAndEmitStockLow: marks isOut=true when stock_qty <= 0', async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([[{
        id: 5, name: 'Product A', sku: 'SKU-A', stock_qty: 0, min_stock_qty: 5
      }]])
    };
    await checkAndEmitStockLow(conn, 5);
    expect(mockEmit).toHaveBeenCalledWith('STOCK_LOW', expect.objectContaining({ isOut: true }));
  });

  test('checkAndEmitStockLow: handles DB error silently', async () => {
    const conn = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    await expect(checkAndEmitStockLow(conn, 5)).resolves.toBeUndefined();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  test('emitApprovalRequired: emits correct event', async () => {
    await emitApprovalRequired('requisition', 42, { requestedBy: 'user01' });
    expect(mockEmit).toHaveBeenCalledWith('APPROVAL_REQUIRED', {
      entityType: 'requisition',
      entityId: 42,
      requestedBy: 'user01',
    });
  });

  test('emitTransactionCompleted: emits correct event', async () => {
    await emitTransactionCompleted('IMPORT', 'PN-001', { total: 500000 });
    expect(mockEmit).toHaveBeenCalledWith('TRANSACTION_COMPLETED', {
      type: 'IMPORT',
      refId: 'PN-001',
      total: 500000,
    });
  });
});

// ── 3. UnitService ────────────────────────────────────────────────
describe('UnitService', () => {
  let UnitService;

  beforeEach(() => {
    jest.resetModules();
    UnitService = require('../../domain/services/UnitService');
  });

  afterEach(() => {
    jest.resetModules();
  });

  const makeConn = ({ product, conversions } = {}) => ({
    query: jest.fn().mockImplementation((sql) => {
      if (sql.includes('FROM products')) {
        return Promise.resolve([[product || null]]);
      }
      if (sql.includes('FROM unit_conversions')) {
        return Promise.resolve([conversions || []]);
      }
      return Promise.resolve([[]]);
    }),
  });

  test('convertToBase: returns qty unchanged if fromUnitId is null', async () => {
    const conn = makeConn();
    const result = await UnitService.convertToBase(conn, 1, null, 10);
    expect(result).toBe(10);
  });

  test('convertToBase: returns qty unchanged if fromUnitId === base_unit_id', async () => {
    const conn = makeConn({ product: { base_unit_id: 2 } });
    const result = await UnitService.convertToBase(conn, 1, 2, 10);
    expect(result).toBe(10);
  });

  test('convertToBase: converts correctly using direct ratio', async () => {
    const conn = makeConn({
      product: { base_unit_id: 1 },
      conversions: [{ from_unit_id: 2, to_unit_id: 1, ratio: 12 }],  // 1 dozen = 12 units
    });
    const result = await UnitService.convertToBase(conn, 1, 2, 3); // 3 dozen
    expect(result).toBe(36); // 3 * 12 = 36
  });

  test('convertToBase: handles transitive conversion (BFS)', async () => {
    // dozen(2) → pair(3) → unit(1)
    // dozen→pair: 6, pair→unit: 2 => dozen→unit = 12
    const conn = makeConn({
      product: { base_unit_id: 1 },
      conversions: [
        { from_unit_id: 2, to_unit_id: 3, ratio: 6 },  // 1 dozen = 6 pairs
        { from_unit_id: 3, to_unit_id: 1, ratio: 2 },  // 1 pair = 2 units
      ],
    });
    const result = await UnitService.convertToBase(conn, 1, 2, 1); // 1 dozen
    expect(result).toBe(12); // 1 * 6 * 2 = 12
  });

  test('convertToBase: throws ValidationError when no conversion path exists', async () => {
    const conn = makeConn({
      product: { base_unit_id: 1 },
      conversions: [], // No paths
    });
    const { ValidationError } = require('../../domain/errors');
    await expect(UnitService.convertToBase(conn, 1, 99, 5))
      .rejects.toThrow(ValidationError);
  });

  test('getConversionRatio: returns 1.0 when fromId === toId', async () => {
    const conn = makeConn({ conversions: [] });
    const ratio = await UnitService.getConversionRatio(conn, 5, 5);
    expect(ratio).toBe(1.0);
  });

  test('getConversionRatio: supports reverse edge (toId→fromId)', async () => {
    const conn = makeConn({
      conversions: [{ from_unit_id: 1, to_unit_id: 2, ratio: 10 }], // 1 box = 10 units
    });
    // Reverse: unit(2) → box(1) = 0.1
    const ratio = await UnitService.getConversionRatio(conn, 2, 1);
    expect(ratio).toBeCloseTo(0.1, 5);
  });

  test('getConversionRatio: returns null if no path', async () => {
    const conn = makeConn({ conversions: [] });
    const ratio = await UnitService.getConversionRatio(conn, 1, 99);
    expect(ratio).toBeNull();
  });
});
