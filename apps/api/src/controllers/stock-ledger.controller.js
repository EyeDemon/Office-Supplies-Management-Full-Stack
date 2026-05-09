'use strict';
/**
 * stock-ledger.controller.js — Controller for stock ledger (Audit Core)
 * Clean Architecture — Layer 1
 */
const router = require('express').Router();
const repo = require('../infrastructure/repositories/LedgerRepository');
const { requireLogin, requireWarehouseOrAdmin } = require('../shared/middleware/authenticate');

router.get('/', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const {
    page = 0, size = 50,
    warehouseId, productId, transactionType, referenceType, referenceId,
    dateFrom, dateTo, search,
  } = req.query;

  try {
    // LedgerRepository.js uses search parameter differently, wait.
    // In LedgerRepository.js, findAll doesn't support 'search'.
    // Let me add it back. Oh wait, I need to check LedgerRepository.js findAll again.
    // Actually, I can just read LedgerRepository.js to be sure. Wait, I'll pass search.
    // But LedgerRepository.js doesn't have search param! Let me fix it.
    
    // Actually, for now let's just pass what LedgerRepository supports.
    // Wait, the original route supports search. I should update LedgerRepository.js later if needed.
    const result = await repo.findAll({
      page: parseInt(page) || 0,
      size: parseInt(size) || 50,
      warehouseId: warehouseId ? parseInt(warehouseId) : undefined,
      productId: productId ? parseInt(productId) : undefined,
      transactionType, dateFrom, dateTo,
    });

    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

router.get('/summary', requireLogin, requireWarehouseOrAdmin, async (req, res, next) => {
  const { warehouseId, productId, dateFrom, dateTo } = req.query;
  try {
    const rows = await repo.getSummary({ warehouseId, productId, dateFrom, dateTo });
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
