import React, { useState, useEffect } from 'react';
import Modal from '@/components/common/Modal.jsx';
import { purchaseAPI, productAPI } from '@/services/api';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import { fmtNum, PRIORITY_LABEL } from './ProcurementHelpers';

export const SuggestModal = ({ onClose, setAlert, onCreated }) => {
  const [suggests, setSuggests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState({});

  useEffect(() => {
    purchaseAPI.getSuggest()
      .then(r => {
        const rows = r.data?.data || [];
        setSuggests(rows);
        const sel = {};
        rows.forEach(r => { sel[r.id] = { checked: true, quantity: Math.max(1, r.suggested_qty||1) }; });
        setSelected(sel);
      })
      .catch(() => setAlert('error', 'Lỗi tải gợi ý'))
      .finally(() => setLoading(false));
  }, [setAlert]);

  const handleCreate = async () => {
    const items = suggests.filter(s => selected[s.id]?.checked).map(s => ({
      productId: s.id, quantity: selected[s.id]?.quantity || 1
    }));
    if (items.length === 0) { setAlert('error', 'Chọn ít nhất 1 sản phẩm'); return; }

    const reason = `Bổ sung tồn kho — ${items.length} sản phẩm tồn thấp`;
    try {
      const r = await purchaseAPI.createPR({ reason, priority:'HIGH', items });
      setAlert('success', r.data?.message || 'Tạo PR thành công');
      onCreated();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Lỗi tạo PR'); }
  };

  return (
    <Modal title="💡 Gợi ý mua hàng từ sản phẩm tồn thấp" onClose={onClose} size="lg">
      {loading ? (
        <SkeletonTable headers={['','Sản phẩm','Danh mục','Tồn kho','Mức tối thiểu','SL đề xuất']} rows={5} />
      ) : (
        <>
          {suggests.length === 0 ? (
            <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-secondary)' }}>
              ✅ Tất cả sản phẩm đang đủ tồn kho
            </div>
          ) : (
            <>
              <p style={{ margin:'0 0 1rem', fontSize:'0.85rem', color:'var(--text-secondary)' }}>
                {suggests.length} sản phẩm đang ở mức tồn thấp. Chọn sản phẩm cần mua và điều chỉnh số lượng.
              </p>
              <table className="data-table" style={{ marginBottom:'1rem' }}>
                <thead><tr>
                  <th style={{ width:36 }}>
                    <input type="checkbox" checked={Object.values(selected).every(s=>s.checked)}
                      onChange={e => setSelected(prev => Object.fromEntries(Object.entries(prev).map(([k,v])=>[k,{...v,checked:e.target.checked}])))} />
                  </th>
                  <th>Sản phẩm</th><th>Danh mục</th><th style={{ textAlign:'right' }}>Tồn kho</th>
                  <th style={{ textAlign:'right' }}>Mức tối thiểu</th><th style={{ width:110 }}>SL đề xuất</th>
                </tr></thead>
                <tbody>
                  {suggests.map(s => (
                    <tr key={s.id} style={{ opacity: selected[s.id]?.checked ? 1 : 0.5 }}>
                      <td><input type="checkbox" checked={selected[s.id]?.checked||false}
                        onChange={e => setSelected(prev=>({...prev,[s.id]:{...prev[s.id],checked:e.target.checked}}))} /></td>
                      <td><strong>{s.name}</strong><div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{s.sku}</div></td>
                      <td style={{ fontSize:'0.8rem' }}>{s.category_name||'—'}</td>
                      <td style={{ textAlign:'right', color:'#ef4444', fontWeight:600 }}>{fmtNum(s.stock_quantity)}</td>
                      <td style={{ textAlign:'right' }}>{fmtNum(s.min_stock_level)}</td>
                      <td>
                        <input type="number" className="form-control" style={{ width:'100%' }} min={1}
                          value={selected[s.id]?.quantity||1}
                          onChange={e => setSelected(prev=>({...prev,[s.id]:{...prev[s.id],quantity:Math.max(1,parseInt(e.target.value)||1)}}))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
                <button className="btn" onClick={onClose}>Huỷ</button>
                <button className="btn btn-primary" onClick={handleCreate}>
                  Tạo PR cho {Object.values(selected).filter(s=>s.checked).length} sản phẩm đã chọn
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
};

export const PRFormModal = ({ onClose, onSaved, setAlert, initialItems = [] }) => {
  const [form, setForm]   = useState({ reason:'', priority:'MEDIUM', note:'' });
  const [items, setItems] = useState(initialItems);
  const [products, setProducts] = useState([]);
  const [prodSearch, setProdSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    productAPI.getAll({ size: 200 }).then(r => setProducts(r.data?.data?.items || []));
  }, []);

  const addProduct = (p) => {
    if (items.find(i => i.productId === p.id)) return;
    setItems(prev => [...prev, { productId: p.id, quantity: 1, note:'', _name: p.name, _sku: p.sku, _stock: p.stockQty }]);
    setProdSearch('');
  };

  const filteredProds = products.filter(p =>
    !items.find(i => i.productId === p.id) &&
    (prodSearch === '' || p.name.toLowerCase().includes(prodSearch.toLowerCase()) || (p.sku||'').toLowerCase().includes(prodSearch.toLowerCase()))
  ).slice(0, 10);

  const handleSubmit = async () => {
    if (!form.reason.trim()) { setAlert('error', 'Nhập lý do mua hàng'); return; }
    if (items.length === 0)  { setAlert('error', 'Thêm ít nhất 1 sản phẩm'); return; }
    setSaving(true);
    try {
      const r = await purchaseAPI.createPR({
        reason: form.reason, priority: form.priority, note: form.note,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity, note: i.note }))
      });
      setAlert('success', r.data?.message || 'Tạo PR thành công');
      onSaved();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Lỗi tạo PR'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Tạo yêu cầu mua hàng (PR)" onClose={onClose} size="lg">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
        <div style={{ gridColumn:'1/-1' }}>
          <label className="form-label">Lý do mua hàng *</label>
          <input className="form-control" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} placeholder="VD: Bổ sung vật phẩm tồn thấp Q2, mua cho dự án mới..." />
        </div>
        <div>
          <label className="form-label">Mức ưu tiên</label>
          <select className="form-control" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>
            {Object.entries(PRIORITY_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Ghi chú</label>
          <input className="form-control" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Ghi chú thêm..." />
        </div>
      </div>

      <div style={{ fontWeight:600, marginBottom:'0.5rem', fontSize:'0.9rem' }}>Sản phẩm cần mua</div>
      <div style={{ position:'relative', marginBottom:'0.75rem' }}>
        <input className="form-control" placeholder="Tìm sản phẩm để thêm..." value={prodSearch} onChange={e=>setProdSearch(e.target.value)} />
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
        <table className="data-table" style={{ marginBottom:'1rem' }}>
          <thead><tr><th>Sản phẩm</th><th>SKU</th><th>Tồn hiện tại</th><th style={{ width:110 }}>SL yêu cầu</th><th>Xoá</th></tr></thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td>{it._name}</td>
                <td style={{ color:'var(--text-secondary)', fontSize:'0.8rem' }}>{it._sku}</td>
                <td>{fmtNum(it._stock)}</td>
                <td><input type="number" className="form-control" style={{ width:'100%' }} min={1} value={it.quantity}
                  onChange={e => setItems(prev => prev.map((x,i) => i===idx ? {...x, quantity: Math.max(1,parseInt(e.target.value)||1)} : x))} /></td>
                <td><button className="btn btn-sm btn-danger" onClick={() => setItems(prev=>prev.filter((_,i)=>i!==idx))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ textAlign:'center', padding:'1rem', color:'var(--text-secondary)', background:'var(--bg-secondary)', borderRadius:6, marginBottom:'1rem' }}>
          Tìm và thêm sản phẩm cần mua bên trên
        </div>
      )}

      <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
        <button className="btn" onClick={onClose} disabled={saving}>Huỷ</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang tạo...' : 'Tạo yêu cầu'}</button>
      </div>
    </Modal>
  );
};
