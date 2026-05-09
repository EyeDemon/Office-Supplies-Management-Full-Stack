'use strict';
/**
 * dashboard.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const repo   = require('../infrastructure/repositories/DashboardRepository');
const { requireLogin, requireManagerOrAdmin } = require('../shared/middleware/authenticate');
const { attachUserWarehouses, buildWarehouseFilter } = require('../shared/middleware/rbac');

router.get('/stats', requireLogin, attachUserWarehouses, async (req, res) => {
  try {
    const stockRow = await repo.getStockSummary();
    const isMA  = ['ADMIN','MANAGER'].includes(req.session.role);
    const isWH  = req.session.role === 'WAREHOUSE';
    const userId = req.session.userId;

    if (isMA) {
      const wFilter = buildWarehouseFilter(req, 'warehouse_id', true);
      const wWhere = wFilter.clause !== '1=1' ? ` AND ${wFilter.clause}` : '';
      const tfClause1 = buildWarehouseFilter(req, 'to_warehouse_id', true).clause;
      const tfClause2 = buildWarehouseFilter(req, 'from_warehouse_id', true).clause;
      const wWhereTf = wFilter.clause !== '1=1' ? ` AND (${tfClause1} OR ${tfClause2})` : '';
      const wParams = wFilter.clause !== '1=1' ? wFilter.params : [];
      const wParamsTf = wFilter.clause !== '1=1' ? [...wFilter.params, ...wFilter.params] : [];

      const stats = await repo.getAdminStats({ wWhere, wParams, wWhereTf, wParamsTf, userId });
      res.json({ success: true, message: 'OK', data: {
        totalProducts:   Number(stockRow?.total_products || 0),
        totalStockValue: Number(stockRow?.total_stock_value || 0),
        lowStockCount:   Number(stockRow?.low_stock_count || 0),
        outOfStockCount: Number(stockRow?.out_of_stock_count || 0),
        totalUsers:      Number(stats.userRow?.total || 0),
        unreadNotifs:    Number(stats.unreadRow?.cnt || 0),
        pendingRequisitions:     Number(stats.pendingReqRow?.cnt || 0),
        draftImportOrders:       Number(stats.draftImportRow?.cnt || 0),
        pendingImportOrders:     Number(stats.pendingImportRow?.cnt || 0),
        approvedImportOrders:    Number(stats.approvedImportRow?.cnt || 0),
        draftExportOrders:       Number(stats.draftExportRow?.cnt || 0),
        pendingTransfers:        Number(stats.pendingTfRow?.cnt || 0),
        pendingPurchaseRequests: Number(stats.pendingPRRow?.cnt || 0),
        confirmedPurchaseOrders: Number(stats.confirmedPORow?.cnt || 0),
        draftReturns:            Number(stats.draftReturnRow?.cnt || 0),
        todayImported: Number(stats.todayTx?.imported || 0),
        todayExported: Number(stats.todayTx?.exported || 0),
        todayTxCount:  Number(stats.todayTx?.tx_count || 0),
        draftOrders: Number(stats.draftImportRow?.cnt || 0),
        highStockCount: Number(stats.highStockRow?.cnt || 0),
      }});
    } else if (isWH) {
      const wFilter = buildWarehouseFilter(req, 'warehouse_id', true);
      const wWhere = wFilter.clause !== '1=1' ? ` AND ${wFilter.clause}` : '';
      const wParams = wFilter.clause !== '1=1' ? wFilter.params : [];
      const tfClause1 = buildWarehouseFilter(req, 'to_warehouse_id', true).clause;
      const tfClause2 = buildWarehouseFilter(req, 'from_warehouse_id', true).clause;
      const wWhereTf = wFilter.clause !== '1=1' ? ` AND (${tfClause1} OR ${tfClause2})` : '';
      const wParamsTf = wFilter.clause !== '1=1' ? [...wFilter.params, ...wFilter.params] : [];

      const stats = await repo.getWarehouseStats({ wWhere, wParams, wWhereTf, wParamsTf, userId });
      res.json({ success: true, message: 'OK', data: {
        totalProducts:   Number(stockRow?.total_products || 0),
        totalStockValue: Number(stockRow?.total_stock_value || 0),
        lowStockCount:   Number(stockRow?.low_stock_count || 0),
        outOfStockCount: Number(stockRow?.out_of_stock_count || 0),
        unreadNotifs:    Number(stats.unreadRow?.cnt || 0),
        approvedImportOrders: Number(stats.pendingImportRow?.cnt || 0),
        draftExportOrders:    Number(stats.pendingExportRow?.cnt || 0),
        pendingTransfers:     Number(stats.pendingTfRow?.cnt || 0),
        pendingRequisitions:  Number(stats.approvedReqRow?.cnt || 0),
        todayImported: Number(stats.todayTx?.imported || 0),
        todayExported: Number(stats.todayTx?.exported || 0),
        totalUsers: null,
      }});
    } else {
      const stats = await repo.getUserStats(userId);
      res.json({ success: true, message: 'OK', data: {
        totalProducts:   Number(stockRow?.total_products || 0),
        totalStockValue: Number(stockRow?.total_stock_value || 0),
        lowStockCount:   Number(stockRow?.low_stock_count || 0),
        outOfStockCount: Number(stockRow?.out_of_stock_count || 0),
        myPendingRequisitions:  Number(stats.myReqRow?.cnt || 0),
        myApprovedRequisitions: Number(stats.myApprovedRow?.cnt || 0),
        totalUsers: null, unreadNotifs: null,
        pendingRequisitions: null, draftOrders: null,
      }});
    }
  } catch (e) { next(e); }
});

router.get('/weekly', requireLogin, async (req, res) => {
  try {
    const rows = await repo.getWeeklyActivity();
    const map = new Map(rows.map(r => [String(r.day).slice(0,10), r]));
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dayStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const found  = map.get(dayStr);
      result.push({
        day:      dayStr,
        label:    d.toLocaleDateString('vi-VN', { weekday:'short', day:'numeric', month:'numeric' }),
        imported: Number(found?.imported || 0),
        exported: Number(found?.exported || 0),
        adjusted: Number(found?.adjusted || 0),
        txCount:  Number(found?.tx_count || 0),
      });
    }
    res.json({ success: true, message: 'OK', data: result });
  } catch (e) { next(e); }
});

module.exports = router;
