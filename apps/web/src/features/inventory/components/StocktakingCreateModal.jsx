import React, { useState } from 'react';
import { Modal, Form, Button, Alert, Spinner } from 'react-bootstrap';

const StocktakingCreateModal = ({ show, onHide, onCreate }) => {
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreate({ note });
      setNote('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Tạo đợt kiểm kê mới</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Label className="form-label">Ghi chú (tuỳ chọn)</Form.Label>
          <Form.Control 
            as="textarea" 
            rows={3} 
            value={note} 
            onChange={e => setNote(e.target.value)}
            placeholder="Lý do kiểm kê, mô tả đợt KK..." 
          />
        </Form.Group>
        <Alert variant="info" className="mt-3 py-2 mb-0" style={{ fontSize: '0.8rem' }}>
          Hệ thống sẽ tự động snapshot tồn kho <strong>tất cả sản phẩm</strong> tại thời điểm tạo đợt.
        </Alert>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onHide}>Huỷ</Button>
        <Button variant="primary" size="sm" disabled={creating} onClick={handleCreate}>
          {creating ? <><Spinner size="sm" /> Đang tạo...</> : 'Tạo đợt kiểm kê'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default StocktakingCreateModal;
