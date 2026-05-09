// components/common/SkeletonRow.jsx — Skeleton loading thay thế Spinner
// Spec V (UX): "Skeleton thay spinner ở MỌI NƠI"
// Usage:
//   <SkeletonRow cols={5} rows={5} />                        // basic table skeleton
//   <SkeletonTable headers={['Mã', 'Tên', 'SL']} rows={4} /> // with headers
//   <SkeletonCard />                                          // card skeleton
//   <SkeletonText lines={3} />                               // text block skeleton
import React from 'react';

// ── CSS Animation (inject once) ───────────────────────────────────
const STYLE_ID = 'skeleton-style';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes skeleton-shimmer {
      0%   { background-position: -200px 0; }
      100% { background-position: calc(200px + 100%) 0; }
    }
    .skeleton-bar {
      display: inline-block;
      background: linear-gradient(90deg, #e8e8e8 25%, #f4f4f4 50%, #e8e8e8 75%);
      background-size: 200px 100%;
      animation: skeleton-shimmer 1.5s ease-in-out infinite;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
}

// ── Primitives ────────────────────────────────────────────────────
/** Một thanh skeleton ngang */
export function SkeletonBar({ width = '100%', height = 14, className = '' }) {
  return (
    <span
      className={`skeleton-bar ${className}`}
      style={{ width, height: typeof height === 'number' ? `${height}px` : height, display: 'block' }}
    />
  );
}

// ── Table Skeletons ───────────────────────────────────────────────
/**
 * SkeletonRow — một dòng bảng với N cột skeleton
 * @param {number} cols  - số cột
 * @param {number[]} widths - [optional] phần trăm độ rộng của từng cột
 */
export function SkeletonRow({ cols = 5, widths }) {
  return (
    <tr>
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} style={{ verticalAlign: 'middle', padding: '10px 12px' }}>
          <SkeletonBar width={widths?.[i] ? `${widths[i]}%` : (i === 0 ? '60%' : i === cols - 1 ? '40%' : '80%')} />
        </td>
      ))}
    </tr>
  );
}

/**
 * SkeletonTable — bảng đầy đủ với header + N dòng skeleton
 * @param {string[]} headers - tiêu đề cột
 * @param {number} rows      - số dòng skeleton
 */
export function SkeletonTable({ headers = [], rows = 5, cols }) {
  const colCount = cols || headers.length || 5;
  return (
    <table className="table table-hover mb-0" style={{ fontSize: '.85rem' }}>
      {headers.length > 0 && (
        <thead className="table-light">
          <tr>{headers.map((h, i) => <th key={i} style={{ fontWeight: 600 }}>{h}</th>)}</tr>
        </thead>
      )}
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} cols={colCount} />
        ))}
      </tbody>
    </table>
  );
}

// ── Card Skeleton ─────────────────────────────────────────────────
/** Dashboard card skeleton */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card shadow-sm ${className}`} style={{ borderRadius: 8 }}>
      <div className="card-body p-3">
        <SkeletonBar width="40%" height={12} className="mb-2" />
        <SkeletonBar width="60%" height={28} className="mb-1" />
        <SkeletonBar width="50%" height={11} />
      </div>
    </div>
  );
}

// ── Text Skeleton ─────────────────────────────────────────────────
/** Block văn bản skeleton */
export function SkeletonText({ lines = 3 }) {
  return (
    <div>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBar
          key={i}
          width={i === lines - 1 ? '60%' : `${80 + Math.random() * 15 | 0}%`}
          height={14}
          className="mb-2"
        />
      ))}
    </div>
  );
}

// ── Default export: convenience wrapper ──────────────────────────
export default SkeletonRow;