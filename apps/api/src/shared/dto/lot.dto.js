'use strict';
const { z } = require('zod');

const CreateLotSchema = z.object({
  body: z.object({
    productId: z.number().int().positive('ID Sản phẩm không hợp lệ'),
    batchCode: z.string().min(1, 'Mã lô là bắt buộc').max(50, 'Mã lô quá dài'),
    expiryDate: z.string().optional().nullable(),
    quantityIn: z.number().int().min(0).optional().default(0),
    note: z.string().optional().nullable(),
  }),
});

const UpdateLotSchema = z.object({
  body: z.object({
    expiryDate: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
  }),
});

module.exports = { CreateLotSchema, UpdateLotSchema };
