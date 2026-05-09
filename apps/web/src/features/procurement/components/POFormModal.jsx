import React, { useState, useEffect } from 'react';
import Modal from '@/components/common/Modal.jsx';
import { purchaseAPI, productAPI, supplierAPI, warehouseAPI } from '@/services/api';
import { fmtNum, fmtMoney } from './ProcurementHelpers';

const POFormModal = ({ onClose, onSaved, setAlert }) => {
  const [form, setForm]     = useState({ supplierId:'', prId:'', deliveryDate:'', note:'', warehouseId:'' });
  const [items, setItems]   = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [prs, setPRs]       = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [prodSearch, setProdSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supplierAPI.getAllList().then(r => setSuppliers(r.data?.data || []));
    purchaseAPI.getAllPR({ status:'APPROVED', limit:100 }).then(r => setPRs(r.data?.data?.items || []));
    productAPI.getAll({ size:200 }).then(r => setProducts(r.data?.data?.items || []));
    warehouseAPI.getAllList().then(r => setWarehouses(r.data?.data || [])).catch(() => {});
  }, []);

  const handlePRChange = async (prId) => {
    setForm(f => ({ ...f, prId }));
    if (!prId) { setItems([]); return; }
    try {
      const r = await purchaseAPI.getPRById(parseInt(prId));
      const prItems = r.data?.data?.items || [];
      setItems(prItems.map(i => ({ productId: i.product_id, quantity: i.quantity, unitPrice: 0, note:'', _name: i.product_name, _sku: i.sku, _stock: i.stock_quantity })));
    } catch {}
  };

  const addProduct = (p) => {
    if (items.find(i => i.productId === p.id)) return;
    setItems(prev => [...prev, { productId: p.id, quantity: 1, unitPrice: 0, note:'', _name: p.name, _sku: p.sku, _stock: p.stockQty }]);
    setProdSearch('');
  };

  const filteredProds = products.filter(p =>
    !items.find(i => i.productId === p.id) &&
    (prodSearch === '' || p.name.toLowerCase().includes(prodSearch.toLowerCase()) || (p.sku||'').toLowerCase().includes(prodSearch.toLowerCase()))
  ).slice(0, 10);

  const totalAmount = items.reduce((s, i) => s + (i.quantity||0)*(i.unitPrice||0), 0);

  const handleSubmit = async () => {
    if (!form.supplierId) { setAlert('error', 'Chọn nhà cung cấp'); return; }
    if (items.length === 0) { setAlert('error', 'Thêm ít nhất 1 sản phẩm'); return; }
    setSaving(true);
    try {
      const r = await purchaseAPI.createPO({
        supplierId: parseInt(form.supplierId),
        prId: form.prId ? parseInt(form.prId) : null,
        deliveryDate: form.deliveryDate || null,
        note: form.note,
        warehouseId: form.warehouseId ? parseInt(form.warehouseId) : null,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, note: i.note }))
      });
      setAlert('success', r.data?.message || 'Tạo PO thành công');
      onSaved();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Lỗi tạo PO'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Tạo đơn mua hàng (PO)" onClose={onClose} size="lg">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
        <div>
          <label htmlFor="po-supplier" className="form-label">Nhà cung cấp *</label>
          <select id="po-supplier" className="form-control" value={form.supplierId} onChange={e=>setForm(f=>({...f,supplierId:e.target.value}))}>
            <option value="">— Chọn NCC —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="po-pr" className="form-label">Từ PR (không bắt buộc)</label>
          <select id="po-pr" className="form-control" value={form.prId} onChange={e=>handlePRChange(e.target.value)}>
            <option value="">— Không liên kết PR —</option>
            {prs.map(pr => <option key={pr.id} value={pr.id}>{pr.pr_code} — {pr.reason?.substring(0,40)}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Kho nhập hàng <span style={{color:'var(--danger)',fontSize:'0.8rem'}}>(nên chọn)</span></label>
          <select className="form-control" value={form.warehouseId} onChange={e=>setForm(f=>({...f,warehouseId:e.target.value}))}>
            <option value="">— Chọn kho nhập —</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Ngày giao hàng dự kiến</label>
          <input type="date" className="form-control" value={form.deliveryDate} onChange={e=>setForm(f=>({...f,deliveryDate:e.target.value}))} />
        </div>
        <div>
          <label className="form-label">Ghi chú</label>
          <input className="form-control" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Ghi chú thêm..." />
        </div>
      </div>

      <div style={{ fontWeight:600, marginBottom:'0.5rem', fontSize:'0.9rem' }}>Sản phẩm đặt mua</div>
      <div style={{ position:'relative', marginBottom:'0.75rem' }}>
        <input className="form-control" placeholder="Tìm thêm sản phẩm..." value={prodSearch} onChange={e=>setProdSearch(e.target.value)} />
        {prodSearch && filteredProds.length > 0 && (
          <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg-primary)', border:'1px solid var(--border-color)', borderRadius:6, zIndex:100, maxHeight:200, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
            {filteredProds.map(p => (
              <div key={p.id} style={{ padding:'0.5rem 0.75rem', cursor:'pointer', borderBottom:'1px solid var(--border-color)' }} onMouseDown={() => addProduct(p)}>
                <div style={{ fontWeight:500, fontSize:'0.85rem' }}>{p.name}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{p.sku} — Tồn: {fmtNum(p.stockQty)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <table className="data-table" style={{ marginBottom:'0.75rem' }}>
          <thead><tr><th>Sản phẩm</th><th style={{ width:100 }}>SL</th><th style={{ width:140 }}>Đơn giá (₫)</th><th style={{ textAlign:'right' }}>Thành tiền</th><th>Xoá</th></tr></thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td>{it._name}<div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{it._sku}</div></td>
                <td><input type="number" className="form-control" style={{ width:'100%' }} min={1} value={it.quantity}
                  onChange={e => setItems(prev => prev.map((x,i) => i===idx ? {...x, quantity: Math.max(1,parseInt(e.target.value)||1)} : x))} /></td>
                <td><input type="number" className="form-control" style={{ width:'100%' }} min={0} value={it.unitPrice}
                  onChange={e => setItems(prev => prev.map((x,i) => i===idx ? {...x, unitPrice: Math.max(0,parseInt(e.target.value)||0)} : x))} /></td>
                <td style={{ textAlign:'right', fontWeight:600 }}>{fmtMoney(it.quantity*it.unitPrice)}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => setItems(prev=>prev.filter((_,i)=>i!==idx))}>✕</button></td>
              </tr>
            ))}
            <tr style={{ background:'var(--bg-secondary)', fontWeight:700 }}>
              <td colSpan={3} style={{ textAlign:'right' }}>Tổng cộng:</td>
              <td style={{ textAlign:'right', color:'var(--primary)' }}>{fmtMoney(totalAmount)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div style={{ textAlign:'center', padding:'1rem', color:'var(--text-secondary)', background:'var(--bg-secondary)', borderRadius:6, marginBottom:'1rem' }}>
          Chọn PR để tự điền sản phẩm, hoặc tìm thêm sản phẩm bên trên
        </div>
      )}

      <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
        <button className="btn" onClick={onClose} disabled={saving}>Huỷ</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang tạo...' : 'Tạo đơn mua hàng'}</button>
      </div>
    </Modal>
  );
};

export default POFormModal;
