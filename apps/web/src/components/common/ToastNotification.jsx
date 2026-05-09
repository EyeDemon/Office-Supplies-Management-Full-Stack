// components/common/ToastNotification.jsx — Toast + Undo Pattern
// Spec V (UX): "Undo thay Modal" — toast 5s + [Hoàn tác] button
// Spec III: Non-blocking UX — toast không block workflow như modal
//
// Usage:
//   import { useToast, ToastContainer } from './ToastNotification';
//
//   function MyPage() {
//     const { toasts, showToast, showUndoToast } = useToast();
//
//     const handleReject = async (id) => {
//       await requisitionAPI.reject(id);
//       showUndoToast('Đã từ chối phiếu YC-001', async () => {
//         // undo logic...
//       });
//     };
//
//     return (
//       <>
//         <ToastContainer toasts={toasts} />
//         ...
//       </>
//     );
//   }
import React, { useState, useCallback, useRef } from 'react';
import { Toast, ToastContainer as BSToastContainer } from 'react-bootstrap';

// ── Toast Item component ─────────────────────────────────────────
function ToastItem({ toast, onDismiss }) {
  const { id, message, variant, undoLabel, onUndo, duration } = toast;
  const [isUndoing, setUndoing] = useState(false);
  const [visible, setVisible] = useState(true);

  const handleUndo = async () => {
    if (!onUndo || isUndoing) return;
    setUndoing(true);
    try {
      await onUndo();
      onDismiss(id);
    } catch (err) {
      setUndoing(false);
      console.error('[ToastItem/undo]', err);
    }
  };

  const bgColors = {
    success: '#198754',
    danger:  '#dc3545',
    warning: '#ffc107',
    info:    '#0dcaf0',
    primary: '#0d6efd',
  };
  const bg = bgColors[variant] || bgColors.success;

  return (
    <Toast
      show={visible}
      autohide
      delay={duration || 5000}
      onClose={() => { setVisible(false); setTimeout(() => onDismiss(id), 300); }}
      style={{ minWidth: 280 }}
    >
      <Toast.Header style={{ background: bg, color: '#fff' }} closeVariant="white">
        <strong className="me-auto" style={{ fontSize: '.85rem' }}>
          {variant === 'success' ? '✅' : variant === 'danger' ? '❌' : variant === 'warning' ? '⚠️' : 'ℹ️'}
          {' '}{variant === 'success' ? 'Thành công' : variant === 'danger' ? 'Lỗi' : 'Thông báo'}
        </strong>
      </Toast.Header>
      <Toast.Body style={{ fontSize: '.85rem', padding: '8px 12px' }}>
        <div className="d-flex justify-content-between align-items-center gap-2">
          <span>{message}</span>
          {onUndo && (
            <button
              className="btn btn-link btn-sm p-0 text-primary text-nowrap"
              style={{ fontSize: '.8rem', textDecoration: 'underline', fontWeight: 600 }}
              onClick={handleUndo}
              disabled={isUndoing}
            >
              {isUndoing ? '...' : (undoLabel || 'Hoàn tác')}
            </button>
          )}
        </div>
      </Toast.Body>
    </Toast>
  );
}

// ── ToastContainer component ─────────────────────────────────────
export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <BSToastContainer
      position="bottom-end"
      className="p-3"
      style={{ zIndex: 9999, position: 'fixed' }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </BSToastContainer>
  );
}

// ── useToast hook ─────────────────────────────────────────────────
let _toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /**
   * showToast(message, options)
   * @param {string} message
   * @param {{ variant, duration }} options
   */
  const showToast = useCallback((message, options = {}) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, variant: 'success', duration: 4000, ...options }]);
    return id;
  }, []);

  /**
   * showUndoToast(message, onUndo, options)
   * @param {string} message    - "Đã từ chối phiếu YC-001"
   * @param {Function} onUndo   - async function để rollback
   * @param {object} options    - { variant, duration, undoLabel }
   */
  const showUndoToast = useCallback((message, onUndo, options = {}) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, {
      id,
      message,
      variant: options.variant || 'success',
      duration: options.duration || 6000,
      undoLabel: options.undoLabel || 'Hoàn tác',
      onUndo,
    }]);
    return id;
  }, []);

  /**
   * showErrorToast(message)
   */
  const showErrorToast = useCallback((message) => {
    return showToast(message, { variant: 'danger', duration: 5000 });
  }, [showToast]);

  return { toasts, dismiss, showToast, showUndoToast, showErrorToast };
}

export default useToast;