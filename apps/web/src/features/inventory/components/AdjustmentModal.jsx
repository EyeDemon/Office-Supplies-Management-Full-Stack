import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Button, Alert, Spinner, Badge } from 'react-bootstrap';
import { SkeletonBar } from '@/components/common/SkeletonRow.jsx';
import { productAPI } from '@/services/api';
import { IcoAdjust } from '@/components/common/Icons.jsx';

const UNIT_LABELS = {
  CAI:'Cái', HOP:'Hộp', GOI:'Gói', CUON:'Cuộn', BO:'Bộ',
  TUP:'Tuýp', LOC:'Lọc', KG:'Kg', MET:'Mét', TO:'Tờ',
};

const AdjustmentModal = ({ show, product, onHide, onSubmit, warehouses }) => {
  const [newQty, setNewQty] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  
  const [warehouseStocks, setWarehouseStocks] = useState([]);
  const [selectedWhId,    setSelectedWhId]    = useState('');
  const [whLoading,       setWhLoading]       = useState(false);

  useEffect(() => {
    if (show && product) {
      setNewQty(String(product.stockQty));
      setReason('');
      setError('');
      setSelectedWhId('');
      loadWarehouseStocks(product.id);
    }
  }, [show, product]);

  const loadWarehouseStocks = async (productId) => {
    setWhLoading(true);
    try {
      const res = await productAPI.getWarehouseStocks(productId);
      setWarehouseStocks(res.data?.data || []);
    } catch {
      setWarehouseStocks([]);
    } finally {
      setWhLoading(false);
    }
  };

  const handleWarehouseChange = (whId) => {
    setSelectedWhId(whId);
    setError('');
    if (!whId) {
      setNewQty(String(product?.stockQty ?? ''));
      return;
    }
    const ws = warehouseStocks.find(w => String(w.warehouseId) === String(whId));
    setNewQty(ws ? String(ws.stockQty) : '0');
  };

  const unitLabel = u => UNIT_LABELS[u] || u || '';

  const handleConfirm = async () => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 0) { 
      setError('Số lượng phải là số nguyên ≥ 0'); 
      return; 
    }
    if (!reason.trim() || reason.trim().length < 5) { 
      setError('Lý do điều chỉnh quá ngắn (tối thiểu 5 ký tự)'); 
      return; 
    }

    const baseQty = selectedWhId
      ? (warehouseStocks.find(w => String(w.warehouseId) === String(selectedWhId))?.stockQty ?? 0)
      : product.stockQty;

    if (qty === baseQty) { 
      setError('Số lượng không thay đổi — không cần điều chỉnh'); 
      return; 
    }

    setSaving(true);
    try {
      await onSubmit({
        productId: product.id,
        quantity: qty,
        reason: reason.trim(),
        warehouseId: selectedWhId ? parseInt(selectedWhId) : undefined,
        baseQty,
        whName: selectedWhId ? (warehouses.find(w => String(w.id) === String(selectedWhId))?.name) : 'tổng kho'
      });
      onHide();
    } catch (e) {
      setError(e.response?.data?.message || 'Điều chỉnh thất bại');
    } finally {
      setSaving(false);
    }
  };

  const baseQtyForDiff = selectedWhId
    ? (warehouseStocks.find(w => String(w.warehouseId) === String(selectedWhId))?.stockQty ?? 0)
    : (product?.stockQty ?? 0);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1rem' }}>
          <IcoAdjust size={16} className="me-2 text-warning"/>Điều chỉnh tồn kho
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {product && (
          <>
            <div className="mb-3 p-2 bg-light rounded small">
              <div><strong>Sản phẩm:</strong> {product.name}</div>
              <div><strong>SKU:</strong> <code>{product.sku}</code></div>
              <div>
                <strong>Tổng tồn:</strong>{' '}
                <span className={`fw-semibold ${product.lowStock ? 'text-danger' : 'text-success'}`}>
                  {product.stockQty} {unitLabel(product.unit)}
                </span>
              </div>
            </div>

            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

            <Form.Group className="mb-3" controlId="adjust-warehouse">
              <Form.Label className="fw-semibold small">Kho cần điều chỉnh</Form.Label>
              {whLoading ? (
                <SkeletonBar width="100%" height={32} />
              ) : (
                <Form.Select size="sm" value={selectedWhId} onChange={e => handleWarehouseChange(e.target.value)}>
                  <option value="">— Tự động (phân phối theo tỷ lệ) —</option>
                  {warehouses.map(wh => {
                    const ws = warehouseStocks.find(w => String(w.warehouseId) === String(wh.id));
                    return (
                      <option key={wh.id} value={wh.id}>
                        {wh.name}{ws ? ` — tồn: ${ws.stockQty}` : ' — chưa có hàng'}
                      </option>
                    );
                  })}
                </Form.Select>
              )}
              {!whLoading && warehouseStocks.length > 1 && (
                <div className="mt-2 p-2 rounded" style={{ background: '#f8f9fa', fontSize: '0.75rem' }}>
                  {warehouseStocks.map(ws => (
                    <div key={ws.warehouseId} className="d-flex justify-content-between">
                      <span className={String(selectedWhId) === String(ws.warehouseId) ? 'fw-bold text-primary' : ''}>
                        {ws.warehouseName}
                      </span>
                      <span>{ws.stockQty} {unitLabel(product.unit)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Form.Group>

            <Form.Group className="mb-3" controlId="adjust-qty">
              <Form.Label className="fw-semibold small">Số lượng mới</Form.Label>
              <Form.Control
                type="number" min="0" value={newQty}
                onChange={e => setNewQty(e.target.value)}
              />
              {newQty !== '' && !isNaN(parseInt(newQty)) && (
                <Form.Text>
                  Chênh lệch:{' '}
                  <strong className={parseInt(newQty) - baseQtyForDiff >= 0 ? 'text-success' : 'text-danger'}>
                    {parseInt(newQty) - baseQtyForDiff > 0 ? '+' : ''}{parseInt(newQty) - baseQtyForDiff}
                  </strong>
                </Form.Text>
              )}
            </Form.Group>

            <Form.Group controlId="adjust-reason">
              <Form.Label className="fw-semibold small">Lý do điều chỉnh</Form.Label>
              <Form.Control
                as="textarea" rows={3}
                placeholder="Ví dụ: Kiểm kê thực tế ngày 20/04..."
                value={reason} onChange={e => setReason(e.target.value)}
              />
            </Form.Group>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button size="sm" variant="secondary" onClick={onHide}>Huỷ</Button>
        <Button size="sm" variant="warning" onClick={handleConfirm} disabled={saving}>
          {saving ? <Spinner size="sm" /> : 'Xác nhận điều chỉnh'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default AdjustmentModal;
