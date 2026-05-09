'use strict';
const { z } = require('zod');

/** Shared: item line trong phiếu nhập/xuất */
const OrderItemSchema = z.object({
  productId:    z.number().int().positive('productId phải là số nguyên dương'),
  unitId:       z.number().int().positive('unitId phải là số nguyên dương'),
  quantity:     z.number().int().positive('quantity phải là số nguyên dương'),
  unitPrice:    z.number().min(0, 'unitPrice không được âm').default(0),
  lotId:        z.number().int().positive().optional().nullable(),
  locationId:   z.number().int().positive().optional().nullable(),
  note:         z.string().max(500).optional(),
});

const CreateImportOrderSchema = z.object({
  supplierId:  z.number().int().positive().optional().nullable(),
  warehouseId: z.number().int().positive('warehouseId là bắt buộc'),
  note:        z.string().max(1000).optional(),
  items:       z.array(OrderItemSchema).min(1, 'Phiếu nhập phải có ít nhất 1 dòng hàng'),
});

const CreateExportOrderSchema = z.object({
  warehouseId:   z.number().int().positive('warehouseId là bắt buộc'),
  requisitionId: z.number().int().positive().optional().nullable(),
  note:          z.string().max(1000).optional(),
  items:         z.array(OrderItemSchema.omit({ unitPrice: true })).min(1),
});

const UpdateImportOrderSchema = CreateImportOrderSchema.partial().extend({
  items: z.array(OrderItemSchema).min(1).optional()
});

const UpdateExportOrderSchema = CreateExportOrderSchema.partial().extend({
  items: z.array(OrderItemSchema.omit({ unitPrice: true })).min(1).optional()
});

module.exports = {
  CreateImportOrderSchema,
  CreateExportOrderSchema,
  UpdateImportOrderSchema,
  UpdateExportOrderSchema,
};

