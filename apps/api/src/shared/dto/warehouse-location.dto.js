'use strict';
const { z } = require('zod');

const CreateWarehouseLocationSchema = z.object({
  body: z.object({
    warehouseId: z.number().int().positive('ID Kho không hợp lệ'),
    code: z.string().min(1, 'Mã vị trí là bắt buộc').max(50, 'Mã vị trí quá dài'),
    name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    capacity: z.number().int().min(0).optional().nullable(),
  }),
});

const UpdateWarehouseLocationSchema = z.object({
  body: z.object({
    name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    capacity: z.number().int().min(0).optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});

module.exports = { CreateWarehouseLocationSchema, UpdateWarehouseLocationSchema };
