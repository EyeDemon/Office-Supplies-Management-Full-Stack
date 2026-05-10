'use strict';

/**
 * buildSafeWhere - Helper xây dựng WHERE clause an toàn (SEC-H2)
 * @param {Object} filters - Dữ liệu từ req.query
 * @param {Object} allowedFields - Mapping { queryKey: { field: 'db.field', operator: '=', transform: v => v } }
 * @returns { { w: string, params: any[] } }
 */
function buildSafeWhere(filters, allowedFields) {
  const where = [];
  const params = [];

  for (const [key, config] of Object.entries(allowedFields)) {
    const value = filters[key];
    if (value === undefined || value === null || value === '') continue;

    const { field, operator = '=', transform } = config;
    const finalValue = transform ? transform(value) : value;

    if (operator.toUpperCase() === 'LIKE') {
      where.push(`${field} LIKE ?`);
      params.push(`%${finalValue}%`);
    } else if (operator.toUpperCase() === 'IN') {
      if (Array.isArray(finalValue) && finalValue.length > 0) {
        where.push(`${field} IN (${finalValue.map(() => '?').join(',')})`);
        params.push(...finalValue);
      }
    } else {
      where.push(`${field} ${operator} ?`);
      params.push(finalValue);
    }
  }

  return {
    w: where.length ? 'WHERE ' + where.join(' AND ') : '',
    params
  };
}

module.exports = { buildSafeWhere };
