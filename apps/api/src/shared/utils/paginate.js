'use strict';
/**
 * paginate.js — Unified 1-based pagination helper (fix GAP-06).
 * API matches test spec in auth.test.js:
 *   parsePagination({ page, size }) → { page, size, offset }
 *   paginateResponse({ items, totalCount, page, size }) → { ..., totalPages, hasNext, hasPrev }
 */

/**
 * @param {object} query
 * @param {object} [opts]
 * @returns {{ page: number, size: number, offset: number }}
 */
function parsePagination(query, { defaultSize = 20, maxSize = 100 } = {}) {
  let page = parseInt(query.page  || '1',  10);
  let size = parseInt(query.size  || String(defaultSize), 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(size) || size < 1) size = defaultSize;
  if (size > maxSize) size = maxSize;

  const p = Math.max(1, page);
  const offset = (p - 1) * size;
  return { page: p, size, offset };
}

/**
 * @param {{ items: any[], totalCount: number, page: number, size: number }} opts
 * @returns {{ items: any[], total: number, page: number, size: number, totalPages: number, hasNext: boolean, hasPrev: boolean }}
 */
function paginateResponse({ items, totalCount, page, size }) {
  const totalPages = Math.ceil(totalCount / size) || 1;
  return {
    items,
    total:      totalCount,
    page,
    size,
    totalPages,
    hasNext:  page < totalPages,
    hasPrev:  page > 1,
  };
}

module.exports = { parsePagination, paginateResponse };
