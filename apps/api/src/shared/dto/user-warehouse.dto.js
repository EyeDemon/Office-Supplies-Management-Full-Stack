'use strict';
const { z } = require('zod');

const AssignWarehouseSchema = z.object({
  body: z.object({
    warehouseId: z.number().int().positive('ID Kho không hợp lệ'),
  }),
});

const BulkAssignWarehouseSchema = z.object({
  body: z.object({
    warehouseIds: z.array(z.number().int().positive()).min(0, 'Danh sách kho không hợp lệ'),
  }),
});

module.exports = { AssignWarehouseSchema, BulkAssignWarehouseSchema };
