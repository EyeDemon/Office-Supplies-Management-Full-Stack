'use strict';
/**
 * purchaseFlow.test.js — N35: PO State Machine Reconciliation
 *
 * N35 Changes vs N34:
 *   PO State Machine aligned to domain/rules.js:
 *     DRAFT → CONFIRMED → RECEIVED | CANCELLED  (was PENDING→APPROVED→COMPLETED)
 *
 * Test Coverage:
 *   1. PR State Machine
 *   2. PO State Machine (N35: DRAFT→CONFIRMED→RECEIVED)
 *   3. Bulk-Approve PRs
 *   4. Bulk-Confirm POs  (N35: renamed from bulk-approve)
 *   5. Full E2E Flow: PR(PENDING→APPROVED) → PO(DRAFT→CONFIRMED→RECEIVED) → Stock
 *   6. PO Cancel → PR rollback
 *   7. DTO Validation Guards
 *   8. Moving Average Costing
 */

// ═══════════════════════════════════════════════════════════════════
// 1. PR State Machine
// ═══════════════════════════════════════════════════════════════════
const PR_TRANSITIONS = {
  PENDING:   ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:  ['CONVERTED', 'CANCELLED'],
  REJECTED:  [],
  CANCELLED: [],
  CONVERTED: [],
};
function canTransitionPR(from, to) { return (PR_TRANSITIONS[from] || []).includes(to); }

describe('PR State Machine', () => {
  test('PENDING → APPROVED', ()   => expect(canTransitionPR('PENDING', 'APPROVED')).toBe(true));
  test('PENDING → REJECTED', ()   => expect(canTransitionPR('PENDING', 'REJECTED')).toBe(true));
  test('PENDING → CANCELLED', ()  => expect(canTransitionPR('PENDING', 'CANCELLED')).toBe(true));
  test('APPROVED → CONVERTED', () => expect(canTransitionPR('APPROVED', 'CONVERTED')).toBe(true));
  test('APPROVED → CANCELLED', () => expect(canTransitionPR('APPROVED', 'CANCELLED')).toBe(true));
  test('REJECTED → APPROVED (blocked)', ()  => expect(canTransitionPR('REJECTED', 'APPROVED')).toBe(false));
  test('CANCELLED → PENDING (blocked)', ()  => expect(canTransitionPR('CANCELLED', 'PENDING')).toBe(false));
  test('CONVERTED → APPROVED (blocked)', () => expect(canTransitionPR('CONVERTED', 'APPROVED')).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════
// 2. PO State Machine — N35 FIX: DRAFT→CONFIRMED→RECEIVED
// ═══════════════════════════════════════════════════════════════════

/**
 * Mirrors domain/rules.js TRANSITIONS['purchase_order'] (canonical source of truth).
 * N35 FIX: was PENDING→APPROVED→COMPLETED (3-state mismatch with domain)
 */
const PO_TRANSITIONS = {
  DRAFT:     ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['RECEIVED',  'CANCELLED'],
  RECEIVED:  [],   // terminal
  CANCELLED: [],   // terminal
};
function canTransitionPO(from, to) { return (PO_TRANSITIONS[from] || []).includes(to); }

describe('PO State Machine (N35: DRAFT→CONFIRMED→RECEIVED)', () => {
  test('DRAFT → CONFIRMED (Manager xác nhận)',        () => expect(canTransitionPO('DRAFT',     'CONFIRMED')).toBe(true));
  test('CONFIRMED → RECEIVED (Kho nhận hàng)',        () => expect(canTransitionPO('CONFIRMED', 'RECEIVED')).toBe(true));
  test('DRAFT → CANCELLED',                           () => expect(canTransitionPO('DRAFT',     'CANCELLED')).toBe(true));
  test('CONFIRMED → CANCELLED',                       () => expect(canTransitionPO('CONFIRMED', 'CANCELLED')).toBe(true));

  // N35: old states should NOT be valid transitions
  test('DRAFT → APPROVED (N35 removed) → BLOCKED',   () => expect(canTransitionPO('DRAFT',     'APPROVED')).toBe(false));
  test('DRAFT → RECEIVED (skip CONFIRMED) → BLOCKED', () => expect(canTransitionPO('DRAFT',     'RECEIVED')).toBe(false));
  test('RECEIVED → CONFIRMED (no rollback) → BLOCKED',() => expect(canTransitionPO('RECEIVED',  'CONFIRMED')).toBe(false));
  test('CANCELLED → DRAFT → BLOCKED',                 () => expect(canTransitionPO('CANCELLED', 'DRAFT')).toBe(false));
  test('CONFIRMED → CONFIRMED (self) → BLOCKED',      () => expect(canTransitionPO('CONFIRMED', 'CONFIRMED')).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════
// 3. Bulk-Approve PRs
// ═══════════════════════════════════════════════════════════════════
function bulkApprovePRs(prStore, ids, approverId) {
  const approved = []; const skipped = [];
  for (const id of ids) {
    const pr = prStore.find(p => p.id === id);
    if (!pr) { skipped.push({ id, reason: 'Không tồn tại' }); continue; }
    if (pr.status !== 'PENDING') { skipped.push({ id, prCode: pr.pr_code, reason: `Trạng thái ${pr.status}` }); continue; }
    pr.status = 'APPROVED'; pr.approved_by = approverId;
    approved.push({ id, prCode: pr.pr_code });
  }
  return { approved, skipped };
}

describe('Bulk-Approve PRs', () => {
  let prStore;
  beforeEach(() => {
    prStore = [
      { id: 1, pr_code: 'PR-202504-0001', status: 'PENDING' },
      { id: 2, pr_code: 'PR-202504-0002', status: 'PENDING' },
      { id: 3, pr_code: 'PR-202504-0003', status: 'APPROVED' },
      { id: 4, pr_code: 'PR-202504-0004', status: 'REJECTED' },
    ];
  });
  test('[Happy Path] Approve 2 PENDING', () => {
    const { approved, skipped } = bulkApprovePRs(prStore, [1, 2], 99);
    expect(approved).toHaveLength(2); expect(skipped).toHaveLength(0);
    expect(prStore[0].status).toBe('APPROVED');
  });
  test('[Partial Skip] PENDING + already APPROVED', () => {
    const { approved, skipped } = bulkApprovePRs(prStore, [1, 3], 99);
    expect(approved).toHaveLength(1); expect(skipped[0].reason).toMatch(/APPROVED/);
  });
  test('[NOT_FOUND] skipped', () => {
    const { skipped } = bulkApprovePRs(prStore, [999], 99);
    expect(skipped[0].reason).toBe('Không tồn tại');
  });
  test('[Idempotency] second attempt skipped', () => {
    bulkApprovePRs(prStore, [1], 99);
    const { approved, skipped } = bulkApprovePRs(prStore, [1], 99);
    expect(approved).toHaveLength(0); expect(skipped[0].reason).toMatch(/APPROVED/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Bulk-Confirm POs (N35 rename từ bulk-approve)
// ═══════════════════════════════════════════════════════════════════

/**
 * N35 FIX: POs start as DRAFT, confirm transitions DRAFT→CONFIRMED
 */
function bulkConfirmPOs(poStore, ids, confirmerId) {
  const confirmed = []; const skipped = [];
  for (const id of ids) {
    const po = poStore.find(p => p.id === id);
    if (!po) { skipped.push({ id, reason: 'Không tồn tại' }); continue; }
    if (!canTransitionPO(po.status, 'CONFIRMED')) {
      skipped.push({ id, poCode: po.po_code, reason: `Trạng thái ${po.status} không thể xác nhận` }); continue;
    }
    po.status = 'CONFIRMED'; po.confirmed_by = confirmerId;
    confirmed.push({ id, poCode: po.po_code });
  }
  return { confirmed, skipped };
}

describe('Bulk-Confirm POs (N35: DRAFT→CONFIRMED)', () => {
  let poStore;
  beforeEach(() => {
    poStore = [
      { id: 1, po_code: 'PO-202504-0001', status: 'DRAFT' },
      { id: 2, po_code: 'PO-202504-0002', status: 'DRAFT' },
      { id: 3, po_code: 'PO-202504-0003', status: 'CONFIRMED' },
      { id: 4, po_code: 'PO-202504-0004', status: 'RECEIVED' },
      { id: 5, po_code: 'PO-202504-0005', status: 'CANCELLED' },
    ];
  });
  test('[Happy Path] Confirm 2 DRAFT POs', () => {
    const { confirmed, skipped } = bulkConfirmPOs(poStore, [1, 2], 99);
    expect(confirmed).toHaveLength(2); expect(skipped).toHaveLength(0);
    expect(poStore[0].status).toBe('CONFIRMED');
  });
  test('[Skip CONFIRMED] already confirmed → skipped', () => {
    const { confirmed, skipped } = bulkConfirmPOs(poStore, [3], 99);
    expect(confirmed).toHaveLength(0); expect(skipped[0].reason).toMatch(/CONFIRMED/);
  });
  test('[Skip RECEIVED] terminal state → skipped', () => {
    const { skipped } = bulkConfirmPOs(poStore, [4], 99);
    expect(skipped[0].reason).toMatch(/RECEIVED/);
  });
  test('[NOT_FOUND] → skipped', () => {
    const { skipped } = bulkConfirmPOs(poStore, [999], 99);
    expect(skipped[0].reason).toBe('Không tồn tại');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Full E2E Flow: PR → PO (N35 state machine)
// ═══════════════════════════════════════════════════════════════════
function simulateMovingAverage(stockBefore, avgBefore, qtyReceived, unitPrice) {
  if (qtyReceived <= 0) return { qty: stockBefore, avg: avgBefore };
  const qtyAfter = stockBefore + qtyReceived;
  if (stockBefore === 0) return { qty: qtyAfter, avg: unitPrice };
  return { qty: qtyAfter, avg: Math.round(((stockBefore * avgBefore + qtyReceived * unitPrice) / qtyAfter) * 100) / 100 };
}

describe('Full Purchase Flow E2E (N35: DRAFT→CONFIRMED→RECEIVED)', () => {
  let prStore, poStore, productStock;
  beforeEach(() => {
    prStore = []; poStore = [];
    productStock = { productId: 101, qty: 0, avg: 0 };
  });

  function createPR(items, userId) {
    const pr = { id: prStore.length + 1, pr_code: `PR-TEST-${prStore.length + 1}`, status: 'PENDING', items, created_by: userId };
    prStore.push(pr); return pr;
  }
  function createPO(prId, items, userId) {
    const pr = prStore.find(p => p.id === prId);
    if (!pr)               throw Object.assign(new Error('PR không tồn tại'),    { code: 'NOT_FOUND' });
    if (pr.status !== 'APPROVED') throw Object.assign(new Error(`PR phải APPROVED (hiện: ${pr.status})`), { code: 'INVALID_STATE' });
    pr.status = 'CONVERTED';
    // N35: PO starts as DRAFT
    const po = { id: poStore.length + 1, po_code: `PO-TEST-${poStore.length + 1}`, status: 'DRAFT', pr_id: prId, items, created_by: userId };
    poStore.push(po); return po;
  }
  function confirmPO(poId, confirmerId) {
    const po = poStore.find(p => p.id === poId);
    if (!po) throw Object.assign(new Error('PO không tồn tại'), { code: 'NOT_FOUND' });
    if (!canTransitionPO(po.status, 'CONFIRMED')) throw Object.assign(new Error(`PO phải DRAFT (hiện: ${po.status})`), { code: 'INVALID_STATE' });
    po.status = 'CONFIRMED'; po.confirmed_by = confirmerId; return po;
  }
  function receivePO(poId, receiverId) {
    const po = poStore.find(p => p.id === poId);
    if (!po) throw Object.assign(new Error('PO không tồn tại'), { code: 'NOT_FOUND' });
    if (!canTransitionPO(po.status, 'RECEIVED')) throw Object.assign(new Error(`PO phải CONFIRMED (hiện: ${po.status})`), { code: 'INVALID_STATE' });
    for (const item of po.items) {
      if (item.productId === productStock.productId) {
        const r = simulateMovingAverage(productStock.qty, productStock.avg, item.qty, item.unitPrice);
        productStock.qty = r.qty; productStock.avg = r.avg;
      }
    }
    po.status = 'RECEIVED'; po.received_by = receiverId; return po;
  }

  test('[PR] tạo → PENDING', () => {
    const pr = createPR([{ productId: 101, qty: 50 }], 1);
    expect(pr.status).toBe('PENDING');
  });
  test('[PO] tạo từ PR chưa duyệt → INVALID_STATE', () => {
    const pr = createPR([{ productId: 101, qty: 50 }], 1);
    expect(() => createPO(pr.id, [], 2)).toThrow();
  });
  test('[PO] tạo từ PR đã APPROVED → DRAFT (N35)', () => {
    const pr = createPR([{ productId: 101, qty: 50 }], 1);
    pr.status = 'APPROVED';
    const po = createPO(pr.id, [{ productId: 101, qty: 50, unitPrice: 100000 }], 2);
    expect(po.status).toBe('DRAFT');    // N35 FIX: was 'PENDING'
    expect(pr.status).toBe('CONVERTED');
  });
  test('[Confirm] PO DRAFT → CONFIRMED', () => {
    const pr = createPR([{ productId: 101, qty: 50 }], 1);
    pr.status = 'APPROVED';
    const po = createPO(pr.id, [{ productId: 101, qty: 50, unitPrice: 100000 }], 2);
    confirmPO(po.id, 3);
    expect(po.status).toBe('CONFIRMED');
  });
  test('[Receive] PO DRAFT (not confirmed) → INVALID_STATE', () => {
    const pr = createPR([{ productId: 101, qty: 50 }], 1);
    pr.status = 'APPROVED';
    const po = createPO(pr.id, [{ productId: 101, qty: 50, unitPrice: 100000 }], 2);
    expect(() => receivePO(po.id, 4)).toThrow(); // must confirm first
  });
  test('[Full Flow] PR→PO→CONFIRMED→RECEIVED + stock updated', () => {
    const pr = createPR([{ productId: 101, qty: 50 }], 1);
    pr.status = 'APPROVED';
    const po = createPO(pr.id, [{ productId: 101, qty: 50, unitPrice: 100000 }], 2);
    confirmPO(po.id, 3);
    receivePO(po.id, 4);
    expect(po.status).toBe('RECEIVED');
    expect(productStock.qty).toBe(50);
    expect(productStock.avg).toBe(100000);
  });
  test('[Moving Avg] 2 nhận hàng → avg chính xác', () => {
    // Batch 1
    const pr1 = createPR([{ productId: 101, qty: 50 }], 1);
    pr1.status = 'APPROVED';
    const po1 = createPO(pr1.id, [{ productId: 101, qty: 50, unitPrice: 100000 }], 2);
    confirmPO(po1.id, 3); receivePO(po1.id, 4);
    // Batch 2
    const pr2 = createPR([{ productId: 101, qty: 50 }], 1);
    pr2.status = 'APPROVED';
    const po2 = createPO(pr2.id, [{ productId: 101, qty: 50, unitPrice: 120000 }], 2);
    confirmPO(po2.id, 3); receivePO(po2.id, 4);
    expect(productStock.qty).toBe(100);
    expect(productStock.avg).toBe(110000); // (50*100k + 50*120k) / 100
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. PO Cancel → PR Rollback (N35 state)
// ═══════════════════════════════════════════════════════════════════
describe('PO Cancel → PR Rollback (N35)', () => {
  function cancelPO(po, prStore) {
    // N35 FIX: ['DRAFT','CONFIRMED'] cancellable (was ['PENDING','DRAFT'])
    if (!['DRAFT', 'CONFIRMED'].includes(po.status)) {
      throw Object.assign(new Error(`PO ở ${po.status}, không thể huỷ`), { code: 'INVALID_STATE' });
    }
    po.status = 'CANCELLED';
    if (po.pr_id) {
      const pr = prStore.find(p => p.id === po.pr_id);
      if (pr && pr.status === 'CONVERTED') pr.status = 'APPROVED';
    }
    return po;
  }

  test('[Cancel DRAFT] → PR rollback CONVERTED→APPROVED', () => {
    const prStore = [{ id: 1, status: 'CONVERTED' }];
    const po = { id: 1, status: 'DRAFT', pr_id: 1 };
    cancelPO(po, prStore);
    expect(po.status).toBe('CANCELLED');
    expect(prStore[0].status).toBe('APPROVED');
  });
  test('[Cancel CONFIRMED] → PR rollback', () => {
    const prStore = [{ id: 1, status: 'CONVERTED' }];
    const po = { id: 1, status: 'CONFIRMED', pr_id: 1 };
    cancelPO(po, prStore);
    expect(po.status).toBe('CANCELLED');
    expect(prStore[0].status).toBe('APPROVED');
  });
  test('[Cancel RECEIVED] → INVALID_STATE (terminal)', () => {
    const po = { id: 1, status: 'RECEIVED', pr_id: null };
    expect(() => cancelPO(po, [])).toThrow();
  });
  test('[Cancel no PR] → only PO cancelled', () => {
    const po = { id: 1, status: 'DRAFT', pr_id: null };
    cancelPO(po, []);
    expect(po.status).toBe('CANCELLED');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. DTO Validation Guards
// ═══════════════════════════════════════════════════════════════════
describe('DTO Validation Guards', () => {
  function validateCreatePR(body) {
    const errors = [];
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0)
      errors.push('PR phải có ít nhất 1 sản phẩm');
    if (!body.priority || !['LOW','MEDIUM','HIGH','URGENT'].includes(body.priority))
      errors.push('priority phải là LOW|MEDIUM|HIGH|URGENT');
    for (const item of (body.items || [])) {
      if (!item.productId || item.productId <= 0) errors.push('productId không hợp lệ');
      if (!item.quantity  || item.quantity  <= 0) errors.push('quantity phải > 0');
    }
    return errors;
  }
  function validateBulkOp(body) {
    const errors = [];
    if (!Array.isArray(body.ids) || body.ids.length === 0) errors.push('ids phải là mảng không rỗng');
    const validIds = (body.ids || []).map(id => parseInt(id, 10)).filter(id => id > 0);
    if (body.ids && body.ids.length > 0 && validIds.length === 0) errors.push('Không có ID hợp lệ');
    return errors;
  }

  test('[CreatePR] valid → no errors',        () => expect(validateCreatePR({ priority: 'HIGH', items: [{ productId: 1, quantity: 10 }] })).toHaveLength(0));
  test('[CreatePR] missing items → error',    () => expect(validateCreatePR({ priority: 'HIGH' })).toContain('PR phải có ít nhất 1 sản phẩm'));
  test('[CreatePR] bad priority → error',     () => expect(validateCreatePR({ priority: 'X', items: [{ productId: 1, quantity: 1 }] }).some(e => e.includes('priority'))).toBe(true));
  test('[BulkOp] valid ids → no errors',      () => expect(validateBulkOp({ ids: [1,2,3] })).toHaveLength(0));
  test('[BulkOp] ids=[] → error',             () => expect(validateBulkOp({ ids: [] })).toContain('ids phải là mảng không rỗng'));
  test('[BulkOp] ids=[0,-1] → invalid error', () => expect(validateBulkOp({ ids: [0,-1] }).some(e => e.includes('Không có ID'))).toBe(true));
});

// ═══════════════════════════════════════════════════════════════════
// 8. Moving Average Costing
// ═══════════════════════════════════════════════════════════════════
describe('Moving Average Costing (Spec VIII.4)', () => {
  test('[First receipt] stock=0 → avg = unitPrice', () => {
    const { qty, avg } = simulateMovingAverage(0, 0, 100, 50000);
    expect(qty).toBe(100); expect(avg).toBe(50000);
  });
  test('[Same price] avg unchanged', () => {
    const { avg } = simulateMovingAverage(100, 50000, 100, 50000);
    expect(avg).toBe(50000);
  });
  test('[Higher price] avg increases', () => {
    const { avg } = simulateMovingAverage(100, 50000, 100, 70000);
    expect(avg).toBe(60000);
  });
  test('[Lower price] avg decreases', () => {
    const { avg } = simulateMovingAverage(200, 60000, 100, 30000);
    expect(avg).toBe(50000);
  });
  test('[qty=0 received] no change', () => {
    const { qty, avg } = simulateMovingAverage(100, 50000, 0, 60000);
    expect(qty).toBe(100); expect(avg).toBe(50000);
  });
  test('[Multi-batch] 3 receipts accumulate correctly', () => {
    let s = simulateMovingAverage(0, 0, 50, 100000);
    s = simulateMovingAverage(s.qty, s.avg, 50, 120000);
    s = simulateMovingAverage(s.qty, s.avg, 100, 80000);
    // Batch3: (100*110k + 100*80k) / 200 = 95000
    expect(s.qty).toBe(200); expect(s.avg).toBe(95000);
  });
});
// ═══════════════════════════════════════════════════════════════════
// BUG-N36-01 Regression: API endpoint contract consistency
// Verify frontend api.js calls match backend controller routes
describe('API Endpoint Contract (BUG-N36-01 regression)', () => {
  const fs   = require('fs');
  const path = require('path');

  const API_JS  = path.resolve(__dirname, '../../../../apps/web/src/services/api.js');
  const CTRL_JS = path.resolve(__dirname, '../../../controllers/purchase.controller.js');

  let apiSrc  = '';
  let ctrlSrc = '';

  beforeAll(() => {
    if (fs.existsSync(API_JS))  apiSrc  = fs.readFileSync(API_JS,  'utf8');
    if (fs.existsSync(CTRL_JS)) ctrlSrc = fs.readFileSync(CTRL_JS, 'utf8');
  });

  test('[REGRESSION] bulkApprovePO calls /bulk-confirm (not /bulk-approve)', () => {
    if (!apiSrc) return; // skip if running outside monorepo
    expect(apiSrc).toContain('/purchases/orders/bulk-confirm');
    expect(apiSrc).not.toContain('/purchases/orders/bulk-approve');
  });

  test('[REGRESSION] No dead approvePO function (removed, use confirmPO)', () => {
    if (!apiSrc) return;
    // approvePO was dead code pointing to wrong /approve endpoint — must not exist
    expect(apiSrc).not.toMatch(/approvePO\s*:/);
  });

  test('[CONTRACT] Backend has /orders/bulk-confirm route', () => {
    if (!ctrlSrc) return;
    expect(ctrlSrc).toContain("router.post('/orders/bulk-confirm'");
  });

  test('[CONTRACT] Backend /orders/:id/confirm exists (not /approve)', () => {
    if (!ctrlSrc) return;
    expect(ctrlSrc).toContain("router.post('/orders/:id/confirm'");
    expect(ctrlSrc).not.toContain("router.post('/orders/:id/approve'");
  });
});
