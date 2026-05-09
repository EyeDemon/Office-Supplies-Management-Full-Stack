'use strict';

class GetBurnRateReport {
  constructor({ reportRepository } = {}) {
    this.reportRepo = reportRepository;
  }

  async execute(db, { days = 30, categoryId, departmentId } = {}) {
    const rows = await this.reportRepo.getBurnRate({
      days,
      categoryId,
      departmentId
    });

    return rows.map(r => {
      const burnRate = Number(r.total_exported) / days;
      const daysRemaining = burnRate > 0 ? Math.floor(Number(r.available_stock) / burnRate) : null;
      return {
        productId: r.product_id,
        sku: r.sku,
        productName: r.product_name,
        categoryName: r.category_name,
        currentStock: Number(r.current_stock),
        availableStock: Number(r.available_stock),
        reservedQty: Number(r.reserved_quantity),
        minStockQty: Number(r.min_stock_qty),
        reorderPoint: Number(r.reorder_point),
        avgUnitPrice: Number(r.avg_unit_price),
        stockValue: Number(r.stock_value),
        totalExported: Number(r.total_exported),
        activeDays: Number(r.active_days),
        burnRatePerDay: Math.round(burnRate * 100) / 100,
        daysRemaining,
        status: daysRemaining === null ? 'ok' : daysRemaining <= 7 ? 'critical' : daysRemaining <= 30 ? 'warning' : 'ok',
      };
    });
  }
}

module.exports = GetBurnRateReport;
