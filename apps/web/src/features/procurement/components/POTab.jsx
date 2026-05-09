import React, { useState, useEffect, useCallback } from 'react';
import { purchaseAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useConfirm } from '@/components/common/ConfirmModal';
import { SkeletonTable, SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import Modal from '@/components/common/Modal.jsx';
import { 
  fmtDate, fmtNum, fmtMoney, StatusBadge, 
  PR_STATUS_LABEL, PR_STATUS_COLOR, 
  PO_STATUS_LABEL, PO_STATUS_COLOR 
} from './ProcurementHelpers';
import POFormModal from './POFormModal';

export default function POTab({ setAlert }) {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { isManagerOrAdmin }    = useAuth();
  const [list, setList]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatus] = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [detail, setDetail]       = useState(null);
  const [detailLoading, setDL]    = useState(false);
  const [selectedPOs, setSelectedPOs] = useState(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [delayedLoading, setDLay] = useState(false);
  const limit = 15;

  useEffect(() => {
    let t;
    if (loading) t = setTimeout(() => setDLay(true), 200);
    else setDLay(false);
    return () => clearTimeout(t);
  }, [loading]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await purchaseAPI.getAllPO({ page, limit, status: statusFilter || undefined });
      setList(r.data?.data?.items || []);
      setTotal(r.data?.data?.total || 0);
      setSelectedPOs(new Set());
    } catch { setAlert('error', 'Lỗi tải danh sách PO'); }
    finally { setLoading(false); }
  }, [page, statusFilter, setAlert]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    setDL(true); setDetail(null);
    try {
      const r = await purchaseAPI.getPOById(id);
      setDetail(r.data?.data);
    } catch { setAlert('error', 'Lỗi tải chi tiết'); }
    finally { setDL(false); }
  };

  const doAction = async (fn, msg) => {
    try {
      const r = await fn();
      setAlert('success', r.data?.message || msg);
      setDetail(null); load();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Lỗi thao tác'); }
  };

  const draftPOsOnPage  = list.filter(po => po.status === 'DRAFT');
  const allPageSelected = draftPOsOnPage.length > 0 && draftPOsOnPage.every(po => selectedPOs.has(po.id));
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedPOs(prev => { const n = new Set(prev); draftPOsOnPage.forEach(po => n.delete(po.id)); return n; });
    } else {
      setSelectedPOs(prev => { const n = new Set(prev); draftPOsOnPage.forEach(po => n.add(po.id)); return n; });
    }
  };
  const toggleSelectOne = (id) => setSelectedPOs(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const handleBulkApprove = async () => {
    const ids = [...selectedPOs];
    const ok = await confirmDlg({
      title: `Xác nhận ${ids.length} đơn mua hàng`,
      message: `Xác nhận hàng loạt ${ids.length} PO DRAFT đã chọn (DRAFT → CONFIRMED)?`,
      variant: 'primary',
    });
    if (!ok) return;
    setBulkApproving(true);
    try {
      const r = await purchaseAPI.bulkApprovePO(ids);
      setAlert('success', r.data?.message || `Đã xác nhận ${ids.length} PO`);
      load();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Lỗi xác nhận hàng loạt'); }
    finally { setBulkApproving(false); }
  };

  const handleExport = async () => {
    try {
      const r = await purchaseAPI.exportPOCsv({ status: statusFilter });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'don_mua_hang.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { setAlert('error', 'Lỗi xuất CSV'); }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', justifyContent:'space-between', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
          <select className="form-control" style={{ width:180 }} value={statusFilter} onChange={e=>{ setStatus(e.target.value); setPage(1); }}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(PO_STATUS_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          {isManagerOrAdmin && selectedPOs.size > 0 && (
            <button className="btn btn-primary" onClick={handleBulkApprove} disabled={bulkApproving} style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
              {bulkApproving ? '⏳ Đang xác nhận...' : `✓ Xác nhận ${selectedPOs.size} đã chọn`}
            </button>
          )}
        </div>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button className="btn" onClick={handleExport}>↓ Xuất CSV</button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Tạo PO</button>
        </div>
      </div>

      {delayedLoading ? (
        <SkeletonTable headers={['','Mã PO','Trạng thái','Nhà cung cấp','PR gốc','Tổng tiền','Ngày giao','Ngày tạo','Thao tác']} rows={5} />
      ) : (
        <div className="data-card">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  {isManagerOrAdmin && draftPOsOnPage.length > 0 && <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />}
                </th>
                <th>Mã PO</th><th>Trạng thái</th><th>Nhà cung cấp</th><th>PR gốc</th>
                <th className="text-end">Tổng tiền</th><th>Ngày giao</th><th>Ngày tạo</th><th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={9}><EmptyState icon="purchase" message="Chưa có đơn mua hàng" sub="Đơn mua hàng thường được tạo từ các PR đã phê duyệt" /></td></tr>
              ) : list.map(po => (
                <tr key={po.id} className={selectedPOs.has(po.id) ? 'table-active' : ''}>
                  <td className="text-center">{isManagerOrAdmin && po.status === 'DRAFT' && <input type="checkbox" checked={selectedPOs.has(po.id)} onChange={() => toggleSelectOne(po.id)} />}</td>
                  <td style={{ verticalAlign:'middle' }}><strong>{po.po_code}</strong></td>
                  <td style={{ verticalAlign:'middle' }}><StatusBadge s={po.status} map={PO_STATUS_LABEL} colors={PO_STATUS_COLOR} /></td>
                  <td style={{ verticalAlign:'middle' }}>{po.supplier_name}</td>
                  <td style={{ verticalAlign:'middle' }}><span className="text-muted" style={{ fontSize:'0.8rem' }}>{po.pr_code || '—'}</span></td>
                  <td className="text-end" style={{ verticalAlign:'middle', fontWeight:600, color:'var(--brand-primary)' }}>{fmtMoney(po.total_amount)}</td>
                  <td style={{ verticalAlign:'middle' }}>{po.delivery_date ? new Date(po.delivery_date).toLocaleDateString('vi-VN') : '—'}</td>
                  <td style={{ verticalAlign:'middle' }}>{fmtDate(po.created_at)}</td>
                  <td className="text-end" style={{ verticalAlign:'middle' }}><button className="btn btn-sm btn-outline-primary" onClick={() => openDetail(po.id)}>Chi tiết</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:'0.5rem', marginTop:'1rem' }}>
          <button className="btn btn-sm" onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}>←</button>
          <span style={{ lineHeight:'2rem', fontSize:'0.85rem' }}>{page} / {totalPages}</span>
          <button className="btn btn-sm" onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>→</button>
        </div>
      )}

      {(detail || detailLoading) && (
        <Modal title={detail ? `Chi tiết: ${detail.po_code}` : 'Đang tải...'} onClose={() => setDetail(null)} size="lg">
          {detailLoading ? (
            <table className="data-table"><tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} cols={2} />)}</tbody></table>
          ) : detail && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'1rem' }}>
                {[
                  ['Mã PO', detail.po_code], ['Trạng thái', <StatusBadge s={detail.status} map={PO_STATUS_LABEL} colors={PO_STATUS_COLOR} />],
                  ['Nhà cung cấp', detail.supplier_name], ['SĐT NCC', detail.supplier_phone||'—'],
                  ['Tổng tiền', <strong>{fmtMoney(detail.total_amount)}</strong>], ['PR gốc', detail.pr_code||'—'],
                  ['Người tạo', detail.created_by_name], ['Ngày tạo', fmtDate(detail.created_at)],
                  detail.confirmed_by_name && ['Người xác nhận', detail.confirmed_by_name],
                  detail.confirmed_at && ['Ngày xác nhận', fmtDate(detail.confirmed_at)],
                  detail.received_by_name && ['Người nhận hàng', detail.received_by_name],
                  detail.received_at && ['Ngày nhận hàng', fmtDate(detail.received_at)],
                  detail.delivery_date && ['Ngày giao dự kiến', new Date(detail.delivery_date).toLocaleDateString('vi-VN')],
                ].filter(Boolean).map(([k,v]) => (
                  <div key={k} style={{ background:'var(--bg-secondary)', borderRadius:6, padding:'0.5rem 0.75rem' }}>
                    <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:2 }}>{k}</div>
                    <div style={{ fontWeight:500, fontSize:'0.85rem' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontWeight:600, marginBottom:'0.5rem', fontSize:'0.9rem' }}>Sản phẩm trong đơn ({detail.items?.length||0})</div>
              <table className="data-table" style={{ marginBottom:'1rem' }}>
                <thead><tr><th>Sản phẩm</th><th>SKU</th><th style={{ textAlign:'right' }}>SL</th><th style={{ textAlign:'right' }}>Đơn giá</th><th style={{ textAlign:'right' }}>Thành tiền</th></tr></thead>
                <tbody>
                  {(detail.items||[]).map(item => (
                    <tr key={item.id}>
                      <td>{item.product_name}</td>
                      <td style={{ color:'var(--text-secondary)', fontSize:'0.8rem' }}>{item.sku}</td>
                      <td style={{ textAlign:'right' }}>{fmtNum(item.quantity)}</td>
                      <td style={{ textAlign:'right' }}>{fmtMoney(item.unit_price)}</td>
                      <td style={{ textAlign:'right', fontWeight:600 }}>{fmtMoney(item.total_price)}</td>
                    </tr>
                  ))}
                  <tr style={{ background:'var(--bg-secondary)', fontWeight:700 }}>
                    <td colSpan={4} style={{ textAlign:'right' }}>Tổng cộng:</td>
                    <td style={{ textAlign:'right', color:'var(--primary)' }}>{fmtMoney(detail.total_amount)}</td>
                  </tr>
                </tbody>
              </table>
              {isManagerOrAdmin && (
                <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end', flexWrap:'wrap' }}>
                  {detail.status === 'DRAFT' && (
                    <button className="btn btn-primary" onClick={() => confirmDlg({ title: 'Xác nhận PO', message: 'Xác nhận đơn mua hàng này?', variant: 'primary' }).then(ok => { if (ok) doAction(() => purchaseAPI.confirmPO(detail.id), 'Đã xác nhận PO'); })}>✓ Xác nhận PO</button>
                  )}
                  {detail.status === 'CONFIRMED' && (
                    <button className="btn btn-success" onClick={() => {
                      const whId = detail.warehouse_id;
                      const msg = whId ? `Nhận hàng vào kho "${detail.warehouse_name || `#${whId}`}" và nhập kho tự động?` : 'PO chưa có kho đích. Vui lòng sửa PO để chọn kho trước khi nhận hàng.';
                      confirmDlg({ title:'Nhận hàng', message:msg, variant:whId ? 'success' : 'warning' }).then(ok => { if (!ok || !whId) return; doAction(() => purchaseAPI.receivePO(detail.id, whId), 'Đã nhận hàng — tồn kho đã cập nhật'); });
                    }}>📦 Nhận hàng & nhập kho</button>
                  )}
                  {['DRAFT','CONFIRMED'].includes(detail.status) && (
                    <button className="btn btn-danger" onClick={() => confirmDlg({ title: 'Huỷ đơn mua hàng', message: 'Huỷ đơn mua hàng này?', variant: 'danger' }).then(ok => { if (ok) doAction(() => purchaseAPI.cancelPO(detail.id), 'Đã huỷ PO'); })}>✕ Huỷ PO</button>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {showForm && <POFormModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} setAlert={setAlert} />}
      <ConfirmDialog />
    </div>
  );
}
