import React from 'react';
import { Modal, Form, Button, Alert, Spinner, Badge } from 'react-bootstrap';
import { IcoWarehouse, IcoX } from '@/components/common/Icons.jsx';

const WarehouseFormModal = ({
  show,
  onHide,
  editItem,
  form,
  setForm,
  saving,
  formErr,
  handleSave
}) => {
  return (
    <Modal show={show} onHide={onHide} centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1rem', fontWeight: 600 }}>
          <IcoWarehouse size={18} className="me-2 text-primary" />
          {editItem ? 'Chỉnh sửa thông tin kho' : 'Thêm kho mới'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {formErr && <Alert variant="danger" className="py-2 small mb-3">{formErr}</Alert>}
        
        <Form>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-semibold">Tên kho <span className="text-danger">*</span></Form.Label>
            <Form.Control 
              size="sm" 
              value={form.name} 
              autoFocus 
              maxLength={100}
              onChange={e => setForm(f => ({...f, name: e.target.value}))}
              placeholder="Ví dụ: Kho Trung Tâm, Kho A1..."
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="small fw-semibold">Vị trí / Địa chỉ</Form.Label>
            <Form.Control 
              size="sm" 
              value={form.location} 
              maxLength={200}
              onChange={e => setForm(f => ({...f, location: e.target.value}))}
              placeholder="Ví dụ: Tầng 1, Tòa nhà C..."
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="small fw-semibold">Mô tả</Form.Label>
            <Form.Control 
              as="textarea" 
              rows={2} 
              size="sm" 
              value={form.description} 
              maxLength={500}
              onChange={e => setForm(f => ({...f, description: e.target.value}))}
              placeholder="Ghi chú thêm về kho..."
            />
          </Form.Group>

          <div className="d-flex align-items-center justify-content-between p-2 bg-light rounded">
            <span className="small fw-semibold text-muted">Trạng thái hoạt động</span>
            <Form.Check 
              type="switch"
              id="warehouse-active-switch"
              checked={form.isActive}
              onChange={e => setForm(f => ({...f, isActive: e.target.checked}))}
            />
          </div>
          <Form.Text className="text-muted" style={{ fontSize: '0.7rem' }}>
            Kho tạm ngừng sẽ không thể chọn trong các phiếu nhập/xuất mới.
          </Form.Text>
        </Form>
      </Modal.Body>
      <Modal.Footer className="py-2 border-top-0">
        <Button size="sm" variant="outline-secondary" onClick={onHide} disabled={saving}>Huỷ</Button>
        <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? (
            <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1"/> Đang lưu...</>
          ) : (
            editItem ? 'Cập nhật' : 'Tạo kho'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default WarehouseFormModal;
