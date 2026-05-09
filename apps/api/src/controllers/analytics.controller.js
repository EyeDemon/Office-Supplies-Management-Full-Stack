'use strict';
/**
 * analytics.controller.js
 * Interface Adapter cho các tính năng BI & AI Analytics.
 */
const router = require('express').Router();
const db     = require('../shared/config/db');
const { requireManagerOrAdmin } = require('../shared/middleware/authenticate');
const { getOrSet } = require('../shared/utils/cacheHelper');
const analyzeReplenishmentUC = require('../use-cases/analytics/AnalyzeReplenishment');

/**
 * @swagger
 * tags:
 *   name: Intelligence
 *   description: Phân tích thông minh & BI
 */

/**
 * @swagger
 * /api/analytics/replenishment:
 *   get:
 *     summary: Phân tích và đề xuất nhập hàng thông minh (AI-Driven)
 *     tags: [Intelligence]
 *     parameters:
 *       - in: query
 *         name: warehouseId
 *         schema: { type: integer }
 *       - in: query
 *         name: lookback
 *         schema: { type: integer, default: 90 }
 *       - in: query
 *         name: horizon
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Phân tích hoàn tất
 */
router.get('/replenishment', requireManagerOrAdmin, async (req, res, next) => {
  const warehouseId = parseInt(req.query.warehouseId) || null;
  const lookback    = parseInt(req.query.lookback) || 90;
  const horizon     = parseInt(req.query.horizon) || 30;

  try {
    const cacheKey = `analytics:replenishment:${warehouseId || 'all'}:${lookback}:${horizon}`;
    
    const result = await getOrSet(cacheKey, async () => {
      const conn = await db.getConnection();
      try {
        return await analyzeReplenishmentUC.execute(conn, {
          warehouseId,
          lookbackDays: lookback,
          horizonDays: horizon
        });
      } finally {
        conn.release();
      }
    }, 3600); // Cache for 1 hour as this is heavy and historical

    res.json({
      success: true,
      message: 'Phân tích hoàn tất',
      data: result
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
