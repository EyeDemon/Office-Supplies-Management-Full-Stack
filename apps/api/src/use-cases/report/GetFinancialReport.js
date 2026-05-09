'use strict';
const { ValidationError } = require('../../domain/errors');

class GetFinancialReport {
  constructor({ reportRepository } = {}) {
    this.reportRepo = reportRepository;
  }

  async execute(db, { dateFrom, dateTo, grouping, departmentId } = {}) {
    if (!dateFrom || !dateTo) {
      throw new ValidationError('Phải chọn khoảng thời gian');
    }

    const rows = await this.reportRepo.getFinancial({
      dateFrom,
      dateTo,
      grouping,
      departmentId
    });

    return rows.map(r => ({
      groupName: r.group_name,
      totalImportCost: Number(r.total_import_cost || 0),
      totalExportCost: Number(r.total_export_cost || 0)
    }));
  }
}

module.exports = GetFinancialReport;
