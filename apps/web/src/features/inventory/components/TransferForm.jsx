// apps/web/src/features/inventory/components/TransferForm.jsx
import React, { useState, useEffect } from 'react';
import { transferAPI, productAPI, warehouseAPI } from '@/services/api';
import Modal from '@/components/common/Modal.jsx';
import { IcoX } from '@/components/common/Icons.jsx';

function TransferForm({ editItem, onClose, onSaved, setAlert }) {
  const [form, setForm]     = useState({
    fromLocation:    editItem?.from_location || '',
    toLocation:      editItem?.to_location   || '',
    fromWarehouseId: editItem?.from_warehouse_id || '',
    toWarehouseId:   editItem?.to_warehouse_id   || '',
    note:            editItem?.note          || '',
  });
  const [items, setItems]   = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [saving, setSaving] = useState(false);
  const [prodSearch, setProdSearch] = useState('');

  useEffect(() => {
    // Load products
    productAPI.getAll({ size: 200 }).then(r => setProducts(r.data?.data?.items || [])).catch(() => {});
    // Load warehouse list
    warehouseAPI.getAllList().then(r => setWarehouses(r.data?.data || [])).catch(() => {});
    
    if (editItem) {
      transferAPI.getById(editItem.id).then(r => {
        const detail = r.data?.data;
        if (detail) setItems((detail.items || []).map(i => ({ 
           productId: i.product_id, 
           quantity: i.quantity, 
           note: i.note || '', 
           _name: i.product_name, 
           _stock: i.stock_quantity 
        })));
      }).catch(() => {});
    }
  }, [editItem]);

  const handleFromWarehouse = (e) => {
    const wh = warehouses.find(w => String(w.id) === String(e.target.value));
    setForm(f => ({ ...f, fromWarehouseId: e.target.value, fromLocation: wh?.name || '' }));
  };
  const handleToWarehouse = (e) => {
    const wh = warehouses.find(w => String(w.id) === String(e.target.value));
    setForm(f => ({ ...f, toWarehouseId: e.target.value, toLocation: wh?.name || '' }));
  };

  const addProduct = (prod) => {
    if (items.find(i => i.productId === prod.id)) return;
    setItems(prev => [...prev, { 
       productId: prod.id, 
       quantity: 1, 
       note: '', 
       _name: prod.name, 
       _stock: prod.stockQty 
    }]);
    setProdSearch('');
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateQty  = (idx, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, parseInt(val)||1) } : it));

  const filteredProds = products.filter(p =>
    !items.find(i => i.productId === p.id) &&
    (prodSearch === '' || p.name.toLowerCase().includes(prodSearch.toLowerCase()) || (p.sku||'').toLowerCase().includes(prodSearch.toLowerCase()))
  ).slice(0, 10);

  const handleSubmit = async () => {
    if (!form.fromWarehouseId) { setAlert('error', 'Vui lòng chọn kho nguồn'); return; }
    if (!form.toWarehouseId)   { setAlert('error', 'Vui lòng chọn kho đích');   return; }
    if (form.fromWarehouseId === form.toWarehouseId) { setAlert('error', 'Kho nguồn và kho đích không được trùng nhau'); return; }
    if (items.length === 0) { setAlert('error', 'Thêm ít nhất 1 sản phẩm'); return; }

    setSaving(true);
    const payload = {
      fromLocation:    form.fromLocation,
      toLocation:      form.toLocation,
      fromWarehouseId: parseInt(form.fromWarehouseId),
      toWarehouseId:   parseInt(form.toWarehouseId),
      note:            form.note,
      items:           items.map(i => ({ productId: i.productId, quantity: i.quantity, note: i.note })),
    };
    try {
      if (editItem) {
        await transferAPI.update(editItem.id, payload);
        setAlert('success', 'Đã cập nhật phiếu điều chuyển');
      } else {
        const r = await transferAPI.create(payload);
        setAlert('success', r.data?.message || 'Tạo phiếu điều chuyển thành công');
      }
      onSaved();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Lỗi lưu phiếu'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={editItem ? `Sửa phiếu ${editItem.transfer_code}` : 'Tạo phiếu điều chuyển'} onClose={onClose} size="lg">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
        <div>
          <label className="form-label small fw-bold">Kho nguồn *</label>
          <select className="form-control form-control-sm" value={form.fromWarehouseId} onChange={handleFromWarehouse}>
            <option value="">-- Chọn kho nguồn --</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id} disabled={String(w.id) === String(form.toWarehouseId)}>
                {w.name}{w.location ? ` (${w.location})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label small fw-bold">Kho đích *</label>
          <select className="form-control form-control-sm" value={form.toWarehouseId} onChange={handleToWarehouse}>
            <option value="">-- Chọn kho đích --</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id} disabled={String(w.id) === String(form.fromWarehouseId)}>
                {w.name}{w.location ? ` (${w.location})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom:'1rem' }}>
        <label className="form-label small fw-bold">Ghi chú</label>
        <input className="form-control form-control-sm" value={form.note} onChange={e => setForm(f => ({...f, note: e.target.value}))} placeholder="Ghi chú về đợt điều chuyển..." />
      </div>

      <div className="small fw-bold mb-2">Sản phẩm điều chuyển</div>
      <div style={{ position:'relative', marginBottom:'0.75rem' }}>
        <input className="form-control form-control-sm" placeholder="Tìm sản phẩm để thêm..." value={prodSearch}
          onChange={e => setProdSearch(e.target.value)} />
        {prodSearch && filteredProds.length > 0 && (
          <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg-primary)', border:'1px solid var(--border-color)', borderRadius:6, zIndex:100, maxHeight:220, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
            {filteredProds.map(p => (
              <div key={p.id} style={{ padding:'0.5rem 0.75rem', cursor:'pointer', borderBottom:'1px solid var(--border-color)' }}
                onMouseDown={() => addProduct(p)}>
                <div style={{ fontWeight:500, fontSize:'0.85rem' }}>{p.name}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{p.sku} — Tồn: {Number(p.stockQty||0).toLocaleString('vi-VN')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="table-responsive">
         <table className="table table-sm table-hover small" style={{ marginBottom:'1rem' }}>
            <thead className="bg-light"><tr><th>Sản phẩm</th><th>Tồn hiện tại</th><th style={{ width:120 }}>Số lượng</th><th style={{ width:40 }}></th></tr></thead>
            <tbody>
               {items.map((it, idx) => (
                  <tr key={idx} className="align-middle">
                     <td>{it._name}</td>
                     <td style={{ color: it._stock < it.quantity ? '#ef4444' : 'inherit' }}>{Number(it._stock||0).toLocaleString('vi-VN')}</td>
                     <td><input type="number" className="form-control form-control-sm" style={{ width:'100%' }} min={1} value={it.quantity} onChange={e => updateQty(idx, e.target.value)} /></td>
                     <td className="text-center"><button className="btn btn-link btn-sm text-danger p-0" onClick={() => removeItem(idx)}><IcoX size={14} /></button></td>
                  </tr>
               ))}
               {items.length === 0 && (
                  <tr>
                     <td colSpan={4} className="text-center py-4 text-muted bg-light rounded">
                        Chưa có sản phẩm nào — tìm và thêm sản phẩm bên trên
                     </td>
                  </tr>
               )}
            </tbody>
         </table>
      </div>

      <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }} className="border-top pt-3">
        <button className="btn btn-light" onClick={onClose} disabled={saving}>Huỷ</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Đang lưu...' : (editItem ? 'Cập nhật' : 'Tạo phiếu')}
        </button>
      </div>
    </Modal>
  );
}

export default TransferForm;
