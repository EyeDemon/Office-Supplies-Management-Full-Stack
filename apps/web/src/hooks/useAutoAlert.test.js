import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useAutoAlert from './useAutoAlert';

describe('useAutoAlert Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Factory Mode (no params)', () => {
    it('should initialize with null state', () => {
      const { result } = renderHook(() => useAutoAlert());
      const [alert, setAlert] = result.current;
      expect(alert).toBeNull();
      expect(typeof setAlert).toBe('function');
    });

    it('should set error alert and NOT auto-dismiss', () => {
      const { result } = renderHook(() => useAutoAlert(undefined, undefined, 4000));
      
      act(() => {
        result.current[1]('error', 'Something went wrong');
      });

      expect(result.current[0]).toEqual({ type: 'error', message: 'Something went wrong' });

      // Fast forward time past delay
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Still there because it's an error
      expect(result.current[0]).toEqual({ type: 'error', message: 'Something went wrong' });
    });

    it('should set success alert and auto-dismiss after delay', () => {
      const { result } = renderHook(() => useAutoAlert(undefined, undefined, 3000));
      
      act(() => {
        result.current[1]('success', 'Operation successful');
      });

      expect(result.current[0]).toEqual({ type: 'success', message: 'Operation successful' });

      // Fast forward time slightly
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      // Should still be there
      expect(result.current[0]).toEqual({ type: 'success', message: 'Operation successful' });

      // Fast forward past 3000ms
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      
      // Should be dismissed
      expect(result.current[0]).toBeNull();
    });
  });

  describe('Side-effect Mode (with msg and setMsg params)', () => {
    it('should auto-dismiss success message', () => {
      const setMsg = vi.fn();
      const msg = { type: 'success', text: 'Operation successful' };
      
      // Initially render with the success message
      const { rerender } = renderHook(
        ({ currentMsg }) => useAutoAlert(currentMsg, setMsg, 4000),
        { initialProps: { currentMsg: msg } }
      );

      // Fast forward
      act(() => {
        vi.advanceTimersByTime(4500);
      });

      expect(setMsg).toHaveBeenCalledWith({ type: '', text: '' });
    });

    it('should NOT auto-dismiss error message', () => {
      const setMsg = vi.fn();
      const msg = { type: 'error', text: 'Operation failed' };
      
      renderHook(() => useAutoAlert(msg, setMsg, 4000));

      act(() => {
        vi.advanceTimersByTime(4500);
      });

      expect(setMsg).not.toHaveBeenCalled();
    });
  });
});
