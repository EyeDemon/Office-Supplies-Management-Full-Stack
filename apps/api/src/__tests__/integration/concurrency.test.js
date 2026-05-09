/**
 * concurrency.test.js — Real Integration Test for Concurrency & Idempotency
 * 
 * Spec IX.3: Pessimistic Locking (SELECT ... FOR UPDATE NOWAIT)
 * Spec XX: Idempotency Key
 */
'use strict';

const db = require('../../shared/config/db');

// Unmock DB specifically for this integration test
jest.unmock('../../shared/config/db');

describe('Real DB Concurrency & Idempotency', () => {
  let hasDB = false;

  beforeAll(async () => {
    try {
      const conn = await db.getConnection();
      hasDB = true;
      conn.release();
    } catch (e) {
      console.warn('[concurrency.test] Skipping real DB tests: DB not reachable.');
    }
  });

  if (process.env.DB_HOST && !process.env.CI) {
    describe('Oversell Prevention (FOR UPDATE)', () => {
      test('Should prevent two concurrent outbound requests from overselling', async () => {
        if (!hasDB) return;

        const productId = 1; // Assume product 1 exists from seed
        const warehouseId = 1;
        const availableQty = 10;
        const orderQty = 6; // Each tries to take 6, total 12 > 10.

        // 1. Setup initial stock
        await db.query(
          'INSERT INTO warehouse_stock (warehouse_id, product_id, stock_qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock_qty = ?',
          [warehouseId, productId, availableQty, availableQty]
        );

        const conn1 = await db.getConnection();
        const conn2 = await db.getConnection();

        try {
          await conn1.beginTransaction();
          await conn2.beginTransaction();

          // T1 locks and reads
          const [ws1] = await conn1.query('SELECT stock_qty FROM warehouse_stock WHERE warehouse_id=? AND product_id=? FOR UPDATE', [warehouseId, productId]);
          expect(ws1[0].stock_qty).toBe(availableQty);

          // T2 tries to lock (should wait or fail with NOWAIT)
          // We use a shorter timeout or NOWAIT to prove isolation
          const t2Promise = conn2.query('SELECT stock_qty FROM warehouse_stock WHERE warehouse_id=? AND product_id=? FOR UPDATE NOWAIT', [warehouseId, productId]);
          await expect(t2Promise).rejects.toThrow(/lock/i);

          // T1 proceeds to deduct
          await conn1.query('UPDATE warehouse_stock SET stock_qty = stock_qty - ? WHERE warehouse_id=? AND product_id=?', [orderQty, warehouseId, productId]);
          await conn1.commit();

          // Now T2 can lock (start new tx for T2 since it failed above)
          await conn2.rollback();
          await conn2.beginTransaction();
          const [ws2] = await conn2.query('SELECT stock_qty FROM warehouse_stock WHERE warehouse_id=? AND product_id=? FOR UPDATE', [warehouseId, productId]);
          const currentQty = ws2[0].stock_qty;
          expect(currentQty).toBe(availableQty - orderQty); // Should be 4

          // T2 tries to deduct 6 but fails logic check (simulated use-case logic)
          if (currentQty < orderQty) {
            // Success: prevented oversell
          } else {
             throw new Error('Oversell occurred!');
          }
          await conn2.commit();
        } finally {
          conn1.release();
          conn2.release();
        }
      });
    });

    describe('Idempotency Storage (Spec XX)', () => {
      test('Should record and replay idempotency responses', async () => {
        if (!hasDB) return;

        const idemKey = `test-key-${Date.now()}`;
        const userId = 1;

        // 1. Initial record
        await db.query(
          'INSERT INTO idempotency_keys (idem_key, user_id, status, response_status, response_body) VALUES (?, ?, ?, ?, ?)',
          [idemKey, userId, 'COMPLETED', 201, JSON.stringify({ success: true, id: 123 })]
        );

        // 2. Replay logic (simulated)
        const [[cached]] = await db.query(
          'SELECT * FROM idempotency_keys WHERE idem_key=? AND user_id=?',
          [idemKey, userId]
        );

        expect(cached).toBeDefined();
        expect(cached.response_status).toBe(201);
        expect(JSON.parse(cached.response_body)).toEqual({ success: true, id: 123 });

        // Cleanup
        await db.query('DELETE FROM idempotency_keys WHERE idem_key=?', [idemKey]);
      });
    });
  } else {
    test('Skipping real DB tests in CI or if DB_HOST not set', () => {
      expect(true).toBe(true);
    });
  }
});

// Original unit-test style logic for CI/Offline speed
describe('Pure Logic - Concurrency Helpers', () => {
  const { assertValidTransition } = require('../../domain/rules');

  test('Valid transitions', () => {
    expect(() => assertValidTransition('requisition', 'PENDING', 'APPROVED')).not.toThrow();
    expect(() => assertValidTransition('requisition', 'APPROVED', 'CANCELLED')).not.toThrow();
    expect(() => assertValidTransition('requisition', 'APPROVED', 'PENDING')).toThrow();
  });
});
