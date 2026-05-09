import { describe, it, expect, vi } from 'vitest';
import { ACTION_MAP, ENTITY_LABELS, today, fmt } from './AuditLogHelpers.jsx';

describe('AuditLogHelpers', () => {
  describe('ACTION_MAP', () => {
    it('APPROVE → label Duyệt, cls badge-success', () => {
      expect(ACTION_MAP.APPROVE.label).toBe('Duyệt');
      expect(ACTION_MAP.APPROVE.cls).toBe('badge-success');
    });

    it('REJECT → label Từ chối, cls badge-danger', () => {
      expect(ACTION_MAP.REJECT.label).toBe('Từ chối');
      expect(ACTION_MAP.REJECT.cls).toBe('badge-danger');
    });

    it('CREATE → label Tạo mới', () => {
      expect(ACTION_MAP.CREATE.label).toBe('Tạo mới');
    });

    it('CANCEL → label Huỷ', () => {
      expect(ACTION_MAP.CANCEL.label).toBe('Huỷ');
    });

    it('COMPLETE → badge-success', () => {
      expect(ACTION_MAP.COMPLETE.cls).toBe('badge-success');
    });
  });

  describe('ENTITY_LABELS', () => {
    it('maps import_order → Phiếu nhập', () => {
      expect(ENTITY_LABELS.import_order).toBe('Phiếu nhập');
    });

    it('maps export_order → Phiếu xuất', () => {
      expect(ENTITY_LABELS.export_order).toBe('Phiếu xuất');
    });

    it('maps requisition → Cấp phát', () => {
      expect(ENTITY_LABELS.requisition).toBe('Cấp phát');
    });

    it('maps product → Sản phẩm', () => {
      expect(ENTITY_LABELS.product).toBe('Sản phẩm');
    });

    it('maps user → Người dùng', () => {
      expect(ENTITY_LABELS.user).toBe('Người dùng');
    });

    it('maps stocktaking → Kiểm kê', () => {
      expect(ENTITY_LABELS.stocktaking).toBe('Kiểm kê');
    });
  });

  describe('today()', () => {
    it('returns YYYY-MM-DD format', () => {
      const result = today();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('matches current date', () => {
      const expected = new Date().toISOString().slice(0, 10);
      expect(today()).toBe(expected);
    });
  });

  describe('fmt()', () => {
    it('returns "—" for null', () => {
      expect(fmt(null)).toBe('—');
    });

    it('returns "—" for undefined', () => {
      expect(fmt(undefined)).toBe('—');
    });

    it('returns "—" for empty string', () => {
      expect(fmt('')).toBe('—');
    });

    it('formats a valid date string to locale string', () => {
      const result = fmt('2026-05-01T10:00:00Z');
      expect(typeof result).toBe('string');
      expect(result).not.toBe('—');
      // Vietnamese locale uses '/' separators
      expect(result.length).toBeGreaterThan(5);
    });
  });
});
