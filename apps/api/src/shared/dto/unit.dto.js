'use strict';
const { z } = require('zod');

const CreateUnitSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Tên đơn vị không được trống').max(50),
    description: z.string().optional().nullable(),
  }),
});

module.exports = { CreateUnitSchema };
