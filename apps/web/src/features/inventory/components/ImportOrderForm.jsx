import React, { useState, useEffect } from 'react';
import { Modal, Row, Col, Form, Button, Table, Alert, Spinner } from 'react-bootstrap';
import { orderAPI, supplierAPI, warehouseAPI, productAPI, categoryAPI, lotAPI } from '@/services/api';
import { IcoPlus, IcoTrash, IcoCheck } from '@/components/common/Icons.jsx';

const ImportOrderForm = ({ show, onHide, onSaved, editOrder = null }) => {
  const isEditMode = Boolean(editOrder?.id);
  const [suppliers,   setSuppliers]   = useState([]);
  const [products,    setProducts]    = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [warehouses,  setWarehouses]  = useState([]);
  const [supplierId,  setSupplierId]  = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [note,        setNote]        = useState('');
  const [items,       setItems]       = useState([{ productId: '', quantity: 1, unitPrice: '', lotId: '' }]);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');
  const [catFilter,   setCatFilter]   = useState('');
  const [productLots, setProductLots] = useState({});

  useEffect(() => {
    if (!show) return;
    supplierAPI.getAllList().then(r => setSuppliers(r.data?.data || [])).catch(() => {});
    warehouseAPI.getAllList().then(r => setWarehouses(r.data?.data || [])).catch(() => {});
    productAPI.getAll({ size: 500 }).then(r => setProducts(r.data?.data?.items || [])).catch(() => {});
    categoryAPI.getAll().then(r => setCategories(r.data?.data?.items || [])).catch(() => {});
    setErr(''); setCatFilter('');
    if (isEditMode && editOrder) {
      setSupplierId(editOrder.supplierId ? String(editOrder.supplierId) : '');
      setWarehouseId(editOrder.warehouseId ? String(editOrder.warehouseId) : '');
      setNote(editOrder.note || '');
      setItems(editOrder.items?.length
        ? editOrder.items.map(i => ({ productId: String(i.productId), quantity: i.quantity, unitPrice: String(i.unitPrice), lotId: String(i.lotId || '') }))
        : [{ productId: '', quantity: 1, unitPrice: '', lotId: '' }]);
    } else {
      setSupplierId(''); setWarehouseId(''); setNote('');
      setItems([{ productId: '', quantity: 1, unitPrice: '', lotId: '' }]);
    }
  }, [show, isEditMode, editOrder]);

  const [scanMode,     setScanMode]     = useState(false);
  const [scanInput,    setScanInput]    = useState('');
  const [scanFeedback, setScanFeedback] = useState(''); 
  const [scanCount,    setScanCount]    = useState(0);  
  const [lastScanned,  setLastScanned]  = useState(''); 
  const scanRef = React.useRef(null);

  const handleScan = (e) => {
    if (e.key !== 'Enter') return;
    const code = scanInput.trim();
    if (!code) return;

    const prod = products.find(p => p.barcode && p.barcode === code)
      || products.find(p => p.sku === code)
      || products.find(p => p.name?.toLowerCase() === code.toLowerCase());

    if (!prod) {
      setScanFeedback('notfound');
      setLastScanned(code);
      setScanInput('');
      setTimeout(() => setScanFeedback(''), 2500);
      return;
    }

    const existing = items.findIndex(it => String(it.productId) === String(prod.id));
    if (existing !== -1) {
      updateRow(existing, 'quantity', (parseInt(items[existing].quantity) || 0) + 1);
    } else {
      setItems(prev => [...prev, {
        productId: String(prod.id),
        quantity: 1,
        unitPrice: String(prod.price || ''),
        lotId: '',
      }]);
    }

    setScanFeedback('ok');
    setLastScanned(prod.name);       
    setScanCount(c => c + 1);        
    setScanInput('');
    setTimeout(() => {
      setScanFeedback('');
      if (scanRef.current) scanRef.current.focus(); 
    }, 800);
  };

  const filteredProducts = catFilter ? products.filter(p => String(p.categoryId) === catFilter) : products;
  const addRow    = () => setItems([...items, { productId: '', quantity: 1, unitPrice: '', lotId: '' }]);
  const removeRow = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => setItems(items.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  
  const onProductChange = (i, pid) => {
    const prod = products.find(p => String(p.id) === pid);
    setItems(prev => prev.map((row, idx) => idx !== i ? row : { ...row, productId: pid, unitPrice: prod ? String(prod.price || '') : row.unitPrice, lotId: '' }));
    if (pid) {
      lotAPI.getByProduct(parseInt(pid))
        .then(r => setProductLots(prev => ({ ...prev, [pid]: r.data?.data || [] })))
        .catch(() => {});
    }
  };

  const handleSave = async () => {
    const validItems = items.filter(it => it.productId && parseInt(it.quantity) > 0);
    if (!validItems.length) { setErr('Vui lòng thêm ít nhất 1 sản phẩm'); return; }
    const pids = validItems.map(i => i.productId);
    if (new Set(pids).size !== pids.length) { setErr('Không được chọn trùng sản phẩm'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        supplierId: supplierId || null,
        warehouseId: warehouseId ? parseInt(warehouseId) : null,
        note,
        items: validItems.map(it => ({ productId: parseInt(it.productId), quantity: parseInt(it.quantity), unitPrice: Number(it.unitPrice) || 0, lotId: it.lotId ? parseInt(it.lotId) : null })),
      };
      if (isEditMode) await orderAPI.update(editOrder.id, payload);
      else            await orderAPI.create(payload);
      onSaved(isEditMode ? 'Cập nhật phiếu nhập thành công!' : 'Tạo phiếu nhập thành công!');
    } catch (e) { setErr(e.response?.data?.message || 'Lỗi server'); }
    finally { setSaving(false); }
  };

  const formatVND = v => v?.toLocaleString('vi-VN') + 'đ';
  const total = items.reduce((s, it) => s + (parseInt(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  return (
    <Modal show={show} onHide={onHide} size="xl">
      <Modal.Header closeButton>
        <Modal.Title>{isEditMode ? `Chỉnh sửa phiếu nháp — ${editOrder?.orderCode}` : 'Tạo phiếu nhập kho mới'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {err && <Alert variant="danger" className="py-2">{err}</Alert>}
        <Row className="g-3 mb-3">
          <Col md={4}>
            <Form.Group>
              <Form.Label>Nhà cung cấp</Form.Label>
              <Form.Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">-- Không chọn NCC --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Kho nhập <span style={{color:'red'}}>*</span></Form.Label>
              <Form.Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                <option value="">-- Chọn kho nhập --</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Ghi chú phiếu</Form.Label>
              <Form.Control value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú về lô hàng..." />
            </Form.Group>
          </Col>
        </Row>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-bold small">Danh sách hàng nhập</span>
          <div className="d-flex gap-2">
            <Form.Select size="sm" style={{ width: 160 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">Tất cả danh mục</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Form.Select>
            <Button size="sm" variant="outline-primary" onClick={addRow}><IcoPlus size={12} /> Thêm dòng</Button>
            <Button size="sm" variant={scanMode ? 'warning' : 'outline-secondary'} onClick={() => setScanMode(!scanMode)}>
              📷 {scanMode ? 'Tắt Scanner' : 'Bật Scanner'}
            </Button>
          </div>
        </div>

        {scanMode && (
          <div className="mb-3 p-3 bg-light border rounded d-flex gap-2 align-items-center">
            <Form.Control
              ref={scanRef} autoFocus placeholder="Quét mã vạch..."
              value={scanInput} onChange={e => setScanInput(e.target.value)} onKeyDown={handleScan}
              style={{ fontFamily: 'monospace' }}
            />
            {scanFeedback === 'ok' && <Badge bg="success">Thành công: {lastScanned}</Badge>}
            {scanFeedback === 'notfound' && <Badge bg="danger">Không tìm thấy: {lastScanned}</Badge>}
          </div>
        )}

        <Table bordered size="sm" className="mb-2">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th><th>Sản phẩm</th>
              <th style={{ width: 100 }}>Số lượng</th><th style={{ width: 140 }}>Đơn giá nhập</th>
              <th style={{ width: 160 }}>Lô hàng</th><th className="text-end">Thành tiền</th><th style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={i}>
                <td className="text-center align-middle">{i + 1}</td>
                <td>
                  <Form.Select size="sm" value={row.productId} onChange={e => onProductChange(i, e.target.value)}>
                    <option value="">-- Chọn sản phẩm --</option>
                    {filteredProducts.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                  </Form.Select>
                </td>
                <td>
                  <Form.Control size="sm" type="number" value={row.quantity} onChange={e => updateRow(i, 'quantity', e.target.value)} />
                </td>
                <td>
                  <Form.Control size="sm" type="number" value={row.unitPrice} onChange={e => updateRow(i, 'unitPrice', e.target.value)} />
                </td>
                <td>
                  <Form.Select size="sm" value={row.lotId} onChange={e => updateRow(i, 'lotId', e.target.value)} disabled={!row.productId}>
                    <option value="">-- Không chọn lô --</option>
                    {(productLots[row.productId] || []).map(l => <option key={l.id} value={l.id}>{l.batchCode}</option>)}
                  </Form.Select>
                </td>
                <td className="text-end align-middle">{formatVND((parseInt(row.quantity) || 0) * (Number(row.unitPrice) || 0))}</td>
                <td className="text-center">
                  <button className="btn-close" onClick={() => removeRow(i)} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="text-end fw-bold">Tổng cộng:</td>
              <td className="text-end fw-bold text-success">{formatVND(total)}</td>
              <td />
            </tr>
          </tfoot>
        </Table>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Hủy</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size="sm" /> : <IcoCheck size={14} />} {isEditMode ? 'Lưu thay đổi' : 'Lưu phiếu nháp'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ImportOrderForm;
