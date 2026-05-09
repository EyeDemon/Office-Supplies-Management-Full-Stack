'use strict';
const { z } = require('zod');

const TransferSchema = z.object({
  fromLocation: z.string().optional().nullable(),
  toLocation: z.string().optional().nullable(),
  fromWarehouseId: z.number().int().positive('Kho nguồn không hợp lệ'),
  toWarehouseId: z.number().int().positive('Kho đích không hợp lệ'),
  note: z.string().optional().nullable(),
  items: z.array(z.object({
    productId: z.number().int().positive('Mã sản phẩm không hợp lệ'),
    unitId: z.number().int().positive('Mã đơn vị không hợp lệ'),
    quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
  })).min(1, 'Cần ít nhất 1 sản phẩm để điều chuyển'),
}).refine(data => data.fromWarehouseId !== data.toWarehouseId, {
  message: 'Kho nguồn và kho đích không được trùng nhau',
  path: ['toWarehouseId'],
});

module.exports = { TransferSchema };
