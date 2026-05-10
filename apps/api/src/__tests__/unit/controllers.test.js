'use strict';
/**
 * controllers.test.js — Kiểm tra cấu trúc các controller theo Clean Architecture.
 *
 * Test type: Unit (static analysis — không cần DB kết nối).
 * Scope: order.controller, product.controller, stocktaking.controller
 * Mục tiêu: Đảm bảo module load được, export đúng kiểu.
 *
 * NOTE: Kiến trúc hiện tại dùng /controllers/ (không còn /routes/).
 * Không có inventory.controller.js — routes được tách thành các controller riêng.
 */

// Static tests — không cần load module thực tế

// ── Phân tích tĩnh controller source code (không load module) ────────────────
const fs   = require('fs');
const path = require('path');

describe('order.controller — source analysis', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../controllers/order.controller.js'), 'utf-8');
  });

  test('order.controller.js tồn tại và không rỗng', () => {
    expect(src.length).toBeGreaterThan(100);
  });

  test('POST /:id/complete route có trong source', () => {
    // order.controller.js mount tại /api/orders → route cục bộ là /:id/complete
    expect(src).toMatch(/\/:id\/complete/);
  });

  test('ProcessInbound được import', () => {
    expect(src).toMatch(/ProcessInbound/);
  });

  test('stocktakingRepository được inject vào ProcessInbound', () => {
    expect(src).toMatch(/stocktakingRepository/);
  });
});

describe('stocktaking.controller — source analysis', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../controllers/stocktaking.controller.js'), 'utf-8');
  });

  test('stocktaking.controller.js tồn tại', () => {
    expect(src.length).toBeGreaterThan(100);
  });

  test('PUT /:id/start-counting route có trong source', () => {
    expect(src).toMatch(/start-counting/);
  });

  test('POST /:id/complete route có trong source', () => {
    expect(src).toMatch(/\.post.*complete/);
  });

  test('ConfirmStocktaking được import', () => {
    expect(src).toMatch(/ConfirmStocktaking/);
  });

  test('stocktakingRepository được inject vào ConfirmStocktaking', () => {
    // Regression test cho BUG #1
    expect(src).toMatch(/new\s+ConfirmStocktaking\s*\(\s*\{[\s\S]*?stocktakingRepository:\s*repo/);
  });

  test('StartCountingStocktaking được import', () => {
    expect(src).toMatch(/StartCountingStocktaking/);
  });
});

describe('requisition.controller — source analysis', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../controllers/requisition.controller.js'), 'utf-8');
  });

  test('[BUG-CRIT-01] Không còn assertValidTransition DRAFT→PENDING', () => {
    // Đây là regression test cho BUG-CRIT-01
    // assertValidTransition('requisition', 'DRAFT', 'PENDING') phải bị xóa
    expect(src).not.toMatch(/assertValidTransition\s*\(\s*['"]requisition['"]\s*,\s*['"]DRAFT['"]/);
  });

  test('POST / (create) route có trong source', () => {
    expect(src).toMatch(/router\.post\(\s*['\']\/['\'\s]*,/);
  });

  test('POST /:id/approve route có trong source', () => {
    expect(src).toMatch(/\.post.*\/.*id.*\/approve/);
  });

  test('POST /:id/warehouse-confirm route có trong source', () => {
    expect(src).toMatch(/warehouse-confirm/);
  });
});

describe('[BUG-CRIT-02] StartCountingStocktaking — entity key', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../use-cases/inventory/StartCountingStocktaking.js'), 'utf-8'
    );
  });

  test('dùng key "stocktaking" (không phải "stocktaking_session")', () => {
    expect(src).toMatch(/assertValidTransition\s*\(\s*['"]stocktaking['"]/);
    expect(src).not.toMatch(/assertValidTransition\s*\(\s*['"]stocktaking_session['"]/);
  });
});
describe('[BUG #7] Transaction Timeout Validation', () => {
  const controllers = [
    '../../controllers/order.controller.js',
    '../../controllers/transfer.controller.js',
    '../../controllers/stocktaking.controller.js',
    '../../controllers/export-order.controller.js',
    '../../controllers/requisition.controller.js',
    '../../controllers/purchase.controller.js',
    '../../controllers/return.controller.js'
  ];

  test.each(controllers)('%s should use beginTransactionWithTimeout', (filePath) => {
    const src = fs.readFileSync(path.resolve(__dirname, filePath), 'utf-8');
    // Ensure no plain conn.beginTransaction() remains in inventory-critical controllers
    // (We exclude comments or non-matching contexts if needed, but here simple match is enough)
    expect(src).not.toMatch(/conn\.beginTransaction\(\)/);
    expect(src).toMatch(/db\.beginTransactionWithTimeout/);
  });
});
describe('[BUG #8] Missing Audit Logs Validation', () => {
  test('order.controller.js should have audit logs for cancel and complete', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../controllers/order.controller.js'), 'utf-8');
    expect(src).toMatch(/router\.post\(['"]\/:id\/cancel['"][\s\S]*?writeAuditLog[\s\S]*?action:\s*['"]CANCEL['"]/);
    expect(src).toMatch(/router\.post\(['"]\/:id\/complete['"][\s\S]*?writeAuditLog[\s\S]*?action:\s*['"]COMPLETE['"]/);
  });

  test('export-order.controller.js should have audit log for complete', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../controllers/export-order.controller.js'), 'utf-8');
    expect(src).toMatch(/router\.post\(['"]\/:id\/complete['"][\s\S]*?writeAuditLog[\s\S]*?action:\s*['"]COMPLETE['"]/);
  });
});
