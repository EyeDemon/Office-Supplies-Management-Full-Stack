import React, { useState, useEffect, useCallback } from 'react';
import { purchaseAPI, warehouseAPI, analyticsAPI } from '@/services/api';
import { fmtNum } from './ProcurementHelpers';

export default function AutoPRTab({ setAlert }) {
  const [data,      setData]       = useState(null);
  const [loading,   setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selected,   setSelected]   = useState(new Set());
  const [warehouses, setWarehouses] = useState([]);
  const [filters,    setFilters]    = useState({ warehouseId: '', lookback: 90, horizon: 30 });

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const r = await analyticsAPI.getReplenishmentAnalysis(filters);
      setData(r.data?.data || null);
      setSelected(new Set());
    } catch { setAlert('error', 'Không thể tải phân tích thông minh'); }
    finally { setLoading(false); }
  }, [filters, setAlert]);

  useEffect(() => {
    warehouseAPI.getAllList().then(r => setWarehouses(r.data?.data || []));
  }, []);

  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  const items     = data?.items || [];
  const allIds    = new Set(items.map(r => r.productId));
  const allSel    = selected.size === allIds.size && allIds.size > 0;

  const toggleAll = () => setSelected(allSel ? new Set() : new Set(allIds));
  const toggle    = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleGenerate = async () => {
    const ids = [...selected];
    if (ids.length === 0) { setAlert('error', 'Vui lòng chọn ít nhất 1 sản phẩm'); return; }
    setGenerating(true);
    try {
      const prItems = items.filter(i => selected.has(i.productId)).map(i => ({
        productId: i.productId, quantity: i.suggestedQty
      }));
      const r = await purchaseAPI.createPR({ 
        reason: `AI Suggestion: Cần bổ sung cho ${filters.horizon} ngày tới`,
        priority: 'HIGH', items: prItems
      });
      setAlert('success', r.data?.message || 'Đã tạo PR thông minh thành công');
      loadAnalysis();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Tạo PR thất bại'); }
    finally { setGenerating(false); }
  };

  const ABC_COLOR = { A:'#ef4444', B:'#f59e0b', C:'#10b981' };
  const XYZ_COLOR = { X:'#3b82f6', Y:'#8b5cf6', Z:'#6b7280' };
  const STATUS_BG = { CRITICAL:'#fee2e2', WARNING:'#fef3c7', HEALTHY:'#dcfce7' };
  const STATUS_TEXT = { CRITICAL:'#b91c1c', WARNING:'#92400e', HEALTHY:'#15803d' };

  return (
    <div>
      <div style={{ background:'#fff', border:'1px solid var(--border-color)', borderRadius:10, padding:'1.25rem', marginBottom:'1rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h4 style={{ margin:0, fontSize:'1rem', fontWeight:700 }}>🤖 AI Replenishment Dashboard</h4>
            <p style={{ margin:'0.25rem 0 0', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Phân tích tốc độ tiêu thụ (Velocity) và dự báo nhu cầu dựa trên dữ liệu thực tế.</p>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            <select value={filters.warehouseId} onChange={e => setFilters(f => ({...f, warehouseId: e.target.value}))} style={{ padding:'0.4rem 0.75rem', border:'1px solid var(--border-color)', borderRadius:6, fontSize:'0.82rem' }}>
              <option value="">Tất cả kho</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div style={{ display:'flex', alignItems:'center', gap:'0.25rem', background:'var(--bg-secondary)', padding:'2px 8px', borderRadius:6 }}>
              <span style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>Phân tích:</span>
              <select value={filters.lookback} onChange={e => setFilters(f => ({...f, lookback: parseInt(e.target.value)}))} style={{ background:'transparent', border:'none', fontSize:'0.8rem', fontWeight:600 }}>
                <option value={30}>30 ngày</option><option value={90}>90 ngày</option><option value={180}>180 ngày</option>
              </select>
            </div>
            <button onClick={loadAnalysis} disabled={loading} className="btn" style={{ padding:'0.4rem 0.8rem' }}>🔄</button>
          </div>
        </div>
        {data && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'1rem', marginTop:'1.25rem' }}>
            {[
              { label: 'Sản phẩm phân tích', value: data.summary.totalAnalyzed, sub: 'Có giao dịch xuất kho' },
              { label: 'Mặt hàng nguy cấp',  value: data.summary.criticalItems, sub: 'DOI < 7 ngày', color:'#ef4444' },
              { label: 'Giá trị dự kiến nhập', value: Number(data.summary.potentialShortageValue).toLocaleString('vi-VN') + ' ₫', sub: `Để đủ dùng trong ${filters.horizon} ngày` },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background:'var(--bg-secondary)', padding:'1rem', borderRadius:8 }}>
                <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:'1.2rem', fontWeight:700, color: color || 'var(--text-primary)' }}>{value}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)', marginTop:2 }}>{sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {items.length > 0 && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <div style={{ fontSize:'0.85rem' }}>Đã chọn <strong>{selected.size}</strong> sản phẩm đề xuất</div>
          <button onClick={handleGenerate} disabled={generating || selected.size === 0} style={{ padding:'0.5rem 1.25rem', background:'#3b82f6', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:'0.85rem', fontWeight:600, display:'flex', alignItems:'center', gap:'0.5rem' }}>
            {generating ? '⏳ Đang tạo PR...' : `✨ Tạo PR thông minh cho ${selected.size} SP`}
          </button>
        </div>
      )}
      {loading ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>⏳ AI đang phân tích dữ liệu kho...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)', background:'#fff', border:'1px solid var(--border-color)', borderRadius:10 }}>
          <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>📊</div>
          <div style={{ fontWeight:600 }}>Không đủ dữ liệu phân tích</div>
          <div style={{ fontSize:'0.8rem', marginTop:'0.25rem' }}>Cần có lịch sử xuất kho trong {filters.lookback} ngày qua để dự báo</div>
        </div>
      ) : (
        <div className="table-container" style={{ background:'#fff', border:'1px solid var(--border-color)', borderRadius:10 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width:40, textAlign:'center' }}><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>
                <th>Sản phẩm</th><th style={{ textAlign:'center' }}>Phân loại</th><th style={{ textAlign:'center' }}>Tốc độ (ngày)</th><th style={{ textAlign:'center' }}>Tồn hiện tại</th><th style={{ textAlign:'center' }}>Dự báo (DOI)</th><th style={{ textAlign:'center' }}>Số lượng đề xuất</th>
              </tr>
            </thead>
            <tbody>
              {items.map(r => (
                <tr key={r.productId}>
                  <td style={{ textAlign:'center' }}><input type="checkbox" checked={selected.has(r.productId)} onChange={() => toggle(r.productId)} /></td>
                  <td><div style={{ fontWeight:600 }}>{r.name}</div><div style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>{r.sku}</div></td>
                  <td style={{ textAlign:'center' }}>
                    <div style={{ display:'flex', gap:'4px', justifyContent:'center' }}>
                      <span title="ABC" style={{ background:ABC_COLOR[r.abcClass]+'22', color:ABC_COLOR[r.abcClass], fontSize:'0.7rem', fontWeight:800, padding:'2px 6px', borderRadius:4, border:`1px solid ${ABC_COLOR[r.abcClass]}44` }}>{r.abcClass}</span>
                      <span title="XYZ" style={{ background:XYZ_COLOR[r.xyzClass]+'22', color:XYZ_COLOR[r.xyzClass], fontSize:'0.7rem', fontWeight:800, padding:'2px 6px', borderRadius:4, border:`1px solid ${XYZ_COLOR[r.xyzClass]}44` }}>{r.xyzClass}</span>
                    </div>
                  </td>
                  <td style={{ textAlign:'center', fontWeight:500 }}>{r.avgDailyVelocity}</td>
                  <td style={{ textAlign:'center' }}>{fmtNum(r.currentStock)}</td>
                  <td style={{ textAlign:'center' }}>
                    <div style={{ background: STATUS_BG[r.status], color: STATUS_TEXT[r.status], padding:'4px 8px', borderRadius:6, fontSize:'0.75rem', fontWeight:700, display:'inline-block' }}>
                      {r.doi >= 999 ? '∞' : `${r.doi} ngày`}
                    </div>
                  </td>
                  <td style={{ textAlign:'center' }}><span style={{ fontWeight:700, color:'#3b82f6', fontSize:'0.95rem' }}>{fmtNum(r.suggestedQty)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
