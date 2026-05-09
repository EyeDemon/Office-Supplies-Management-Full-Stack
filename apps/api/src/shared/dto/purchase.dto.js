'use strict';
/**
 * purchase.dto.js — Zod schemas cho Mua hàng (Purchase Request + Purchase Order)
 * PR Workflow: PENDING → APPROVED → PO_CREATED | REJECTED | CANCELLED
 * PO Workflow: DRAFT → CONFIRMED → RECEIVED | CANCELLED
 * Spec VI.1: Validate tại Controller layer.
 */
const { z } = require('zod');

const PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// ── Purchase Request (PR) ────────────────────────────────────────

const PRItemSchema = z.object({
  productId: z.number().int().positive('productId phải là số nguyên dương'),
  quantity:  z.number().int().positive('Số lượng phải > 0'),
  note:      z.string().max(500).optional().nullable(),
});

/** POST /api/purchases/requests — Tạo Purchase Request */
const CreatePurchaseRequestSchema = z.object({
  warehouseId: z.number().int().positive().optional().nullable(),
  supplierId:  z.number().int().positive().optional().nullable(),
  reason:   z.string().trim().min(5, 'Lý do phải có ít nhất 5 ký tự').max(500),
  priority: z.enum(PRIORITY_VALUES, {
    errorMap: () => ({ message: `priority phải là: ${PRIORITY_VALUES.join(', ')}` }),
  }).default('MEDIUM'),
  note:     z.string().max(1000).optional().nullable(),
  items:    z.array(PRItemSchema).min(1, 'Phải có ít nhất 1 mặt hàng'),
});

/** POST /api/purchases/requests/:id/approve */
const ApprovePurchaseRequestSchema = z.object({
  approvalNote: z.string().max(500).optional().nullable(),
});

/** POST /api/purchases/requests/:id/reject */
const RejectPurchaseRequestSchema = z.object({
  rejectionNote: z.string().min(5, 'Lý do từ chối phải có ít nhất 5 ký tự').max(500),
});

// ── Purchase Order (PO) ─────────────────────────────────────────

const POItemSchema = z.object({
  productId:  z.number().int().positive('productId phải là số nguyên dương'),
  quantity:   z.number().int().positive('Số lượng phải > 0'),
  unitPrice:  z.number().min(0, 'Đơn giá không được âm').default(0),
  unitId:     z.number().int().positive().optional().nullable(),
  lotId:      z.number().int().positive().optional().nullable(),
  note:       z.string().max(500).optional().nullable(),
});

/** POST /api/purchases/orders — Tạo Purchase Order từ PR */
const CreatePurchaseOrderSchema = z.object({
  prId:        z.number().int().positive('prId là bắt buộc'),
  supplierId:  z.number().int().positive().optional().nullable(),
  warehouseId: z.number().int().positive('warehouseId là bắt buộc'),
  note:        z.string().max(1000).optional().nullable(),
  items:       z.array(POItemSchema).min(1, 'PO phải có ít nhất 1 dòng hàng'),
});

/** POST /api/purchases/orders/:id/confirm */
const ConfirmPurchaseOrderSchema = z.object({
  confirmNote: z.string().max(500).optional().nullable(),
});

/** GET /api/purchases/requests — Query params */
const ListPRQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  size:     z.coerce.number().int().min(1).max(100).default(20),
  status:   z.enum(['PENDING', 'APPROVED', 'PO_CREATED', 'REJECTED', 'CANCELLED']).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** GET /api/purchases/orders — Query params */
const ListPOQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  size:     z.coerce.number().int().min(1).max(100).default(20),
  status:   z.enum(['DRAFT', 'CONFIRMED', 'RECEIVED', 'CANCELLED']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const BulkApproveSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Phải có ít nhất 1 ID'),
});

module.exports = {
  CreatePurchaseRequestSchema,
  ApprovePurchaseRequestSchema,
  RejectPurchaseRequestSchema,
  BulkApproveSchema,
  CreatePurchaseOrderSchema,
  ConfirmPurchaseOrderSchema,
  ListPRQuerySchema,
  ListPOQuerySchema,
};
