// ConfirmModal.jsx — M-01 FIX
// Thay thế window.confirm() (blocking, không style được) bằng React modal
// Dùng hook useConfirm() để tích hợp dễ dàng: const { confirm, ConfirmDialog } = useConfirm();
import React, { useState, useCallback } from 'react';
import { Modal, Button } from 'react-bootstrap';

// ── useConfirm hook ────────────────────────────────────────────────
// Trả về: { confirm, ConfirmDialog }
// Dùng: const ok = await confirm({ title, message, variant });
export function useConfirm() {
  const [state, setState] = useState(null);
  // state: { title, message, variant, resolve } | null

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        title:   opts.title   || 'Xác nhận',
        message: opts.message || 'Bạn có chắc muốn thực hiện thao tác này?',
        variant: opts.variant || 'primary',
        resolve,
      });
    });
  }, []);

  const handleClose = (result) => {
    state?.resolve(result);
    setState(null);
  };

  const ConfirmDialog = () => (
    <Modal show={!!state} onHide={() => handleClose(false)} centered size="sm">
      <Modal.Header closeButton className="py-2">
        <Modal.Title style={{ fontSize: '1rem' }}>{state?.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="py-3">
        <p className="mb-0" style={{ fontSize: '.9rem' }}>{state?.message}</p>
      </Modal.Body>
      <Modal.Footer className="py-2">
        <Button variant="outline-secondary" size="sm" onClick={() => handleClose(false)}>
          Huỷ
        </Button>
        <Button variant={state?.variant || 'primary'} size="sm" onClick={() => handleClose(true)}>
          Xác nhận
        </Button>
      </Modal.Footer>
    </Modal>
  );

  return { confirm, ConfirmDialog };
}

export default useConfirm;
