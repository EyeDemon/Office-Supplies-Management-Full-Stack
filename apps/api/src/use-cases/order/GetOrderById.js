'use strict';
const { NotFoundError } = require('../../domain/errors');

class GetOrderById {
  constructor({ orderRepository }) {
    this.orderRepo = orderRepository;
  }

  /**
   * @param {object} db 
   * @param {object} params 
   * @param {'IMPORT' | 'EXPORT'} params.type
   * @param {number} params.id
   */
  async execute(db, { type, id }) {
    let order;
    if (type === 'IMPORT') {
      order = await this.orderRepo.findImportById(db, id);
    } else if (type === 'EXPORT') {
      order = await this.orderRepo.findExportById(db, id);
    } else {
      throw new Error('Invalid order type for GetOrderById use case');
    }

    if (!order) {
      throw new NotFoundError(`${type === 'IMPORT' ? 'Phiếu nhập' : 'Phiếu xuất'}`, id);
    }

    return order;
  }
}

module.exports = GetOrderById;
