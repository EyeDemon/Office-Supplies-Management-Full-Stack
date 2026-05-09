'use strict';
const { z } = require('zod');

/**
 * notification.dto.js — Validation schemas for Notification module.
 * Spec VI.1: DTO implementation for controller mutations.
 */

const ClearReadSchema = z.object({
  days: z.preprocess((v) => parseInt(v, 10), z.number().min(1).max(365)).optional().default(30),
});

const MarkReadSchema = z.object({
  id: z.preprocess((v) => parseInt(v, 10), z.number().int().positive()),
});

module.exports = {
  ClearReadSchema,
  MarkReadSchema,
};
