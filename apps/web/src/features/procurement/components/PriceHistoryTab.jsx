import React, { useState, useEffect, useCallback } from 'react';
import { purchaseAPI, productAPI, supplierAPI } from '@/services/api';
import Modal from '@/components/common/Modal.jsx';
import { fmtDate, fmtMoney } from './ProcurementHelpers';

export default function PriceHistoryTab({ setAlert }) {
  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [filterProduct,  setFP] = useState('');
  const [filterSupplier, setFS] = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const LIMIT = 20;

  const load = useCallback(() => {
    setLoading(true);
    purchaseAPI.getPriceHistory({ productId: filterProduct || undefined, supplierId: filterSupplier || undefined, page, limit: LIMIT })
      .then(r => { setData(r.data?.data?.items || []); setTotal(r.data?.data?.total || 0); })
      .catch(() => setAlert('error', 'Không thể tải lịch sử giá'))
      .finally(() => setLoading(false));
  }, [filterProduct, filterSupplier, page, setAlert]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    productAPI.getAll({ limit: 200 }).then(r => setProducts(r.data?.data?.items || [])).catch(() => {});
    supplierAPI.getAll({ limit: 100 }).then(r => setSuppliers(r.data?.data?.items || [])).catch(() => {});
  }, []);

  const totalPages = Math.ceil(total / LIMIT);
  const SOURCE_LABEL = { PO: 'Đơn mua hàng', IMPORT: 'Phiếu nhập', MANUAL: 'Thủ công' };
  const SOURCE_COLOR = { PO: '#3b82f6', IMPORT: '#10b981', MANUAL: '#f59e0b' };

  return (
    <div>
      <div style={{ background:'#fff', border:'1px solid var(--border-color)', borderRadius:10, padding:'0.75rem 1.25rem', marginBottom:'1rem', display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'center' }}>
        <select value={filterProduct} onChange={e => { setFP(e.target.value); setPage(1); }} style={{ padding:'0.35rem 0.6rem', border:'1px solid var(--border-color)', borderRadius:6, fontSize:'0.82rem', minWidth:200 }}>
          <option value="">Tất cả sản phẩm</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
        </select>
        <select value={filterSupplier} onChange={e => { setFS(e.target.value); setPage(1); }} style={{ padding:'0.35rem 0.6rem', border:'1px solid var(--border-color)', borderRadius:6, fontSize:'0.82rem', minWidth:160 }}>
          <option value="">Tất cả NCC</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={() => { setFP(''); setFS(''); setPage(1); }} style={{ padding:'0.35rem 0.7rem', border:'1px solid var(--border-color)', borderRadius:6, background:'transparent', cursor:'pointer', fontSize:'0.8rem' }}>Xoá lọc</button>
        <div style={{ marginLeft:'auto' }}>
          <button onClick={() => setShowAdd(true)} style={{ padding:'0.4rem 0.9rem', background:'#3b82f6', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:'0.82rem', fontWeight:600 }}>+ Ghi giá thủ công</button>
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>⏳ Đang tải...</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)', background:'#fff', border:'1px solid var(--border-color)', borderRadius:10 }}>
          <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>📊</div>
          <div style={{ fontWeight:600 }}>Chưa có lịch sử giá</div>
          <div style={{ fontSize:'0.8rem', marginTop:'0.25rem' }}>Giá sẽ tự động ghi nhận khi nhận hàng từ đơn mua (PO)</div>
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid var(--border-color)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
            <thead style={{ background:'var(--bg-secondary)' }}>
              <tr>
                <th style={{ padding:'0.6rem 0.75rem', textAlign:'left' }}>Sản phẩm</th><th style={{ padding:'0.6rem 0.75rem', textAlign:'left' }}>Nhà cung cấp</th><th style={{ padding:'0.6rem 0.75rem', textAlign:'right' }}>Đơn giá</th><th style={{ padding:'0.6rem 0.75rem', textAlign:'center' }}>Số lượng</th><th style={{ padding:'0.6rem 0.75rem', textAlign:'center' }}>Ngày áp dụng</th><th style={{ padding:'0.6rem 0.75rem', textAlign:'center' }}>Nguồn</th><th style={{ padding:'0.6rem 0.75rem', textAlign:'left' }}>Mã chứng từ</th><th style={{ padding:'0.6rem 0.75rem', textAlign:'left' }}>Người ghi</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id} style={{ borderBottom:'1px solid var(--border-color)' }}>
                  <td style={{ padding:'0.6rem 0.75rem' }}><div style={{ fontWeight:600 }}>{r.productName}</div><div style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>{r.sku}</div></td>
                  <td style={{ padding:'0.6rem 0.75rem', color:'var(--text-secondary)' }}>{r.supplierName || '—'}</td>
                  <td style={{ padding:'0.6rem 0.75rem', textAlign:'right', fontWeight:700, color:'#3b82f6' }}>{fmtMoney(r.unitPrice)}</td>
                  <td style={{ padding:'0.6rem 0.75rem', textAlign:'center' }}>{r.quantity.toLocaleString('vi-VN')}</td>
                  <td style={{ padding:'0.6rem 0.75rem', textAlign:'center', fontSize:'0.78rem' }}>{fmtDate(r.effectiveDate)}</td>
                  <td style={{ padding:'0.6rem 0.75rem', textAlign:'center' }}>
                    <span style={{ background:(SOURCE_COLOR[r.sourceType]||'#6b7280')+'22', color:SOURCE_COLOR[r.sourceType]||'#6b7280', border:`1px solid ${(SOURCE_COLOR[r.sourceType]||'#6b7280')}55`, borderRadius:5, padding:'2px 7px', fontSize:'0.72rem', fontWeight:600 }}>{SOURCE_LABEL[r.sourceType]||r.sourceType}</span>
                  </td>
                  <td style={{ padding:'0.6rem 0.75rem', fontFamily:'monospace', fontSize:'0.75rem', color:'var(--text-secondary)' }}>{r.sourceCode || '—'}</td>
                  <td style={{ padding:'0.6rem 0.75rem', fontSize:'0.78rem', color:'var(--text-secondary)' }}>{r.createdByName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={{ display:'flex', justifyContent:'center', gap:'0.4rem', padding:'0.75rem', borderTop:'1px solid var(--border-color)' }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={{ padding:'0.3rem 0.7rem', border:'1px solid var(--border-color)', borderRadius:5, background:'transparent', cursor:'pointer', fontSize:'0.8rem' }}>←</button>
              <span style={{ padding:'0.3rem 0.7rem', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{page} / {totalPages} · {total} bản ghi</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} style={{ padding:'0.3rem 0.7rem', border:'1px solid var(--border-color)', borderRadius:5, background:'transparent', cursor:'pointer', fontSize:'0.8rem' }}>→</button>
            </div>
          )}
        </div>
      )}
      {showAdd && <AddPriceModal products={products} suppliers={suppliers} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); setAlert('success', 'Đã ghi giá thủ công'); }} />}
    </div>
  );
}

function AddPriceModal({ products, suppliers, onClose, onSaved }) {
  const [form, setForm] = useState({ productId:'', supplierId:'', unitPrice:'', quantity:'', effectiveDate: new Date().toISOString().slice(0,10), note:'' });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = async () => {
    if (!form.productId) { setErr('Chọn sản phẩm'); return; }
    if (!form.unitPrice || Number(form.unitPrice) <= 0) { setErr('Nhập đơn giá hợp lệ'); return; }
    if (!form.effectiveDate) { setErr('Chọn ngày áp dụng'); return; }
    setSaving(true);
    try {
      await purchaseAPI.addPriceHistory({ productId:form.productId, supplierId:form.supplierId||null, unitPrice:form.unitPrice, quantity:form.quantity||0, effectiveDate:form.effectiveDate, note:form.note||null });
      onSaved();
    } catch (e) { setErr(e.response?.data?.message || 'Lỗi khi lưu'); }
    finally { setSaving(false); }
  };
  const inputStyle = { width:'100%', padding:'0.4rem 0.6rem', border:'1px solid var(--border-color)', borderRadius:6, fontSize:'0.84rem' };
  const labelStyle = { display:'block', fontSize:'0.78rem', fontWeight:600, marginBottom:'0.3rem', color:'var(--text-secondary)' };
  return (
    <Modal title="Ghi giá mua thủ công" onClose={onClose} size="md">
      {err && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'0.5rem 0.75rem', marginBottom:'0.75rem', color:'#dc2626', fontSize:'0.82rem' }}>{err}</div>}
      <div style={{ display:'grid', gap:'0.75rem' }}>
        <div><label style={labelStyle}>Sản phẩm *</label><select value={form.productId} onChange={e=>set('productId',e.target.value)} style={inputStyle}><option value="">-- Chọn sản phẩm --</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></div>
        <div><label style={labelStyle}>Nhà cung cấp</label><select value={form.supplierId} onChange={e=>set('supplierId',e.target.value)} style={inputStyle}><option value="">-- Chọn NCC (tùy chọn) --</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
          <div><label style={labelStyle}>Đơn giá (₫) *</label><input type="number" min="0" value={form.unitPrice} onChange={e=>set('unitPrice',e.target.value)} style={inputStyle} placeholder="0" /></div>
          <div><label style={labelStyle}>Số lượng</label><input type="number" min="0" value={form.quantity} onChange={e=>set('quantity',e.target.value)} style={inputStyle} placeholder="0" /></div>
        </div>
        <div><label style={labelStyle}>Ngày áp dụng *</label><input type="date" value={form.effectiveDate} onChange={e=>set('effectiveDate',e.target.value)} style={inputStyle} /></div>
        <div><label style={labelStyle}>Ghi chú</label><input type="text" value={form.note} onChange={e=>set('note',e.target.value)} style={inputStyle} placeholder="Ghi chú thêm..." /></div>
      </div>
      <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end', marginTop:'1rem' }}>
        <button onClick={onClose} disabled={saving} style={{ padding:'0.4rem 0.9rem', border:'1px solid var(--border-color)', borderRadius:6, background:'transparent', cursor:'pointer', fontSize:'0.82rem' }}>Huỷ</button>
        <button onClick={handleSave} disabled={saving} style={{ padding:'0.4rem 0.9rem', background:'#3b82f6', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:'0.82rem', fontWeight:600 }}>{saving ? 'Đang lưu...' : 'Lưu giá'}</button>
      </div>
    </Modal>
  );
}
