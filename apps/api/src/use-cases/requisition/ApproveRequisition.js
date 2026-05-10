'use strict';
/**
 * ApproveRequisition.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec IX.3: Approval flow
 *   PENDING → APPROVED
 *   → LOCK warehouse_stock (NOWAIT) per product per warehouse
 *   → reserved += qty_approved
 */
const { assertValidTransition } = require('../../domain/rules');
const { writeAuditLog } = require('../../shared/utils/auditLogger');
const { NotFoundError, ValidationError } = require('../../domain/errors');

class ApproveRequisition {
  constructor({ requisitionRepository, orderRepository, userRepository, stockRepository, quotaRepository, productRepository, reserveStockUseCase } = {}) {
    this.reqRepo = requisitionRepository;
    this.orderRepo = orderRepository;
    this.userRepo = userRepository;
    this.stockRepo = stockRepository;
    this.quotaRepo = quotaRepository;
    this.productRepo = productRepository;
    this.reserveUC = reserveStockUseCase;
  }


  /**
   * @param {object} conn
   * @param {object} input
   * @param {number} input.requisitionId
   * @param {number} input.approvedBy          - userId của Manager
   * @param {Array|null} input.approvedItems   - [{ itemId, quantityApproved }]
   * @param {string|null} input.ipAddress
   * @returns {Promise<{ warnings: string[] }>}
   */
  async execute(conn, { requisitionId, approvedBy, approvedItems, ipAddress }) {
    // 1. Lock requisition header — NOWAIT
    const requisition = await this.reqRepo.findByIdForUpdate(conn, requisitionId);

    if (!requisition) {
      throw new NotFoundError('Phiếu yêu cầu', requisitionId);
    }

    // 2. Validate state machine
    assertValidTransition('requisition', requisition.status, 'APPROVED');

    // 3. Lấy danh sách items
    const items = await this.reqRepo.findItems(conn, requisitionId);

    if (items.length === 0) {
      throw new ValidationError('Phiếu yêu cầu không có sản phẩm');
    }

    const approvedMap = {};
    if (Array.isArray(approvedItems) && approvedItems.length > 0) {
      for (const ai of approvedItems) {
        approvedMap[Number(ai.itemId)] = Math.max(0, parseInt(ai.quantityApproved) || 0);
      }
    }

    const warehouseId = requisition.warehouse_id;
    const exportItems = [];
    const reserveItems = [];
    const warnings = [];

    for (const item of items) {
      const qtyApproved = approvedMap[item.id] !== undefined
        ? approvedMap[item.id]
        : item.quantity_requested;

      await this.reqRepo.updateItemApprovedQty(conn, item.id, qtyApproved);

      if (qtyApproved <= 0) continue;

      // Collect for export order
      exportItems.push({
        productId: item.product_id,
        quantity: qtyApproved,
        unitId: item.unit_id,
        note: `Theo phiếu yêu cầu ${requisition.req_code}`
      });

      if (warehouseId) {
        reserveItems.push({ productId: item.product_id, quantity: qtyApproved });
      }
    }

    // Spec VIII.6: Standardized Reservation
    if (warehouseId && reserveItems.length > 0 && this.reserveUC) {
      await this.reserveUC.execute(conn, { warehouseId, items: reserveItems });
    }

    // 6. Cập nhật header → APPROVED
    await this.reqRepo.updateStatus(conn, requisitionId, {
      status: 'APPROVED',
      approvedBy,
      approvedAt: 'NOW()'
    });

    // [BUG-05 FIX] Fetch requester ONE TIME — dùng chung cho cả quota check và export creation.
    // Trước đây có 2 lần gọi userRepo.findById() cho cùng 1 user → lãng phí 1 DB round-trip.
    const requester = await this.userRepo.findById(requisition.requester_id);

    // MISS-04: Department Quota Management
    if (requester && requester.departmentId && this.quotaRepo) {
      let totalApprovedAmount = 0;
      for (const item of items) {
        const qtyApproved = approvedMap[item.id] !== undefined ? approvedMap[item.id] : item.quantity_requested;
        if (qtyApproved > 0) {
          const product = await this.productRepo.findById(conn, item.product_id);
          if (product) {
            totalApprovedAmount += Number(product.price || 0) * qtyApproved;
          }
        }
      }
      if (totalApprovedAmount > 0) {
        // [ENFORCEMENT] Check if budget is exceeded
        const hasBudget = await this.quotaRepo.hasEnoughQuota(conn, requester.departmentId, totalApprovedAmount);
        if (!hasBudget) {
          throw new ValidationError(`Vượt định mức (Quota) của phòng ban. Cần duyệt ghi đè hoặc tăng hạn mức.`);
        }
        await this.quotaRepo.incrementSpent(conn, requester.departmentId, totalApprovedAmount);
      }
    }

    // ── Tự động tạo Phiếu Xuất Kho ──
    // status='APPROVED' là intentional: manager đã duyệt requisition = đã duyệt phiếu xuất ngầm.
    // Warehouse chỉ cần warehouse-confirm (thực xuất kho), không cần approve lại.
    if (exportItems.length > 0) {
      // requester đã được fetch ở trên — không fetch lại
      const exportCode = await this.orderRepo.generateExportCode(conn);

      const totalQty = exportItems.reduce((sum, it) => sum + it.quantity, 0);
      const exportId = await this.orderRepo.createExport(conn, {
        orderCode: exportCode,
        recipientName: requester?.fullName || 'N/A',
        department: requester?.department || 'N/A',
        warehouseId: warehouseId,
        note: `Tự động tạo từ phiếu yêu cầu ${requisition.req_code}. ${requisition.note || ''}`,
        totalQty: totalQty,
        createdBy: approvedBy,
        status: 'APPROVED', // Đã duyệt vì Requisition đã duyệt
        requisitionId: requisitionId
      });

      await this.orderRepo.insertExportItems(conn, exportId, exportItems);
    }

    // 7. Audit log
    await writeAuditLog(conn, {
      entityType: 'requisition', entityId: requisitionId, action: 'APPROVE',
      changedBy: approvedBy, ipAddress,
      beforeData: { status: 'PENDING' },
      afterData: { status: 'APPROVED', warningCount: warnings.length, exportGenerated: exportItems.length > 0 },
    });

    return { warnings };
  }
}

module.exports = ApproveRequisition;