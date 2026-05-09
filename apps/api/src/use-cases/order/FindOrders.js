'use strict';

class FindOrders {
  constructor({ orderRepository }) {
    this.orderRepo = orderRepository;
  }

  /**
   * @param {object} db 
   * @param {object} params 
   * @param {'IMPORT' | 'EXPORT'} params.type
   */
  async execute(db, { type, ...filters }) {
    if (type === 'IMPORT') {
      return this.orderRepo.findAllImport(db, filters);
    }
    if (type === 'EXPORT') {
      return this.orderRepo.findAllExport(db, filters);
    }
    throw new Error('Invalid order type for FindOrders use case');
  }
}

module.exports = FindOrders;
