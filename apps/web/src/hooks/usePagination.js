/**
 * usePagination.js — Unified 1-based pagination hook (fix GAP-06).
 *
 * Usage:
 *   const { page, limit, setPage, setLimit, paginationProps } = usePagination();
 *
 * Renders:
 *   <PaginationBar {...paginationProps} total={total} />
 */
import { useState, useCallback } from 'react';

export function usePagination({ defaultPage = 1, defaultLimit = 20 } = {}) {
  const [page,  setPage]  = useState(defaultPage);
  const [limit, setLimit] = useState(defaultLimit);

  const goToPage = useCallback((p) => {
    setPage(Math.max(1, p));
  }, []);

  const reset = useCallback(() => {
    setPage(1);
  }, []);

  return {
    page,
    limit,
    setPage: goToPage,
    setLimit: (l) => { setLimit(l); setPage(1); },
    reset,
    // Query params to pass to API calls
    queryParams: { page, limit },
  };
}

export default usePagination;
