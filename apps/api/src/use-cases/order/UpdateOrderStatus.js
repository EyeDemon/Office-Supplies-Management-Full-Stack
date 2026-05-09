'use strict';
/**
 * UpdateOrderStatus.js — Use case để cập nhật trạng thái các loại phiếu (Import, Export).
 * Đảm bảo tuân thủ Clean Architecture: Controller -> UseCase -> Repository.
 */
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { NotFoundError, ValidationError } = require('../../domain/errors');

class UpdateOrderStatus {
  constructor({ orderRepository, stockRepository, unitService, reserveStockUseCase, releaseReservationUseCase } = {}) {
    this.orderRepo = orderRepository;
    this.stockRepo = stockRepository;
    this.unitService = unitService;
    this.reserveUC = reserveStockUseCase;
    this.releaseUC = releaseReservationUseCase;
  }

  /**
   * @param {object} conn
   * @param {object} opts
   */
  async execute(conn, { type, id, status, userId, ipAddress, reason = null }) {
    const isImport = type === 'IMPORT';
    
    // 1. Lấy thông tin phiếu kèm lock
    let order;
    if (isImport) {
      order = await this.orderRepo.findImportOrderForUpdate(conn, id);
    } else {
      order = await this.orderRepo.findExportOrderForUpdate(conn, id);
    }

    if (!order) {
      throw new NotFoundError(`Phiếu ${isImport ? 'nhập' : 'xuất'}`, id);
    }

    // 2. Validate chuyển đổi trạng thái
    assertValidTransition(isImport ? 'import_order' : 'export_order', order.status, status);

    // 3. Xử lý logic đặc biệt cho Export Order (Reservation)
    if (!isImport) {
      // Nếu APPROVE -> Giữ chỗ (Reservation)
      if (status === 'APPROVED' && this.reserveUC) {
        const fullOrder = await this.orderRepo.findExportById(conn, id);
        const reserveItems = [];
        for (const item of fullOrder.items) {
          const baseQty = this.unitService 
            ? await this.unitService.convertToBase(conn, item.product_id, item.unit_id, item.quantity)
            : item.quantity;
          reserveItems.push({ productId: item.product_id, quantity: baseQty });
        }
        const result = await this.reserveUC.execute(conn, { warehouseId: order.warehouse_id, items: reserveItems });
        if (result.warnings && result.warnings.length > 0) {
          throw new ValidationError(`Không đủ tồn kho để giữ chỗ: ${result.warnings.map(w => w.message).join('; ')}`);
        }
      }
      
      // Nếu CANCELLED và trước đó là APPROVED -> Giải phóng giữ chỗ
      if (status === 'CANCELLED' && order.status === 'APPROVED' && this.releaseUC) {
        const fullOrder = await this.orderRepo.findExportById(conn, id);
        const releaseItems = [];
        for (const item of fullOrder.items) {
          const baseQty = this.unitService 
            ? await this.unitService.convertToBase(conn, item.product_id, item.unit_id, item.quantity)
            : item.quantity;
          releaseItems.push({ productId: item.product_id, quantity: baseQty });
        }
        await this.releaseUC.execute(conn, { warehouseId: order.warehouse_id, items: releaseItems });
      }
    }

    // 4. Cập nhật trạng thái trong DB
    if (isImport) {
      await this.orderRepo.updateImportStatus(conn, id, { status, userId, reason });
    } else {
      await this.orderRepo.updateExportStatus(conn, id, { status, userId, reason });
    }

    // 5. Ghi Audit Log
    await writeAuditLog(conn, {
      entityType: isImport ? 'import_order' : 'export_order',
      entityId: id,
      action: status,
      changedBy: userId,
      ipAddress,
      beforeData: { status: order.status },
      afterData: { status },
      note: reason
    });

    return { orderId: id, status };
  }
}

module.exports = UpdateOrderStatus;
