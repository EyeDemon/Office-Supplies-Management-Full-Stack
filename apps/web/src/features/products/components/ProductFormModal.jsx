import React from 'react';
import { Modal, Form, Row, Col, Button, Alert, Spinner, Badge } from 'react-bootstrap';

const ProductFormModal = ({
  show,
  onHide,
  editItem,
  form,
  setForm,
  categories,
  dbUnits,
  saving,
  formErr,
  touched,
  fieldErrors,
  handleFormChange,
  handleBlur,
  handleSave
}) => {
  return (
    <Modal show={show} onHide={onHide} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem', fontWeight: 600 }}>
          {editItem ? `Chỉnh sửa sản phẩm: ${editItem.name}` : 'Thêm sản phẩm mới'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {formErr && <Alert variant="danger" className="py-2 small mb-3">{formErr}</Alert>}
        
        <Form>
          <Row>
            {/* SKU & Barcode */}
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Mã SKU <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  size="sm"
                  value={form.sku}
                  onChange={e => handleFormChange('sku', e.target.value.toUpperCase())}
                  onBlur={() => handleBlur('sku')}
                  placeholder="VD: GIAY-A4-70"
                  disabled={!!editItem}
                  isInvalid={touched.sku && !!fieldErrors.sku}
                />
                <Form.Control.Feedback type="invalid">{fieldErrors.sku}</Form.Control.Feedback>
                <Form.Text className="text-muted" style={{fontSize: '0.75rem'}}>
                  Mã định danh duy nhất (không thể đổi sau khi tạo)
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Mã Barcode</Form.Label>
                <Form.Control
                  size="sm"
                  value={form.barcode}
                  onChange={e => handleFormChange('barcode', e.target.value.trim())}
                  placeholder="EAN-13, QR Code..."
                />
                <Form.Text className="text-muted" style={{fontSize: '0.75rem'}}>
                  Dùng để quét nhanh khi nhập/xuất
                </Form.Text>
              </Form.Group>
            </Col>

            {/* Name & Category */}
            <Col md={8}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Tên sản phẩm <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  size="sm"
                  value={form.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  onBlur={() => handleBlur('name')}
                  placeholder="Ví dụ: Giấy A4 Double A 70gsm"
                  isInvalid={touched.name && !!fieldErrors.name}
                />
                <Form.Control.Feedback type="invalid">{fieldErrors.name}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Danh mục <span className="text-danger">*</span></Form.Label>
                <Form.Select
                  size="sm"
                  value={form.categoryId}
                  onChange={e => handleFormChange('categoryId', e.target.value)}
                  onBlur={() => handleBlur('categoryId')}
                  isInvalid={touched.categoryId && !!fieldErrors.categoryId}
                >
                  <option value="">-- Chọn danh mục --</option>
                  {categories.map((c, idx) => <option key={c.id || idx} value={c.id}>{c.name}</option>)}
                </Form.Select>
                <Form.Control.Feedback type="invalid">{fieldErrors.categoryId}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            {/* Units */}
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Đơn vị tính <span className="text-danger">*</span></Form.Label>
                <Form.Select 
                  size="sm" 
                  value={form.unit} 
                  onChange={e => handleFormChange('unit', e.target.value)}
                >
                  {dbUnits.map((u, idx) => (
                    <option key={u.id || u.name || idx} value={u.name || u}>
                      {u.name || u}{u.symbol ? ` (${u.symbol})` : ''}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Đơn vị cơ sở <Badge bg="info" className="ms-1" style={{fontSize: '0.65rem'}}>Quy đổi</Badge></Form.Label>
                <Form.Select 
                  size="sm" 
                  value={form.baseUnitId} 
                  onChange={e => handleFormChange('baseUnitId', e.target.value)}
                >
                  <option value="">-- Giống đơn vị tính --</option>
                  {dbUnits.map((u, idx) => (
                    <option key={u.id || idx} value={u.id}>
                      {u.name}{u.symbol ? ` (${u.symbol})` : ''}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted" style={{fontSize: '0.7rem'}}>
                  Dùng để quy đổi tồn kho nhỏ nhất
                </Form.Text>
              </Form.Group>
            </Col>

            {/* Pricing & Stock Rules */}
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Đơn giá định mức (VNĐ) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  size="sm"
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={e => handleFormChange('price', e.target.value)}
                  onBlur={() => handleBlur('price')}
                  placeholder="0"
                  isInvalid={touched.price && !!fieldErrors.price}
                />
                <Form.Control.Feedback type="invalid">{fieldErrors.price}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Tồn tối thiểu <Badge bg="warning" text="dark" className="ms-1" style={{fontSize: '0.65rem'}}>Cảnh báo</Badge></Form.Label>
                <Form.Control
                  size="sm"
                  type="number"
                  min="0"
                  value={form.minStockQty}
                  onChange={e => handleFormChange('minStockQty', e.target.value)}
                  placeholder="5"
                />
                <Form.Text className="text-muted" style={{fontSize: '0.7rem'}}>Báo tồn thấp nếu tồn &le; mức này</Form.Text>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">Ngưỡng đặt mua <Badge bg="success" className="ms-1" style={{fontSize: '0.65rem'}}>Auto-PR</Badge></Form.Label>
                <Form.Control
                  size="sm"
                  type="number"
                  min="0"
                  value={form.reorderPoint}
                  onChange={e => handleFormChange('reorderPoint', e.target.value)}
                  placeholder="Để trống = Tồn tối thiểu"
                />
                <Form.Text className="text-muted" style={{fontSize: '0.7rem'}}>Tự động đề xuất mua khi tồn &lt; ngưỡng</Form.Text>
              </Form.Group>
            </Col>

            {/* Description */}
            <Col md={12}>
              <Form.Group className="mb-0">
                <Form.Label className="small fw-semibold">Mô tả chi tiết</Form.Label>
                <Form.Control 
                  as="textarea" 
                  rows={2} 
                  size="sm"
                  value={form.description}
                  onChange={e => handleFormChange('description', e.target.value)}
                  placeholder="Thông số kỹ thuật, quy cách đóng gói..."
                />
              </Form.Group>
            </Col>
          </Row>
        </Form>
      </Modal.Body>
      <Modal.Footer className="bg-light py-2">
        <Button size="sm" variant="outline-secondary" onClick={onHide} disabled={saving}>Hủy</Button>
        <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? (
            <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1"/> Đang lưu...</>
          ) : (
            editItem ? 'Lưu thay đổi' : 'Tạo sản phẩm'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ProductFormModal;
