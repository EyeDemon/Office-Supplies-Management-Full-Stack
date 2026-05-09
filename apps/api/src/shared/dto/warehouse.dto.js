'use strict';
const { z } = require('zod');

const CreateWarehouseSchema = z.object({
  body: z.object({
    code: z.string().min(2, 'Mã kho phải từ 2 ký tự').max(50),
    name: z.string().min(2, 'Tên kho phải từ 2 ký tự').max(255),
    address: z.string().optional().nullable(),
    manager_id: z.number().int().positive('ID quản lý không hợp lệ').optional().nullable(),
    is_active: z.boolean().default(true),
  }),
});

const UpdateWarehouseSchema = z.object({
  body: z.object({
    code: z.string().min(2).max(50).optional(),
    name: z.string().min(2).max(255).optional(),
    address: z.string().optional().nullable(),
    manager_id: z.number().int().positive().optional().nullable(),
    is_active: z.boolean().optional(),
  }),
});

module.exports = {
  CreateWarehouseSchema,
  UpdateWarehouseSchema,
};
