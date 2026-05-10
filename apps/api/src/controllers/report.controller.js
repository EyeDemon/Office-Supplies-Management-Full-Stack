'use strict';
/**
 * report.controller.js — Interface Adapter cho module báo cáo.
 */
const router = require('express').Router();
const reportRepo = require('../infrastructure/repositories/ReportRepository');
const { requireLogin, requireWarehouseOrAdmin, requireManagerOrAdmin } = require('../shared/middleware/authenticate');
const { attachUserWarehouses } = require('../shared/middleware/rbac');
const { ValidationError } = require('../domain/errors');
const { getOrSet } = require('../shared/utils/cacheHelper');
const { streamToCsv } = require('../shared/utils/csv/csvStream');
const db = require('../shared/config/db');


// Use Cases
const GetStockActivityReport = require('../use-cases/report/GetStockActivityReport');
const GetFinancialReport     = require('../use-cases/report/GetFinancialReport');
const GetBurnRateReport      = require('../use-cases/report/GetBurnRateReport');

const activityUC = new GetStockActivityReport({ reportRepository: reportRepo });
const financialUC = new GetFinancialReport({ reportRepository: reportRepo });
const burnRateUC = new GetBurnRateReport({ reportRepository: reportRepo });

const esc = (v) => {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
};

// ══════════════════════════════════════════════════════════════════
// STOCK ACTIVITY
// ══════════════════════════════════════════════════════════════════

router.get('/stock-activity', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { dateFrom, dateTo, department, departmentId, warehouseId: whId } = req.query;
    const warehouseId = parseInt(whId) || null;
    const deptId = departmentId ? parseInt(departmentId, 10) : null;

    const cacheKey = `report:stock-activity:${days}:${dateFrom || ''}:${dateTo || ''}:${department || ''}:${deptId || ''}:${warehouseId || ''}`;
    
    const data = await getOrSet(cacheKey, () => activityUC.execute(db, {
      days, dateFrom, dateTo, department, departmentId: deptId, warehouseId
    }), 300); // 5 mins

    res.json({ success: true, message: 'OK', data });
  } catch (e) { next(e); }

});

router.get('/stock-activity/export', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { days, dateFrom, dateTo, department, departmentId } = req.query;
  try {
    const rows = await reportRepo.getStockActivity({ 
      days: parseInt(days) || 30, 
      dateFrom, 
      dateTo, 
      department,
      departmentId: departmentId ? parseInt(departmentId, 10) : null
    });
    let csv = '\uFEFFSKU,Tên sản phẩm,Danh mục,Đơn giá,Tồn hiện tại,Tồn tối thiểu,Nhập kỳ,Xuất kỳ,Điều chỉnh,Giao dịch,Trạng thái\n';
    rows.forEach(r => {
      csv += [
        esc(r.sku), esc(r.product_name), esc(r.category_name), Number(r.price || 0), Number(r.current_stock),
        Number(r.min_stock_qty), Number(r.imported_qty), Number(r.exported_qty), Number(r.adjusted_qty),
        Number(r.total_transactions),
        r.current_stock === 0 ? 'Hết hàng' : r.is_low_stock ? 'Tồn thấp' : 'Bình thường'
      ].join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-kho-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// BY CATEGORY
// ══════════════════════════════════════════════════════════════════

router.get('/by-category', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { dateFrom, dateTo } = req.query;
  try {
    const cacheKey = `report:by-category:${dateFrom || ''}:${dateTo || ''}`;
    const rows = await getOrSet(cacheKey, () => reportRepo.getByCategory({ dateFrom, dateTo }), 300);

    res.json({
      success: true, message: 'OK',
      data: rows.map(r => ({
        categoryId: r.category_id, categoryName: r.category_name, productCount: Number(r.product_count || 0),
        totalStock: Number(r.total_stock || 0), stockValue: Number(r.stock_value || 0),
        outOfStockCount: Number(r.out_of_stock_count || 0), lowStockCount: Number(r.low_stock_count || 0),
        periodImported: Number(r.period_imported || 0), periodExported: Number(r.period_exported || 0),
      }))
    });
  } catch (e) { next(e); }

});

router.get('/by-category/export', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { dateFrom, dateTo } = req.query;
  try {
    const rows = await reportRepo.getByCategory({ dateFrom, dateTo });
    let csv = '\uFEFFDanh mục,Số sản phẩm,Tổng tồn kho,Giá trị kho (VND),Hết hàng,Tồn thấp\n';
    rows.forEach(r => {
      csv += [esc(r.category_name), r.product_count, r.total_stock, r.stock_value, r.out_of_stock_count, r.low_stock_count].join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-danh-muc-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// TOP PRODUCTS
// ══════════════════════════════════════════════════════════════════

router.get('/top-products', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { type, days, limit } = req.query;
  try {
    const rows = await reportRepo.getTopProducts({ type, days: parseInt(days) || 30, limit: parseInt(limit) || 10 });
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// FINANCIAL
// ══════════════════════════════════════════════════════════════════

router.get('/financial', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { dateFrom, dateTo, grouping, departmentId } = req.query;
  try {
    const deptId = departmentId ? parseInt(departmentId, 10) : null;
    const cacheKey = `report:financial:${dateFrom || ''}:${dateTo || ''}:${grouping || ''}:${deptId || ''}`;

    const data = await getOrSet(cacheKey, () => financialUC.execute(db, { 
      dateFrom, 
      dateTo, 
      grouping,
      departmentId: deptId
    }), 300);

    res.json({ success: true, message: 'OK', data });
  } catch (e) { next(e); }

});

// ══════════════════════════════════════════════════════════════════
// BURN RATE & DEAD STOCK
// ══════════════════════════════════════════════════════════════════

router.get('/burn-rate', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  try {
    const items = await burnRateUC.execute(db, { 
      days: parseInt(req.query.days) || 30, 
      categoryId: parseInt(req.query.categoryId) || null,
      departmentId: req.query.departmentId ? parseInt(req.query.departmentId, 10) : null
    });
    res.json({ success: true, message: 'OK', data: { days: parseInt(req.query.days) || 30, items } });
  } catch (e) { next(e); }
});

router.get('/dead-stock', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { days, categoryId } = req.query;
  try {
    const rows = await reportRepo.getDeadStock({ days: parseInt(days) || 90, categoryId: parseInt(categoryId) || null });
    res.json({
      success: true, message: 'OK',
      data: {
        days: parseInt(days) || 90, totalItems: rows.length,
        totalValue: rows.reduce((s, r) => s + Number(r.stock_value || 0), 0),
        items: rows.map(r => ({
          productId: r.product_id, sku: r.sku, productName: r.product_name, categoryName: r.category_name,
          currentStock: Number(r.current_stock), reservedQty: Number(r.reserved_quantity),
          minStockQty: Number(r.min_stock_qty), avgUnitPrice: Number(r.avg_unit_price),
          stockValue: Number(r.stock_value), lastExport: r.last_export || null,
          daysSinceLastExport: r.days_since_last_export !== null ? Number(r.days_since_last_export) : null,
          totalExportCount: Number(r.total_export_count), neverExported: r.last_export === null,
        })),
      },
    });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// STOCK HISTORY
// ══════════════════════════════════════════════════════════════════

router.get('/stock-history', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { dateFrom, dateTo, warehouseId, productId } = req.query;
  try {
    const data = await reportRepo.getStockHistory({ dateFrom, dateTo, warehouseId, productId });
    res.json({ success: true, message: 'OK', data });
  } catch (e) { next(e); }
});

router.get('/stock-history/export', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { dateFrom, dateTo, warehouseId, productId } = req.query;
  const conn = await db.getConnection();
  try {
    let where = '1=1';
    const params = [];
    if (dateFrom && dateTo) { where += ' AND s.snapshot_date BETWEEN ? AND ?'; params.push(dateFrom, dateTo); }
    if (warehouseId) { where += ' AND s.warehouse_id = ?'; params.push(warehouseId); }
    if (productId) { where += ' AND s.product_id = ?'; params.push(productId); }

    const sql = `SELECT s.snapshot_date, w.name AS warehouseName,
                        p.sku, p.name AS productName, s.stock_qty,
                        s.reserved_quantity, (s.stock_qty - s.reserved_quantity) AS available_qty,
                        s.avg_unit_price, s.total_value
                 FROM stock_snapshot_daily s
                 JOIN warehouses w ON s.warehouse_id = w.id
                 JOIN products p ON s.product_id = p.id
                 WHERE ${where}
                 ORDER BY s.snapshot_date DESC, p.name ASC LIMIT 5000`;

    const headers = ['Ngày', 'Kho', 'SKU', 'Tên sản phẩm', 'Tồn cuối ngày', 'Đặt trước', 'Khả dụng', 'Giá vốn TB', 'Tổng giá trị'];
    const filename = `lich-su-ton-${new Date().toISOString().slice(0, 10)}.csv`;

    const queryStream = conn.connection.query(sql, params).stream();

    streamToCsv(res, filename, headers, queryStream, (r) => [
      r.snapshot_date, r.warehouseName, r.sku, r.productName,
      r.stock_qty, r.reserved_quantity, r.available_qty,
      r.avg_unit_price, r.total_value
    ]);

    res.on('finish', () => conn.release());
  } catch (e) {
    conn.release();
    next(e);
  }
});

// ══════════════════════════════════════════════════════════════════
// IN-OUT-BALANCE
// ══════════════════════════════════════════════════════════════════

router.get('/in-out-balance', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { dateFrom, dateTo, warehouseId } = req.query;
  try {
    const cacheKey = `report:inout:${dateFrom || ''}:${dateTo || ''}:${warehouseId || 'all'}`;
    const rows = await getOrSet(cacheKey, () => reportRepo.getInOutBalance({ dateFrom, dateTo, warehouseId }), 600);
    res.json({ success: true, message: 'OK', data: rows, meta: { dateFrom, dateTo } });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// INVENTORY VALUE
// ══════════════════════════════════════════════════════════════════

router.get('/inventory-value', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { warehouseId } = req.query;
  try {
    const cacheKey = `report:inv-value:${warehouseId || 'all'}`;
    const data = await getOrSet(cacheKey, () => reportRepo.getInventoryValue({ warehouseId }), 300);
    res.json({ success: true, message: 'OK', data: data.data, meta: { grandTotal: data.meta.grandTotal } });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// CONSUMPTION
// ══════════════════════════════════════════════════════════════════

router.get('/consumption', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { dateFrom, dateTo, warehouseId, departmentId } = req.query;
  try {
    const cacheKey = `report:consumption:${dateFrom || ''}:${dateTo || ''}:${warehouseId || 'all'}:${departmentId || 'all'}`;
    const rows = await getOrSet(cacheKey, () => reportRepo.getConsumption({ 
      dateFrom, 
      dateTo, 
      warehouseId: warehouseId ? parseInt(warehouseId, 10) : null,
      departmentId: departmentId ? parseInt(departmentId, 10) : null
    }), 600);
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════
// STOCK TREND
// ══════════════════════════════════════════════════════════════════

router.get('/stock-trend', requireLogin, requireWarehouseOrAdmin, attachUserWarehouses, async (req, res, next) => {
  const { warehouseId, productId, dateFrom, dateTo } = req.query;
  try {
    const rows = await reportRepo.getStockTrend({ warehouseId, productId, dateFrom, dateTo });
    res.json({ success: true, message: 'OK', data: rows });
  } catch (e) { next(e); }
});

module.exports = router;