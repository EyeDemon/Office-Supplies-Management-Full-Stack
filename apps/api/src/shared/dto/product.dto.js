'use strict';
/**
 * product.dto.js — Zod schemas cho Product CRUD
 * Spec VI.1 (DTO Layer): Validate tại Controller layer, từ chối payload không đúng schema.
 */
const { z } = require('zod');

const VALID_UNITS = ['CAI', 'HOP', 'GOI', 'CUON', 'BO', 'TUP', 'LOC', 'KG', 'MET', 'TO'];

/** POST /api/products — Tạo sản phẩm mới */
const CreateProductSchema = z.object({
  sku:          z.string().trim().min(1, 'Mã SKU là bắt buộc').max(50, 'SKU tối đa 50 ký tự'),
  name:         z.string().trim().min(1, 'Tên sản phẩm là bắt buộc').max(200, 'Tên tối đa 200 ký tự'),
  categoryId:   z.number().int().positive('categoryId phải là số nguyên dương'),
  unit:         z.enum(VALID_UNITS, { errorMap: () => ({ message: `Đơn vị phải là một trong: ${VALID_UNITS.join(', ')}` }) }).default('CAI'),
  price:        z.number().min(0, 'Đơn giá không được âm').default(0),
  minStockQty:  z.number().int().min(0, 'Tồn tối thiểu không được âm').default(0),
  description:  z.string().max(1000).optional().nullable(),
  barcode:      z.string().trim().max(100).optional().nullable(),
  baseUnitId:   z.number().int().positive().optional().nullable(),
  reorderPoint: z.number().int().min(0).optional().nullable(),
});

/** PUT /api/products/:id — Cập nhật sản phẩm (không cho đổi SKU) */
const UpdateProductSchema = z.object({
  name:         z.string().trim().min(1, 'Tên sản phẩm là bắt buộc').max(200, 'Tên tối đa 200 ký tự'),
  categoryId:   z.number().int().positive('categoryId phải là số nguyên dương'),
  unit:         z.enum(VALID_UNITS, { errorMap: () => ({ message: `Đơn vị phải là một trong: ${VALID_UNITS.join(', ')}` }) }).optional(),
  price:        z.number().min(0, 'Đơn giá không được âm').default(0),
  minStockQty:  z.number().int().min(0, 'Tồn tối thiểu không được âm').default(0),
  description:  z.string().max(1000).optional().nullable(),
  barcode:      z.string().trim().max(100).optional().nullable(),
  baseUnitId:   z.number().int().positive().optional().nullable(),
  reorderPoint: z.number().int().min(0).optional().nullable(),
});

/** GET /api/products — Query params */
const ListProductQuerySchema = z.object({
  page:        z.coerce.number().int().min(1).default(1),
  size:        z.coerce.number().int().min(1).max(100).default(20),
  search:      z.string().max(200).optional(),
  categoryId:  z.coerce.number().int().positive().optional(),
  lowStock:    z.enum(['true', 'false', '1', '0']).optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
});

module.exports = {
  CreateProductSchema,
  UpdateProductSchema,
  ListProductQuerySchema,
};
