import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Table, Badge, Button, Modal, Form, InputGroup, Spinner, Alert } from 'react-bootstrap';
import { requisitionAPI, productAPI, warehouseAPI } from '@/services/api';
import { IcoSearch, IcoPlus, IcoX, IcoCheck, IcoBox } from '@/components/common/Icons.jsx';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';

const UNIT_LABELS = {
  CAI:'Cái', HOP:'Hộp', GOI:'Gói', CUON:'Cuộn', BO:'Bộ',
  TUP:'Tuýp', LOC:'Lọc', KG:'Kg',  MET:'Mét',  TO:'Tờ',
};
const unitLabel = (u) => UNIT_LABELS[u] || u || '';

const RequisitionCreateModal = ({ onClose, onSuccess }) => {
  const [products, setProducts] = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{ product, qty, note }]
  const [note, setNote] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const loadProducts = useCallback(async (q = '') => {
    setLoadingProd(true);
    try {
      const res = await productAPI.getAll({ search: q, size: 50 });
      setProducts(res.data.data.items);
    } catch { /* ignore */ }
    finally { setLoadingProd(false); }
  }, []);

  useEffect(() => {
    loadProducts();
    // Fetch warehouses
    warehouseAPI.getAllList().then(r => {
      const list = r.data.data || [];
      setWarehouses(list);
      if (list.length > 0) setWarehouseId(list[0].id);
    }).catch(() => { /* ignore */ });
  }, [loadProducts]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    loadProducts(e.target.value);
  };

  const addToCart = (product) => {
    if (cart.find(c => c.product.id === product.id)) return;
    setCart(prev => [...prev, { product, qty: 1, note: '' }]);
  };

  const updateQty = (productId, qty) => {
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, qty: Math.max(1, parseInt(qty) || 1) } : c));
  };

  const updateNote = (productId, note) => {
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, note } : c));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(c => c.product.id !== productId));
  };

  const handleSubmit = async () => {
    if (!warehouseId) { setErr('Vui lòng chọn kho muốn rút hàng'); return; }
    if (cart.length === 0) { setErr('Giỏ hàng trống, vui lòng chọn ít nhất 1 mặt hàng'); return; }
    setSubmitting(true); setErr('');
    try {
      await requisitionAPI.create({
        warehouseId: Number(warehouseId),
        note: note.trim() || undefined,
        items: cart.map(c => ({
          productId:        c.product.id,
          quantityRequested: c.qty,
          note: c.note.trim() || undefined,
        })),
      });
      onSuccess();
    } catch (e) {
      setErr(e.response?.data?.message || 'Lỗi tạo phiếu');
    } finally {
      setSubmitting(false);
    }
  };

  const isInCart = (id) => cart.some(c => c.product.id === id);

  return (
    <Modal show onHide={onClose} size="xl" scrollable centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem', fontWeight: 700 }}>Tạo phiếu yêu cầu mới</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {err && <Alert variant="danger" dismissible onClose={() => setErr('')}>{err}</Alert>}
        <Row>
          <Col md={7} className="border-end pe-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0">Chọn văn phòng phẩm</h6>
              <div style={{ width: 200 }}>
                <Form.Select size="sm" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} title="Chọn kho rút hàng">
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </Form.Select>
              </div>
            </div>
            <InputGroup size="sm" className="mb-2">
              <InputGroup.Text><IcoSearch size={14} /></InputGroup.Text>
              <Form.Control placeholder="Tìm sản phẩm..." value={search} onChange={handleSearch} />
            </InputGroup>
            {loadingProd
              ? <table className="table table-sm mb-0"><tbody>{[1,2,3].map(i=><SkeletonRow key={i} cols={3}/>)}</tbody></table>
              : (
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  <Table size="sm" hover className="mb-0">
                    <thead className="table-light sticky-top">
                      <tr>
                        <th>Tên sản phẩm</th>
                        <th className="text-center">Có sẵn</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.length === 0 && (
                        <tr><td colSpan={3} className="text-center text-muted py-3">Không tìm thấy sản phẩm</td></tr>
                      )}
                      {products.map(p => (
                        <tr key={p.id} className={isInCart(p.id) ? 'table-success' : ''}>
                          <td>
                            <div className="fw-semibold" style={{ fontSize: '.85rem' }}>{p.name}</div>
                            <small className="text-muted"><code>{p.sku}</code> · {unitLabel(p.unit)}</small>
                          </td>
                          <td className="text-center">
                            <Badge bg={p.availableQty === 0 ? 'danger' : p.availableQty <= p.minStockQty ? 'warning' : 'success'}
                              title={`Tồn: ${p.stockQty} | Đặt trước: ${p.reservedQty}`}>
                              {p.availableQty}
                            </Badge>
                          </td>
                          <td>
                            <Button
                              size="sm" variant={isInCart(p.id) ? 'outline-success' : 'outline-primary'}
                              onClick={() => !isInCart(p.id) && addToCart(p)}
                              disabled={isInCart(p.id) || p.availableQty === 0}
                              title={p.availableQty === 0 ? 'Hết hàng (hết khả dụng)' : isInCart(p.id) ? 'Đã thêm' : 'Thêm vào giỏ'}
                            >
                              {isInCart(p.id) ? <IcoCheck size={14} /> : <IcoPlus size={14} />}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
          </Col>
          <Col md={5} className="ps-3">
            <h6 className="mb-2">
              Giỏ hàng <Badge bg="primary" pill>{cart.length}</Badge>
            </h6>
            {cart.length === 0 && (
              <div className="text-center text-muted py-4" style={{ fontSize: '.85rem' }}>
                <IcoBox size={32} className="d-block mx-auto mb-2 opacity-50" />
                Chưa chọn mặt hàng nào
              </div>
            )}
            {cart.map(c => (
              <div key={c.product.id} className="border rounded p-2 mb-2" style={{ fontSize: '.83rem' }}>
                <div className="d-flex justify-content-between align-items-start mb-1">
                  <div className="fw-semibold">{c.product.name}</div>
                  <Button variant="link" size="sm" className="p-0 text-danger" onClick={() => removeFromCart(c.product.id)}>
                    <IcoX size={14} />
                  </Button>
                </div>
                <Row className="g-1">
                  <Col xs={5}>
                    <Form.Label className="mb-0 text-muted" style={{ fontSize: '.76rem' }}>Số lượng</Form.Label>
                    <Form.Control
                      size="sm" type="number" min={1} value={c.qty}
                      onChange={e => updateQty(c.product.id, e.target.value)}
                    />
                  </Col>
                  <Col xs={7}>
                    <Form.Label className="mb-0 text-muted" style={{ fontSize: '.76rem' }}>Ghi chú</Form.Label>
                    <Form.Control
                      size="sm" placeholder="(tùy chọn)" value={c.note}
                      onChange={e => updateNote(c.product.id, e.target.value)}
                    />
                  </Col>
                </Row>
              </div>
            ))}
            <Form.Group className="mt-2">
              <Form.Label className="text-muted" style={{ fontSize: '.83rem' }}>Ghi chú chung</Form.Label>
              <Form.Control
                as="textarea" rows={2} size="sm" placeholder="Lý do yêu cầu, mục đích sử dụng..."
                value={note} onChange={e => setNote(e.target.value)}
              />
            </Form.Group>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
        <Button
          variant="primary" size="sm" onClick={handleSubmit}
          disabled={submitting || cart.length === 0}
        >
          {submitting ? <><Spinner size="sm" className="me-1" />Đang gửi...</> : `Gửi yêu cầu (${cart.length} mặt hàng)`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default RequisitionCreateModal;
