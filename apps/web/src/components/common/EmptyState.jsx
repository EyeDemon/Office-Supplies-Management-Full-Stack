// components/common/EmptyState.jsx — [FE-06] Empty State nhất quán
// Spec V (UX): "Empty state có CTA" — mỗi trang empty cần icon + message + action button
//
// Usage:
//   <EmptyState message="Chưa có phiếu nào" />
//   <EmptyState icon="📦" message="Chưa có tồn kho" sub="Tạo phiếu nhập để bắt đầu" />
//   <EmptyState message="Chưa có yêu cầu" cta="+ Tạo yêu cầu" onCta={() => setShowForm(true)} />
//   <EmptyState message="Không tìm thấy kết quả" icon="🔍" />
import React from 'react';

const ICON_MAP = {
  default:    '📭',
  inventory:  '📦',
  request:    '📋',
  purchase:   '🛒',
  transfer:   '🔄',
  report:     '📊',
  user:       '👤',
  warehouse:  '🏭',
  search:     '🔍',
  ok:         '✅',
  error:      '❌',
  import:     '📥',   // [BUG-EMPTY-STATE-02] phiếu nhập kho
  export:     '📤',   // phiếu xuất kho
  lot:        '🏷️',   // quản lý lô hàng
  adjustment: '⚖️',   // điều chỉnh tồn kho
  supplier:   '🏢',   // nhà cung cấp
  category:   '🗂️',   // danh mục
  audit:      '📜',   // audit log
  notification: '🔔', // thông báo
};

/**
 * EmptyState — component thống nhất cho trạng thái rỗng
 *
 * @param {string}   icon     - emoji hoặc key từ ICON_MAP (default: 'default')
 * @param {string}   message  - tiêu đề chính
 * @param {string}   sub      - mô tả phụ (optional)
 * @param {string}   cta      - label nút hành động (optional)
 * @param {Function} onCta    - onClick cho nút hành động
 * @param {string}   ctaVariant - 'primary' | 'secondary' (default: 'primary')
 * @param {object}   style    - override style container
 */
export default function EmptyState({
  icon = 'default',
  message,
  sub,
  cta,
  onCta,
  ctaVariant = 'primary',
  style = {},
}) {
  const resolvedIcon = ICON_MAP[icon] ?? icon; // nếu truyền emoji trực tiếp, dùng luôn

  const btnClass = ctaVariant === 'primary'
    ? 'btn btn-primary btn-sm'
    : 'btn btn-sm';

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '3rem 1.5rem',
        color: 'var(--text-secondary)',
        ...style,
      }}
    >
      {/* Icon */}
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', lineHeight: 1 }}>
        {typeof resolvedIcon === 'function' ? (() => {
          const Icon = resolvedIcon;
          return <Icon size={40} />;
        })() : resolvedIcon}
      </div>

      {/* Message chính */}
      {message && (
        <p style={{
          margin: '0 0 0.35rem',
          fontWeight: 600,
          fontSize: '0.925rem',
          color: 'var(--text-primary)',
        }}>
          {message}
        </p>
      )}

      {/* Sub text */}
      {sub && (
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {sub}
        </p>
      )}

      {/* CTA button */}
      {cta && onCta && (
        <button className={btnClass} onClick={onCta} style={{ marginTop: sub ? 0 : '0.75rem' }}>
          {cta}
        </button>
      )}
    </div>
  );
}