'use strict';
/**
 * AnalyzeReplenishment.js
 * AI-Driven Inventory Intelligence (ERP+ Level)
 * 
 * Trách nhiệm:
 * 1. Phân tích lịch sử xuất kho (velocity) trong N ngày.
 * 2. Tính toán nhu cầu dự báo (Forecasting).
 * 3. Phân loại ABC (theo giá trị vòng quay) & XYZ (theo độ ổn định).
 * 4. Đề xuất số lượng mua tối ưu để duy trì kho trong M ngày tới.
 */
const transactionRepo = require('../../infrastructure/repositories/TransactionRepository');
const productRepo     = require('../../infrastructure/repositories/ProductRepository');

class AnalyzeReplenishment {
  /**
   * @param {object} conn - Database connection
   * @param {object} opts
   * @param {number} [opts.warehouseId]
   * @param {number} [opts.lookbackDays=90] - Thời gian phân tích lịch sử (mặc định 3 tháng)
   * @param {number} [opts.horizonDays=30]  - Thời gian cần đảm bảo tồn kho (mặc định 1 tháng tới)
   */
  async execute(conn, { warehouseId, lookbackDays = 90, horizonDays = 30 } = {}) {
    // 1. Xác định khoảng thời gian phân tích
    const dateTo   = new Date().toISOString().slice(0, 10);
    const dateFrom = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 2. Lấy báo cáo tiêu hao thực tế
    const consumption = await transactionRepo.getConsumptionReport({ warehouseId, dateFrom, dateTo });
    
    // 3. Lấy tồn kho hiện tại của các sản phẩm có tiêu hao
    const products = await productRepo.findActive(conn);
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // 4. Tính toán các chỉ số AI
    const analysis = consumption.map(item => {
      const p = productMap[item.product_id];
      if (!p) return null;

      const totalQtyOut = Number(item.total_qty_out || 0);
      const avgDailyVelocity = totalQtyOut / lookbackDays;
      
      // Dự báo nhu cầu trong horizonDays tới
      const forecastedDemand = avgDailyVelocity * horizonDays;
      
      // Tồn kho hiện tại
      const currentStock = Number(p.stock_qty || 0);
      
      // Days of Inventory (DOI) - Còn bao nhiêu ngày thì hết hàng?
      const doi = avgDailyVelocity > 0 ? (currentStock / avgDailyVelocity) : 999;

      // Số lượng đề xuất mua (Replenishment)
      // Công thức: (Nhu cầu dự báo + Tồn tối thiểu) - Tồn hiện tại
      const suggestedQty = Math.max(0, Math.ceil((forecastedDemand + (p.min_stock_qty || 0)) - currentStock));

      // Phân loại XYZ (Đơn giản hóa: dựa trên tần suất giao dịch)
      // X: Thường xuyên (transCount cao), Y: Trung bình, Z: Thưa thớt
      const txCount = Number(item.transaction_count || 0);
      let xyzClass = 'Z';
      if (txCount > (lookbackDays / 3)) xyzClass = 'X';
      else if (txCount > (lookbackDays / 10)) xyzClass = 'Y';

      return {
        productId: item.product_id,
        name: p.name,
        sku: p.sku,
        currentStock,
        avgDailyVelocity: Math.round(avgDailyVelocity * 100) / 100,
        forecastedDemand: Math.round(forecastedDemand),
        doi: Math.round(doi),
        suggestedQty,
        unitPrice: p.avg_unit_price || 0,
        totalValueOut: item.total_cost,
        xyzClass,
        status: doi < 7 ? 'CRITICAL' : doi < 15 ? 'WARNING' : 'HEALTHY'
      };
    }).filter(Boolean);

    // 5. Phân loại ABC (Dựa trên Total Value Out - Pareto 80/20)
    analysis.sort((a, b) => b.totalValueOut - a.totalValueOut);
    const grandTotalValue = analysis.reduce((sum, item) => sum + item.totalValueOut, 0);
    
    let runningTotal = 0;
    analysis.forEach(item => {
      runningTotal += item.totalValueOut;
      const percent = (runningTotal / grandTotalValue) * 100;
      if (percent <= 70) item.abcClass = 'A';
      else if (percent <= 90) item.abcClass = 'B';
      else item.abcClass = 'C';
    });

    return {
      summary: {
        totalAnalyzed: analysis.length,
        criticalItems: analysis.filter(i => i.status === 'CRITICAL').length,
        potentialShortageValue: analysis.reduce((sum, i) => sum + (i.suggestedQty * i.unitPrice), 0)
      },
      items: analysis
    };
  }
}

module.exports = new AnalyzeReplenishment();
