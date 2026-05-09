'use strict';
/**
 * UnitService.js — Domain service for unit-related logic.
 */
const unitRepo = require('../../infrastructure/repositories/UnitRepository');

class UnitService {
  /**
   * Convert quantity to base unit using repository.
   * @param {object} conn 
   * @param {number} productId 
   * @param {number} fromUnitId 
   * @param {number} quantity 
   */
  async convertToBase(conn, productId, fromUnitId, quantity) {
    const qty = Number(quantity) || 0;
    if (!fromUnitId || qty === 0) return qty;

    // Get product to find its base unit
    const [[product]] = await conn.query('SELECT base_unit_id FROM products WHERE id = ?', [productId]);
    if (!product || !product.base_unit_id || product.base_unit_id === fromUnitId) {
      return qty;
    }

    const toUnitId = product.base_unit_id;

    // Try direct conversion
    const direct = await unitRepo.findConversionByPair(conn, fromUnitId, toUnitId);
    if (direct) return Math.round(qty * Number(direct.ratio));

    // Try reverse conversion
    const reverse = await unitRepo.findConversionByPair(conn, toUnitId, fromUnitId);
    if (reverse && Number(reverse.ratio) > 0) return Math.round(qty / Number(reverse.ratio));

    // Fallback
    console.warn(`[UnitService] No conversion found: product#${productId} unit#${fromUnitId} -> base#${toUnitId}`);
    return qty;
  }
}

module.exports = new UnitService();
