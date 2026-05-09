'use strict';
const { z } = require('zod');

const CreateSupplierSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Tên nhà cung cấp phải có ít nhất 2 ký tự').max(200, 'Tên quá dài'),
    contactName: z.string().optional().nullable(),
    phone: z.string().regex(/^(0|\+84)[0-9]{8,10}$/, 'Số điện thoại không hợp lệ').optional().nullable(),
    email: z.string().email('Email không đúng định dạng').optional().nullable(),
    address: z.string().optional().nullable(),
    taxCode: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
  }),
});

const UpdateSupplierSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(200),
    contactName: z.string().optional().nullable(),
    phone: z.string().regex(/^(0|\+84)[0-9]{8,10}$/).optional().nullable(),
    email: z.string().email().optional().nullable(),
    address: z.string().optional().nullable(),
    taxCode: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
    active: z.boolean().optional(),
  }),
});

module.exports = { CreateSupplierSchema, UpdateSupplierSchema };
