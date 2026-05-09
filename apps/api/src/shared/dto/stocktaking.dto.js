'use strict';
const { z } = require('zod');

/**
 * [BUG-NEW-05] DTO validation for Stocktaking
 */
const CreateStocktakingSessionSchema = z.object({
  warehouseId: z.number().int().positive('Mã kho không hợp lệ'),
  note: z.string().optional().nullable(),
  productIds: z.array(z.number().int().positive()).optional().nullable(),
});

const InputStocktakingResultsSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    actualQty: z.number().min(0, 'Số lượng thực tế không được âm'),
    note: z.string().optional().nullable(),
  })).min(1, 'Phải có ít nhất 1 sản phẩm cập nhật'),
});

module.exports = { 
  CreateStocktakingSessionSchema,
  InputStocktakingResultsSchema 
};
