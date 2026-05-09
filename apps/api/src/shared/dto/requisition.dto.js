'use strict';
/**
 * requisition.dto.js — Zod schemas cho Phiếu yêu cầu cấp phát (Requisitions)
 * Workflow: PENDING → APPROVED → WAREHOUSE_CONFIRMED | REJECTED | CANCELLED
 * Spec VI.1 (DTO Layer): Validate tại Controller layer.
 */
const { z } = require('zod');

const RequisitionItemSchema = z.object({
  productId:         z.number().int().positive('productId phải là số nguyên dương'),
  quantityRequested: z.number().int().positive('Số lượng yêu cầu phải > 0'),
  note:              z.string().max(500).optional().nullable(),
});

/** POST /api/requisitions — Tạo phiếu yêu cầu cấp phát */
const CreateRequisitionSchema = z.object({
  warehouseId: z.number().int().positive('warehouseId là bắt buộc'),
  note:        z.string().max(1000).optional().nullable(),
  items:       z.array(RequisitionItemSchema).min(1, 'Phiếu yêu cầu phải có ít nhất 1 mặt hàng'),
});

/** POST /api/requisitions/:id/approve — Manager duyệt phiếu */
const ApproveRequisitionSchema = z.object({
  approvalNote: z.string().max(500).optional().nullable(),
  approvedItems: z.array(z.object({
    itemId: z.number().int().positive(),
    quantityApproved: z.number().int().min(0),
  })).optional(),
});

/** POST /api/requisitions/:id/reject — Manager từ chối */
const RejectRequisitionSchema = z.object({
  rejectionNote: z.string().min(5, 'Lý do từ chối phải có ít nhất 5 ký tự').max(500),
});

/** POST /api/requisitions/:id/warehouse-confirm — Kho xuất hàng */
const WarehouseConfirmSchema = z.object({
  confirmedItems: z.array(z.object({
    itemId:             z.number().int().positive(),
    quantityDispensed:  z.number().int().min(0, 'Số lượng cấp không được âm'),
  })).min(1).optional(),
  note: z.string().max(500).optional().nullable(),
});

/** GET /api/requisitions — Query params */
const ListRequisitionQuerySchema = z.object({
  page:        z.coerce.number().int().min(1).default(1),
  size:        z.coerce.number().int().min(1).max(100).default(20),
  status:      z.enum(['PENDING', 'APPROVED', 'WAREHOUSE_CONFIRMED', 'REJECTED', 'CANCELLED']).optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
  dateFrom:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

module.exports = {
  CreateRequisitionSchema,
  ApproveRequisitionSchema,
  RejectRequisitionSchema,
  WarehouseConfirmSchema,
  ListRequisitionQuerySchema,
};
