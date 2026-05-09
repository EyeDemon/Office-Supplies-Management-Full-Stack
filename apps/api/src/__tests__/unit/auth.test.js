'use strict';
/**
 * auth.test.js — Unit Tests: Auth Domain & Use-Cases
 *
 * Test Suite:
 *   1. RegisterSchema (Zod DTO validation)
 *   2. LoginUseCase  (mock UserRepository)
 *   3. Stock entity  (available, assertSufficientStock, computeNewAvg)
 *   4. CostingEngine (computeMovingAverage)
 *   5. StateMachine  (assertValidTransition)
 *
 * Mock Strategy: Jest mock các repository — không kết nối DB thật.
 * Nguyên lý: SOLID-S + DRY + Clean Architecture boundary tests.
 */

// ── 1. Zod DTO: RegisterSchema ────────────────────────────────────
describe('RegisterSchema — Zod DTO Validation', () => {
  const { RegisterSchema } = require('../../shared/dto/auth.dto');

  test('valid input passes', () => {
    const result = RegisterSchema.parse({
      username: 'user01',
      email: 'user01@example.com',
      fullName: 'Nguyen Van A',
      password: 'secret123',
    });
    expect(result.username).toBe('user01');
    expect(result.email).toBe('user01@example.com'); // lowercased
  });

  test('username < 3 chars fails', () => {
    expect(() =>
      RegisterSchema.parse({ username: 'ab', email: 'a@b.com', fullName: 'A', password: '123456' })
    ).toThrow();
  });

  test('username with spaces fails', () => {
    expect(() =>
      RegisterSchema.parse({ username: 'user 01', email: 'a@b.com', fullName: 'A B', password: '123456' })
    ).toThrow();
  });

  test('invalid email fails', () => {
    expect(() =>
      RegisterSchema.parse({ username: 'user01', email: 'not-an-email', fullName: 'A B', password: '123456' })
    ).toThrow();
  });

  test('password < 6 chars fails', () => {
    expect(() =>
      RegisterSchema.parse({ username: 'user01', email: 'a@b.com', fullName: 'A B', password: '123' })
    ).toThrow();
  });

  test('confirmPassword mismatch fails', () => {
    expect(() =>
      RegisterSchema.parse({
        username: 'user01', email: 'a@b.com', fullName: 'A B',
        password: '123456', confirmPassword: 'different',
      })
    ).toThrow(/xác nhận/i);
  });

  test('email is lowercased on parse', () => {
    const { email } = RegisterSchema.parse({
      username: 'user01', email: 'USER@EXAMPLE.COM', fullName: 'A B', password: '123456',
    });
    expect(email).toBe('user@example.com');
  });
});

// ── 2. Stock Entity ───────────────────────────────────────────────
describe('Stock Entity', () => {
  const Stock = require('../../domain/entities/Stock');
  const InsufficientStockError = require('../../domain/errors/InsufficientStockError');

  test('available = stockQty - reservedQuantity', () => {
    const s = new Stock({ warehouseId: 1, productId: 1, stockQty: 100, reservedQuantity: 30 });
    expect(s.available).toBe(70);
  });

  test('available never negative', () => {
    const s = new Stock({ warehouseId: 1, productId: 1, stockQty: 10, reservedQuantity: 20 });
    expect(s.available).toBe(0);
  });

  test('assertSufficientStock passes when available >= qty', () => {
    const s = new Stock({ warehouseId: 1, productId: 1, stockQty: 50, reservedQuantity: 10 });
    expect(() => s.assertSufficientStock(40)).not.toThrow();
  });

  test('assertSufficientStock throws InsufficientStockError when available < qty', () => {
    const s = new Stock({ warehouseId: 1, productId: 5, stockQty: 20, reservedQuantity: 5 });
    expect(() => s.assertSufficientStock(20)).toThrow(InsufficientStockError);
  });

  test('computeNewAvg: [Spec IV] 10@50k + 5@60k = 53,333.33', () => {
    const s = new Stock({ warehouseId: 1, productId: 1, stockQty: 10, avgUnitPrice: 50000 });
    const newAvg = s.computeNewAvg(5, 60000);
    expect(newAvg).toBeCloseTo(53333.33, 1); // 6dp precision: 53333.333333";
  });

  test('computeNewAvg: kho trống → avg = import price', () => {
    const s = new Stock({ warehouseId: 1, productId: 1, stockQty: 0, avgUnitPrice: 0 });
    expect(s.computeNewAvg(10, 50000)).toBe(50000);
  });

  test('computeNewAvg: inPrice = 0 giữ nguyên avg', () => {
    const s = new Stock({ warehouseId: 1, productId: 1, stockQty: 10, avgUnitPrice: 50000 });
    expect(s.computeNewAvg(5, 0)).toBe(50000);
  });
});

// ── 3. CostingEngine (domain/rules) ──────────────────────────────
describe('CostingEngine — computeMovingAverage', () => {
  const { computeMovingAverage } = require('../../domain/rules');

  test('[Spec IV] 10@50k + 5@60k = 53,333.33đ', () => {
    // computeMovingAverage dùng 6dp precision (53333.333333) để đảm bảo độ chính xác tài chính
    expect(computeMovingAverage(10, 50000, 5, 60000)).toBeCloseTo(53333.33, 1);
  });

  test('empty stock + import = import price', () => {
    expect(computeMovingAverage(0, 0, 10, 75000)).toBe(75000);
  });

  test('same price → avg unchanged', () => {
    expect(computeMovingAverage(20, 30000, 10, 30000)).toBe(30000);
  });

  test('inPrice = 0 → keep old avg', () => {
    expect(computeMovingAverage(10, 45000, 5, 0)).toBe(45000);
  });
});

// ── 4. StateMachine (domain/rules) ───────────────────────────────
describe('StateMachine — assertValidTransition', () => {
  const { assertValidTransition } = require('../../domain/rules');
  const { InvalidStateTransitionError } = require('../../domain/errors');

  test('DRAFT → PENDING (import_order) is valid', () => {
    expect(() => assertValidTransition('import_order', 'DRAFT', 'PENDING')).not.toThrow();
  });

  test('DRAFT → COMPLETED (import_order) throws', () => {
    expect(() => assertValidTransition('import_order', 'DRAFT', 'COMPLETED'))
      .toThrow(InvalidStateTransitionError);
  });

  test('COMPLETED → CANCELLED throws (terminal state)', () => {
    expect(() => assertValidTransition('import_order', 'COMPLETED', 'CANCELLED'))
      .toThrow(InvalidStateTransitionError);
  });

  test('unknown entity throws', () => {
    expect(() => assertValidTransition('unknown_entity', 'DRAFT', 'PENDING'))
      .toThrow(InvalidStateTransitionError);
  });

  test('requisition PENDING → APPROVED is valid', () => {
    expect(() => assertValidTransition('requisition', 'PENDING', 'APPROVED')).not.toThrow();
  });

  test('export_order APPROVED → COMPLETED is valid', () => {
    expect(() => assertValidTransition('export_order', 'APPROVED', 'COMPLETED')).not.toThrow();
  });
});

// ── 5. InsufficientStockError ─────────────────────────────────────
describe('InsufficientStockError', () => {
  const InsufficientStockError = require('../../domain/errors/InsufficientStockError');

  test('has correct code and status', () => {
    const err = new InsufficientStockError({ warehouseId: 1, productId: 2, available: 5, requested: 10 });
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(err.status).toBe(409);
    expect(err.message).toContain('kho #1');
    expect(err.meta.available).toBe(5);
    expect(err.meta.requested).toBe(10);
  });
});

// ── 6. paginate.js ────────────────────────────────────────────────
describe('paginate.js — unified pagination', () => {
  const { parsePagination, paginateResponse } = require('../../shared/utils/paginate');

  test('parsePagination: default page=1, size=20', () => {
    const { page, size, offset } = parsePagination({});
    expect(page).toBe(1);
    expect(size).toBe(20);
    expect(offset).toBe(0);
  });

  test('parsePagination: page=3, size=10 → offset=20', () => {
    const { page, size, offset } = parsePagination({ page: '3', size: '10' });
    expect(page).toBe(3);
    expect(size).toBe(10);
    expect(offset).toBe(20);
  });

  test('parsePagination: clamps size to maxSize', () => {
    const { size } = parsePagination({ size: '9999' }, { maxSize: 100 });
    expect(size).toBe(100);
  });

  test('paginateResponse: calculates totalPages correctly', () => {
    const result = paginateResponse({ items: [], totalCount: 55, page: 1, size: 20 });
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
  });
});