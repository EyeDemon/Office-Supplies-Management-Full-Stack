'use strict';
const { z } = require('zod');

const AdjustmentSchema = z.object({
  warehouseId: z.number().int().positive('Mã kho không hợp lệ'),
  productId: z.number().int().positive('Mã sản phẩm không hợp lệ'),
  newQuantity: z.number().int().min(0, 'Số lượng mới không được âm'),
  reason: z.string().min(5, 'Lý do điều chỉnh phải có ít nhất 5 ký tự'),
  note: z.string().optional().nullable(),
  locationId: z.number().int().positive().optional().nullable(),
});

module.exports = { AdjustmentSchema };
