'use strict';
/**
 * CreateOrder.js — Use Case for creating Import or Export orders.
 * (Clean Architecture — Layer 2: Application Business Rules)
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');

class CreateOrder {
  constructor({ orderRepository } = {}) {
    this.orderRepo = orderRepository;
  }

  /**
   * @param {object} conn - MySQL connection in transaction
   * @param {object} opts
   * @param {string} opts.type - 'IMPORT' | 'EXPORT'
   * @param {object} opts.dto  - Validated DTO
   * @param {number} opts.userId
   * @param {string} opts.ipAddress
   */
  async execute(conn, { type, dto, userId, ipAddress }) {
    if (type === 'IMPORT') {
      const orderCode = await this.orderRepo.generateImportCode(conn);
      const totalAmount = dto.items.reduce((s, i) => s + (parseInt(i.quantity) * Number(i.unitPrice || 0)), 0);
      
      const orderId = await this.orderRepo.createImport(conn, {
        orderCode,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        totalAmount,
        note: dto.note?.trim(),
        createdBy: userId
      });
      
      await this.orderRepo.insertImportItems(conn, orderId, dto.items);

      await writeAuditLog(conn, {
        entityType: 'import_order',
        entityId: orderId,
        action: 'CREATE',
        changedBy: userId,
        ipAddress,
        afterData: { order_code: orderCode, status: 'DRAFT', total_amount: totalAmount, item_count: dto.items.length },
      });

      return { id: orderId, orderCode };
    } 
    
    if (type === 'EXPORT') {
      const orderCode = await this.orderRepo.generateExportCode(conn);
      const totalQty = dto.items.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);
      
      const orderId = await this.orderRepo.createExport(conn, {
        orderCode,
        recipientName: dto.recipientName,
        department: dto.department,
        warehouseId: dto.warehouseId,
        note: dto.note?.trim(),
        totalQty,
        createdBy: userId
      });
      
      await this.orderRepo.insertExportItems(conn, orderId, dto.items);

      await writeAuditLog(conn, {
        entityType: 'export_order',
        entityId: orderId,
        action: 'CREATE',
        changedBy: userId,
        ipAddress,
        afterData: { order_code: orderCode, status: 'DRAFT', total_qty: totalQty, item_count: dto.items.length },
      });

      return { id: orderId, orderCode };
    }

    throw new Error('Unsupported order type: ' + type);
  }
}

module.exports = CreateOrder;
