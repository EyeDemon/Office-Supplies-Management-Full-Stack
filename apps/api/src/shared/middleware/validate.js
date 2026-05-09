'use strict';
const { ValidationError } = require('../../domain/errors');

/**
 * validate.js — Generic Zod validation middleware.
 * @param {import('zod').ZodSchema} schema 
 * @param {'body'|'query'|'params'} source 
 */
const validateDto = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    // Standardize error message from first Zod error
    const msg = result.error.errors[0].message;
    const field = result.error.errors[0].path.join('.');
    return next(new ValidationError(`${field ? field + ': ' : ''}${msg}`));
  }
  // Replace with parsed data (handles type coercion)
  req[source] = result.data;
  next();
};

module.exports = { validateDto };
