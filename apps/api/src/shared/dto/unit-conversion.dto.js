'use strict';
const { z } = require('zod');

const UnitConversionSchema = z.object({
  fromUnitId: z.number().int().positive(),
  toUnitId: z.number().int().positive(),
  ratio: z.number().positive(),
  note: z.string().max(255).optional().nullable()
}).refine(data => data.fromUnitId !== data.toUnitId, {
  message: "fromUnitId and toUnitId must be different",
  path: ["toUnitId"]
});

const UpdateUnitConversionSchema = z.object({
  ratio: z.number().positive().optional(),
  note: z.string().max(255).optional().nullable()
});

module.exports = {
  UnitConversionSchema,
  UpdateUnitConversionSchema
};
