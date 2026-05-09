'use strict';
/**
 * UpdateOrder.js — Use Case for updating Import or Export orders.
 * (Clean Architecture — Layer 2: Application Business Rules)
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { NotFoundError, ValidationError } = require('../../domain/errors');

class UpdateOrder {
  constructor({ orderRepository } = {}) {
    this.orderRepo = orderRepository;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   * @param {string} opts.type - 'IMPORT' | 'EXPORT'
   * @param {number} opts.id
   * @param {object} opts.dto
   * @param {number} opts.userId
   * @param {string} opts.ipAddress
   */
  async execute(conn, { type, id, dto, userId, ipAddress }) {
    if (type === 'IMPORT') {
      const existing = await this.orderRepo.findImportOrderForUpdate(conn, id);
      if (!existing) throw new NotFoundError('ImportOrder', id);
      if (!['DRAFT', 'REJECTED'].includes(existing.status)) {
        throw new ValidationError('Chỉ có thể sửa phiếu ở trạng thái Nháp hoặc Bị từ chối');
      }

      const totalAmount = dto.items 
        ? dto.items.reduce((s, i) => s + (parseInt(i.quantity) * Number(i.unitPrice || 0)), 0) 
        : existing.total_amount;

      await this.orderRepo.updateImport(conn, id, {
        supplierId: dto.supplierId,
        note: dto.note?.trim(),
        totalAmount
      });
      
      if (dto.items) {
        await this.orderRepo.insertImportItems(conn, id, dto.items);
      }

      await writeAuditLog(conn, {
        entityType: 'import_order',
        entityId: id,
        action: 'UPDATE',
        changedBy: userId,
        ipAddress,
        afterData: { total_amount: totalAmount, item_count: dto.items?.length },
      });

      return { id };
    }

    if (type === 'EXPORT') {
      const existing = await this.orderRepo.findExportOrderForUpdate(conn, id);
      if (!existing) throw new NotFoundError('ExportOrder', id);
      if (!['DRAFT', 'REJECTED'].includes(existing.status)) {
        throw new ValidationError('Chỉ có thể sửa phiếu ở trạng thái Nháp hoặc Bị từ chối');
      }

      const totalQty = dto.items 
        ? dto.items.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0) 
        : existing.total_qty;

      await this.orderRepo.updateExport(conn, id, {
        recipientName: dto.recipientName,
        department: dto.department,
        warehouseId: dto.warehouseId,
        note: dto.note?.trim(),
        totalQty
      });

      if (dto.items) {
        await this.orderRepo.insertExportItems(conn, id, dto.items);
      }

      await writeAuditLog(conn, {
        entityType: 'export_order',
        entityId: id,
        action: 'UPDATE',
        changedBy: userId,
        ipAddress,
        afterData: { total_qty: totalQty, item_count: dto.items?.length },
      });

      return { id };
    }

    throw new Error('Unsupported order type: ' + type);
  }
}

module.exports = UpdateOrder;
