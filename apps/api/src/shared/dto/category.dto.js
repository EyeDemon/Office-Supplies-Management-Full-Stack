'use strict';
const { z } = require('zod');

const CreateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Tên phải có ít nhất 2 ký tự').max(100, 'Tên quá dài (tối đa 100 ký tự)'),
    description: z.string().optional().nullable(),
  }),
});

const UpdateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Tên phải có ít nhất 2 ký tự').max(100, 'Tên quá dài (tối đa 100 ký tự)').optional(),
    description: z.string().optional().nullable(),
  }),
});

module.exports = {
  CreateCategorySchema,
  UpdateCategorySchema,
};
