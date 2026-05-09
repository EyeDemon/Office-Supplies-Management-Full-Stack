import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  PR_STATUS_LABEL, PR_STATUS_COLOR,
  PO_STATUS_LABEL, PO_STATUS_COLOR,
  PRIORITY_LABEL, PRIORITY_COLOR,
  fmtDate, fmtNum, fmtMoney,
  StatusBadge,
} from './ProcurementHelpers.jsx';

describe('ProcurementHelpers', () => {
  describe('Status Label Maps', () => {
    it('PR_STATUS_LABEL has all statuses', () => {
      expect(PR_STATUS_LABEL.PENDING).toBe('Chờ duyệt');
      expect(PR_STATUS_LABEL.APPROVED).toBe('Đã duyệt');
      expect(PR_STATUS_LABEL.REJECTED).toBe('Từ chối');
      expect(PR_STATUS_LABEL.CANCELLED).toBe('Đã huỷ');
      expect(PR_STATUS_LABEL.PO_CREATED).toBe('Đã tạo PO');
    });

    it('PO_STATUS_LABEL has all statuses', () => {
      expect(PO_STATUS_LABEL.DRAFT).toBe('Bản nháp');
      expect(PO_STATUS_LABEL.CONFIRMED).toBe('Đã xác nhận');
      expect(PO_STATUS_LABEL.RECEIVED).toBe('Đã nhận hàng');
      expect(PO_STATUS_LABEL.CANCELLED).toBe('Đã huỷ');
    });

    it('PRIORITY_LABEL has all 4 levels', () => {
      expect(PRIORITY_LABEL.LOW).toBe('Thấp');
      expect(PRIORITY_LABEL.MEDIUM).toBe('Trung bình');
      expect(PRIORITY_LABEL.HIGH).toBe('Cao');
      expect(PRIORITY_LABEL.URGENT).toBe('Khẩn');
    });
  });

  describe('Color Maps', () => {
    it('PRIORITY_COLOR.URGENT is danger red', () => {
      expect(PRIORITY_COLOR.URGENT).toBe('#ef4444');
    });

    it('PR_STATUS_COLOR.APPROVED is blue', () => {
      expect(PR_STATUS_COLOR.APPROVED).toBe('#3b82f6');
    });

    it('PO_STATUS_COLOR.RECEIVED is green', () => {
      expect(PO_STATUS_COLOR.RECEIVED).toBe('#10b981');
    });
  });

  describe('fmtDate()', () => {
    it('formats ISO date to vi-VN string', () => {
      const result = fmtDate('2026-05-01');
      expect(typeof result).toBe('string');
      expect(result).not.toBe('—');
      // Vietnamese date format: 1/5/2026 or 01/05/2026
      expect(result).toContain('2026');
    });

    it('returns "—" for null', () => {
      expect(fmtDate(null)).toBe('—');
    });

    it('returns "—" for empty string', () => {
      expect(fmtDate('')).toBe('—');
    });

    it('returns "—" for undefined', () => {
      expect(fmtDate(undefined)).toBe('—');
    });
  });

  describe('fmtNum()', () => {
    it('formats large number with locale separators', () => {
      const result = fmtNum(1000000);
      expect(typeof result).toBe('string');
      expect(result).toContain('1');
    });

    it('handles null as 0', () => {
      expect(fmtNum(null)).toBe('0');
    });

    it('handles undefined as 0', () => {
      expect(fmtNum(undefined)).toBe('0');
    });

    it('handles string number input', () => {
      const result = fmtNum('5000');
      expect(result).toBeTruthy();
    });
  });

  describe('fmtMoney()', () => {
    it('appends ₫ symbol', () => {
      const result = fmtMoney(500000);
      expect(result).toContain('₫');
    });

    it('handles zero correctly', () => {
      const result = fmtMoney(0);
      expect(result).toBe('0 ₫');
    });

    it('handles null as 0₫', () => {
      expect(fmtMoney(null)).toBe('0 ₫');
    });
  });

  describe('StatusBadge component', () => {
    it('renders correct label from map', () => {
      render(
        <StatusBadge s="PENDING" map={PR_STATUS_LABEL} colors={PR_STATUS_COLOR} />
      );
      expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    });

    it('falls back to raw status key if not in map', () => {
      render(
        <StatusBadge s="UNKNOWN_STATUS" map={PR_STATUS_LABEL} colors={PR_STATUS_COLOR} />
      );
      expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument();
    });

    it('applies color style from colors map', () => {
      const { container } = render(
        <StatusBadge s="APPROVED" map={PR_STATUS_LABEL} colors={PR_STATUS_COLOR} />
      );
      const badge = container.querySelector('span');
      expect(badge).toHaveStyle({ color: '#3b82f6' });
    });

    it('uses fallback gray (#6b7280) for unknown status', () => {
      const { container } = render(
        <StatusBadge s="UNKNOWN" map={PR_STATUS_LABEL} colors={PR_STATUS_COLOR} />
      );
      const badge = container.querySelector('span');
      expect(badge).toHaveStyle({ color: '#6b7280' });
    });
  });
});
