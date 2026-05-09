import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { usePagination } from './usePagination';

describe('usePagination Hook', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => usePagination());
    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(20);
    expect(result.current.queryParams).toEqual({ page: 1, limit: 20 });
  });

  it('should initialize with custom values', () => {
    const { result } = renderHook(() => usePagination({ defaultPage: 2, defaultLimit: 50 }));
    expect(result.current.page).toBe(2);
    expect(result.current.limit).toBe(50);
  });

  it('should update page and enforce minimum page 1', () => {
    const { result } = renderHook(() => usePagination());

    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.page).toBe(3);

    act(() => {
      result.current.setPage(0);
    });
    // Should clamp to 1
    expect(result.current.page).toBe(1);

    act(() => {
      result.current.setPage(-5);
    });
    // Should clamp to 1
    expect(result.current.page).toBe(1);
  });

  it('should update limit and reset page to 1', () => {
    const { result } = renderHook(() => usePagination({ defaultPage: 3, defaultLimit: 20 }));
    
    act(() => {
      result.current.setLimit(100);
    });

    expect(result.current.limit).toBe(100);
    // Page must reset to 1
    expect(result.current.page).toBe(1);
  });

  it('should reset page to 1 when reset is called', () => {
    const { result } = renderHook(() => usePagination({ defaultPage: 5, defaultLimit: 20 }));
    
    act(() => {
      result.current.reset();
    });

    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(20); // Limit stays the same
  });
});
