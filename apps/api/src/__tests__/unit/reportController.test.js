'use strict';
/**
 * reportController.test.js — N38: BUG-N38-01 Regression Tests
 *
 * Mục đích: Đảm bảo report.controller.js không shadow fat route reports.js
 * cho endpoint dead-stock (RBAC, param names, response shape).
 */

const path = require('path');
const fs   = require('fs');

// ── 1. Load controller source as text to inspect statically ──────
const controllerPath = path.resolve(
  __dirname, '../../controllers/report.controller.js'
);
const controllerSrc = fs.readFileSync(controllerPath, 'utf-8');

// ── 2. Load report controller source (same file, previously was "fat route") ─
// NOTE: Kiến trúc đã refactor: routes/reports.js → controllers/report.controller.js
const fatRoutePath = path.resolve(__dirname, '../../controllers/report.controller.js');
const fatRouteSrc  = fs.readFileSync(fatRoutePath, 'utf-8');

// ── 3. Load api.js frontend source ───────────────────────────────
const apiJsPath = path.resolve(
  __dirname, '../../../../../apps/web/src/services/api.js'
);
const apiJsSrc = fs.existsSync(apiJsPath)
  ? fs.readFileSync(apiJsPath, 'utf-8')
  : null;

describe('[BUG-N38-01] dead-stock RBAC Shadow — Regression', () => {
  test('[REGRESSION] dead-stock route TỒN TẠI trong report.controller.js với RBAC đúng', () => {
    // Sau khi refactor routes/reports.js → report.controller.js, route vẫn phải tồn tại
    const hasDeadStockGet = /router\.get\s*\(\s*[\'"]\/dead-stock['"]/.test(controllerSrc);
    expect(hasDeadStockGet).toBe(true);
  });

  test('[REGRESSION] Fat route vẫn có GET /dead-stock với requireWarehouseOrAdmin', () => {
    expect(fatRouteSrc).toMatch(/router\.get\s*\(\s*['"]\/dead-stock['"]/);
    // Must NOT have requireManagerOrAdmin for this route
    const deadStockBlock = fatRouteSrc.match(
      /router\.get\s*\(\s*['"]\/dead-stock['"][\s\S]{0,200}/
    )?.[0] || '';
    expect(deadStockBlock).not.toMatch(/requireManagerOrAdmin/);
    expect(deadStockBlock).toMatch(/requireWarehouseOrAdmin/);
  });

  test('[REGRESSION] dead-stock xử lý param "days" từ query (qua destructure hoặc trực tiếp)', () => {
    const deadStockIdx = fatRouteSrc.indexOf("router.get('/dead-stock'");
    const block = fatRouteSrc.slice(deadStockIdx, deadStockIdx + 500);
    // Kiểm tra "days" được sử dụng: dù qua destructure ({ days } = req.query) hay req.query.days đều OK
    expect(block).toMatch(/days/);
    expect(block).not.toMatch(/thresholdDays/);
  });

  test('[REGRESSION] Fat route dead-stock hỗ trợ filter categoryId', () => {
    const deadStockIdx = fatRouteSrc.indexOf("router.get('/dead-stock'");
    const block = fatRouteSrc.slice(deadStockIdx, deadStockIdx + 600);
    expect(block).toMatch(/categoryId/);
  });
});

describe('[BUG-N38-01] Frontend API Contract — dead-stock', () => {
  test('[CONTRACT] api.js gửi "days" param (không phải thresholdDays)', () => {
    if (!apiJsSrc) return; // skip nếu không tìm thấy file (CI environment)
    const getDeadStockBlock = apiJsSrc.match(/getDeadStock[\s\S]{0,200}/)?.[0] || '';
    expect(getDeadStockBlock).toMatch(/params\.days/);
    expect(getDeadStockBlock).not.toMatch(/thresholdDays/);
  });

  test('[CONTRACT] api.js gửi categoryId filter', () => {
    if (!apiJsSrc) return;
    const getDeadStockBlock = apiJsSrc.match(/getDeadStock[\s\S]{0,200}/)?.[0] || '';
    expect(getDeadStockBlock).toMatch(/categoryId/);
  });
});

describe('nginx Security Headers — N38', () => {
  const nginxPath = path.resolve(
    __dirname, '../../../../../apps/web/nginx.conf'
  );
  const nginxSrc = fs.existsSync(nginxPath)
    ? fs.readFileSync(nginxPath, 'utf-8')
    : null;

  test('[SECURITY] nginx có X-Frame-Options header', () => {
    if (!nginxSrc) return;
    expect(nginxSrc).toMatch(/X-Frame-Options/);
  });

  test('[SECURITY] nginx có X-Content-Type-Options: nosniff', () => {
    if (!nginxSrc) return;
    expect(nginxSrc).toMatch(/X-Content-Type-Options.*nosniff/);
  });

  test('[SECURITY] nginx có X-XSS-Protection', () => {
    if (!nginxSrc) return;
    expect(nginxSrc).toMatch(/X-XSS-Protection/);
  });

  test('[SECURITY] nginx có Referrer-Policy', () => {
    if (!nginxSrc) return;
    expect(nginxSrc).toMatch(/Referrer-Policy/);
  });

  test('[SECURITY] nginx proxy trỏ đúng service name "api"', () => {
    if (!nginxSrc) return;
    expect(nginxSrc).toMatch(/proxy_pass\s+http:\/\/api:8080/);
    expect(nginxSrc).not.toMatch(/proxy_pass\s+http:\/\/backend:8080/);
  });
});
