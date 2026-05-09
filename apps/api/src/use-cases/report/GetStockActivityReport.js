'use strict';

class GetStockActivityReport {
  constructor({ reportRepository } = {}) {
    this.reportRepo = reportRepository;
  }

  async execute(db, { days = 30, dateFrom, dateTo, department, departmentId, warehouseId } = {}) {
    const rows = await this.reportRepo.getStockActivity({
      days,
      dateFrom,
      dateTo,
      department,
      departmentId,
      warehouseId
    });

    return rows.map(r => ({
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      categoryName: r.category_name,
      price: Number(r.price || 0),
      importedQty: Number(r.imported_qty || 0),
      exportedQty: Number(r.exported_qty || 0),
      adjustedQty: Number(r.adjusted_qty || 0),
      totalTransactions: Number(r.total_transactions || 0),
      currentStock: Number(r.current_stock || 0),
      warehouseAvgPrice: Number(r.warehouse_avg_price || 0),
      minStockQty: Number(r.min_stock_qty || 0),
      isLowStock: Boolean(r.is_low_stock),
    }));
  }
}

module.exports = GetStockActivityReport;
