import React, { useState, useEffect } from 'react';
import { Row, Col, Form, Table, Button, Alert } from 'react-bootstrap';
import { exportOrderAPI, productAPI, userAPI, warehouseAPI } from '@/services/api';

const ExportOrderForm = ({ existing, onSaved, onClose }) => {
  const [recipientName, setRecipient] = useState(existing?.recipient_name || '');
  const [department, setDept] = useState(existing?.department || '');
  const [warehouseId, setWarehouse] = useState(existing?.warehouse_id || '');
  const [note, setNote] = useState(existing?.note || '');
  const [items, setItems] = useState([{ productId: '', quantity: 1, note: '' }]);

  const [products, setProducts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      productAPI.getAll({ limit: 500 }),
      userAPI.getDepartments(),
      warehouseAPI.getAllList(),
    ]).then(([pRes, dRes, wRes]) => {
      setProducts(pRes.data?.data?.items || []);
      setDepartments(dRes.data?.data || []);
      setWarehouses(wRes.data?.data || []);
    }).finally(() => setLoading(false));

    if (existing?.id) {
      exportOrderAPI.getById(existing.id).then(r => {
        setItems(r.data?.data?.items?.map(i => ({ productId: String(i.product_id), quantity: i.quantity, note: i.note || '' })));
      });
    }
  }, [existing]);

  const updateItem = (idx, field, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const handleSave = async () => {
    const validItems = items.filter(i => i.productId && parseInt(i.quantity) > 0);
    if (!validItems.length) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        recipientName, department, warehouseId: warehouseId ? parseInt(warehouseId) : null, note,
        items: validItems.map(i => ({ productId: parseInt(i.productId), quantity: parseInt(i.quantity), note: i.note })),
      };
      if (existing?.id) await exportOrderAPI.update(existing.id, payload);
      else await exportOrderAPI.create(payload);
      onSaved(existing ? 'Cập nhật thành công' : 'Tạo phiếu thành công');
    } catch (e) {
      const msg = e.response?.data?.message || e.response?.data?.errors?.[0]?.message || 'Lưu thất bại';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form>
      {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
      <Row className="g-3 mb-4">
        <Col md={3}>
          <Form.Label className="small fw-bold">Người nhận</Form.Label>
          <Form.Control size="sm" value={recipientName} onChange={e => setRecipient(e.target.value)} />
        </Col>
        <Col md={3}>
          <Form.Label className="small fw-bold">Phòng ban</Form.Label>
          <Form.Select size="sm" value={department} onChange={e => setDept(e.target.value)}>
            <option value="">-- Chọn --</option>
            {departments.map((d, i) => <option key={i} value={d}>{d}</option>)}
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Label className="small fw-bold">Kho xuất</Form.Label>
          <Form.Select size="sm" value={warehouseId} onChange={e => setWarehouse(e.target.value)}>
            <option value="">-- Chọn --</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Label className="small fw-bold">Ghi chú</Form.Label>
          <Form.Control size="sm" value={note} onChange={e => setNote(e.target.value)} />
        </Col>
      </Row>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="fw-bold small">Danh sách sản phẩm</div>
        <Button size="sm" variant="outline-primary" onClick={() => setItems([...items, { productId: '', quantity: 1, note: '' }])}>+ Thêm</Button>
      </div>

      <Table bordered hover size="sm" className="mb-4">
        <thead className="bg-light">
          <tr><th>Sản phẩm</th><th style={{ width: 100 }}>Số lượng</th><th>Ghi chú</th><th style={{ width: 40 }}></th></tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx}>
              <td>
                <Form.Select size="sm" value={it.productId} onChange={e => updateItem(idx, 'productId', e.target.value)}>
                  <option value="">-- Chọn sản phẩm --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — Tồn: {p.stock_qty}</option>)}
                </Form.Select>
              </td>
              <td>
                <Form.Control size="sm" type="number" min="1" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
              </td>
              <td>
                <Form.Control size="sm" value={it.note} onChange={e => updateItem(idx, 'note', e.target.value)} />
              </td>
              <td className="text-center">
                <button className="btn-close" style={{ fontSize: '0.6rem' }} onClick={() => setItems(items.filter((_, i) => i !== idx))} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="d-flex justify-content-end gap-2 border-top pt-3">
        <Button variant="outline-secondary" onClick={onClose}>Hủy</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu phiếu'}</Button>
      </div>
    </Form>
  );
};

export default ExportOrderForm;
