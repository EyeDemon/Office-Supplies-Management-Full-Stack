import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SkeletonRow, SkeletonTable, SkeletonCard, SkeletonText, SkeletonBar } from './SkeletonRow';

describe('Skeleton Components', () => {
  describe('SkeletonBar', () => {
    it('should render with default styles', () => {
      const { container } = render(<SkeletonBar />);
      const span = container.querySelector('span.skeleton-bar');
      expect(span).toBeInTheDocument();
      expect(span).toHaveStyle('width: 100%');
      expect(span).toHaveStyle('height: 14px');
    });

    it('should render with custom width and height', () => {
      const { container } = render(<SkeletonBar width="50%" height={20} className="custom-class" />);
      const span = container.querySelector('span.skeleton-bar');
      expect(span).toHaveClass('custom-class');
      expect(span).toHaveStyle('width: 50%');
      expect(span).toHaveStyle('height: 20px');
    });
  });

  describe('SkeletonRow', () => {
    it('should render correct number of columns', () => {
      const { container } = render(
        <table>
          <tbody>
            <SkeletonRow cols={3} />
          </tbody>
        </table>
      );
      const tds = container.querySelectorAll('td');
      expect(tds.length).toBe(3);
    });
  });

  describe('SkeletonTable', () => {
    it('should render headers and correct number of rows', () => {
      render(<SkeletonTable headers={['ID', 'Name']} rows={2} />);

      expect(screen.getByText('ID')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();

      // headers.length is 2, rows is 2 -> total trs should be 1 (thead) + 2 (tbody) = 3
      const theadTr = document.querySelectorAll('thead tr');
      expect(theadTr.length).toBe(1);

      const tbodyTr = document.querySelectorAll('tbody tr');
      expect(tbodyTr.length).toBe(2);

      // Each row should have 2 columns
      const firstRowTds = tbodyTr[0].querySelectorAll('td');
      expect(firstRowTds.length).toBe(2);
    });

    it('should default to 5 cols if no headers provided', () => {
      render(<SkeletonTable rows={1} />);
      const tds = document.querySelectorAll('td');
      expect(tds.length).toBe(5);
    });
  });

  describe('SkeletonCard', () => {
    it('should render card layout', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.querySelector('.card.shadow-sm');
      expect(card).toBeInTheDocument();

      // Should have 3 skeleton bars inside
      const bars = container.querySelectorAll('.skeleton-bar');
      expect(bars.length).toBe(3);
    });
  });

  describe('SkeletonText', () => {
    it('should render correct number of lines', () => {
      const { container } = render(<SkeletonText lines={4} />);
      const bars = container.querySelectorAll('.skeleton-bar');
      expect(bars.length).toBe(4);
    });
  });
});
