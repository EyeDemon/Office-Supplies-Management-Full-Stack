import { describe, it, expect, vi } from 'vitest';
import { formatVND, today, downloadBlob } from './reportHelpers';

describe('Report Helpers', () => {
  describe('formatVND', () => {
    it('should format falsy values to 0đ', () => {
      expect(formatVND(null)).toBe('0đ');
      expect(formatVND(0)).toBe('0đ');
      expect(formatVND(undefined)).toBe('0đ');
    });

    it('should format values under 1000 properly', () => {
      expect(formatVND(500)).toBe('500đ');
    });

    it('should format values in thousands (k)', () => {
      expect(formatVND(1000)).toBe('1k');
      expect(formatVND(5500)).toBe('6k'); // Math.round
      expect(formatVND(500000)).toBe('500k');
    });

    it('should format values in millions (tr)', () => {
      expect(formatVND(1000000)).toBe('1 tr');
      expect(formatVND(1500000)).toBe('1.5 tr');
      expect(formatVND(900000000)).toBe('900 tr');
    });

    it('should format values in billions (tỷ)', () => {
      expect(formatVND(1000000000)).toBe('1 tỷ');
      expect(formatVND(1500000000)).toBe('1.5 tỷ');
      expect(formatVND(10000000000)).toBe('10 tỷ');
    });
  });

  describe('today', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const result = today();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      const now = new Date();
      // Ensure the generated string matches today's ISO date string prefix
      expect(result).toBe(now.toISOString().slice(0, 10));
    });
  });

  describe('downloadBlob', () => {
    it('should trigger download', () => {
      // Mock DOM methods
      const createObjectURLMock = vi.fn(() => 'blob:url');
      const revokeObjectURLMock = vi.fn();
      global.URL.createObjectURL = createObjectURLMock;
      global.URL.revokeObjectURL = revokeObjectURLMock;

      const clickMock = vi.fn();
      const mockElement = { click: clickMock, href: '', download: '' };
      
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn(() => mockElement);

      downloadBlob('mock-data', 'test.csv');

      expect(createObjectURLMock).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockElement.download).toBe('test.csv');
      expect(mockElement.href).toBe('blob:url');
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:url');

      // Restore
      document.createElement = originalCreateElement;
    });
  });
});
