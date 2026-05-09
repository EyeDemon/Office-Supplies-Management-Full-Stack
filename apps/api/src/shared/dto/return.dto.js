'use strict';
const { z } = require('zod');

const CreateReturnSchema = z.object({
  body: z.object({
    returnType: z.enum(['EMPLOYEE_RETURN', 'SUPPLIER_RETURN']),
    returnerName: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    supplierId: z.number().int().positive().optional().nullable(),
    warehouseId: z.number().int().positive().optional().nullable(),
    reason: z.string().min(1, 'Thiếu lý do trả hàng'),
    note: z.string().optional().nullable(),
    items: z.array(z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive(),
      conditionNote: z.string().optional().nullable()
    })).min(1, 'Phiếu trả hàng phải có ít nhất 1 sản phẩm'),
  }).refine(data => {
    if (data.returnType === 'SUPPLIER_RETURN' && !data.supplierId) {
      return false;
    }
    return true;
  }, {
    message: 'Trả về NCC cần chọn nhà cung cấp',
    path: ['supplierId']
  }),
});

const UpdateReturnSchema = z.object({
  body: z.object({
    returnerName: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    supplierId: z.number().int().positive().optional().nullable(),
    reason: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
    items: z.array(z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive(),
      conditionNote: z.string().optional().nullable()
    })).optional(),
  }),
});

module.exports = { CreateReturnSchema, UpdateReturnSchema };
