'use strict';

const { ValidationError } = require('../errors');

class UnitService {
  /**
   * Chuyển đổi số lượng từ đơn vị bất kỳ sang đơn vị mục tiêu (mặc định là base_unit).
   * Hỗ trợ chuyển đổi bắc cầu (transitive) và đảo chiều (reverse).
   */
  async convertToBase(conn, productId, fromUnitId, qty) {
    if (!fromUnitId) return qty;

    const [[product]] = await conn.query(
      'SELECT base_unit_id FROM products WHERE id = ?', 
      [productId]
    );

    if (!product || fromUnitId === product.base_unit_id) {
      return qty;
    }

    const ratio = await this.getConversionRatio(conn, fromUnitId, product.base_unit_id);
    if (ratio === null) {
      throw new ValidationError(`Không tìm thấy quy tắc chuyển đổi từ đơn vị #${fromUnitId} sang đơn vị gốc #${product.base_unit_id} cho sản phẩm #${productId}`);
    }

    return Math.round(qty * ratio);
  }

  /**
   * Tìm tỉ lệ chuyển đổi giữa 2 đơn vị bằng BFS để hỗ trợ bắc cầu.
   */
  async getConversionRatio(conn, fromId, toId) {
    if (fromId === toId) return 1.0;

    // Lấy toàn bộ danh sách conversion để build graph (thường số lượng conversion không quá lớn)
    const [rows] = await conn.query('SELECT from_unit_id, to_unit_id, ratio FROM unit_conversions');
    
    const adj = {};
    for (const r of rows) {
      const f = Number(r.from_unit_id);
      const t = Number(r.to_unit_id);
      const val = Number(r.ratio);
      
      if (!adj[f]) adj[f] = [];
      adj[f].push({ to: t, ratio: val });
      
      // Add reverse edge
      if (!adj[t]) adj[t] = [];
      adj[t].push({ to: f, ratio: 1.0 / val });
    }

    // BFS
    const queue = [{ id: fromId, currentRatio: 1.0 }];
    const visited = new Set([fromId]);

    while (queue.length > 0) {
      const { id, currentRatio } = queue.shift();
      if (id === toId) return currentRatio;

      const neighbors = adj[id] || [];
      for (const n of neighbors) {
        if (!visited.has(n.to)) {
          visited.add(n.to);
          queue.push({ id: n.to, currentRatio: currentRatio * n.ratio });
        }
      }
    }

    return null;
  }
}

module.exports = new UnitService();
