'use strict';

class WarehouseLockedError extends Error {
  constructor(warehouseId, message) {
    super(message || `Kho #${warehouseId} đang trong quá trình kiểm kê. Tạm thời không thể thực hiện giao dịch.`);
    this.name   = 'WarehouseLockedError';
    this.code   = 'WAREHOUSE_LOCKED';
    this.status = 409;
    this.meta   = { warehouseId };
  }
}

module.exports = WarehouseLockedError;
