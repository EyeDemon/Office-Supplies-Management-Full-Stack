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
  PO_STATUS_LABEL, PO_STATUS_COLOR, 
  PRIORITY_LABEL, PRIORITY_COLOR 
} from './ProcurementHelpers';
import { PRFormModal, SuggestModal } from './PRFormModal';

export default function PRTab({ setAlert }) {
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
  const [rejectId, setRejectId]   = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showSuggest, setShowSuggest]   = useState(false);
  const [selectedPRs, setSelectedPRs] = useState(new Set());
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
      const r = await purchaseAPI.getAllPR({ page, limit, status: statusFilter || undefined });
      setList(r.data?.data?.items || []);
      setTotal(r.data?.data?.total || 0);
      setSelectedPRs(new Set());
    } catch { setAlert('error', 'Lỗi tải danh sách PR'); }
    finally { setLoading(false); }
  }, [page, statusFilter, setAlert]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    setDL(true); setDetail(null);
    try {
      const r = await purchaseAPI.getPRById(id);
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

  const pendingPRsOnPage = list.filter(pr => pr.status === 'PENDING');
  const allPageSelected  = pendingPRsOnPage.length > 0 && pendingPRsOnPage.every(pr => selectedPRs.has(pr.id));
  const toggleSelectAll  = () => {
    if (allPageSelected) {
      setSelectedPRs(prev => {
        const next = new Set(prev);
        pendingPRsOnPage.forEach(pr => next.delete(pr.id));
        return next;
      });
    } else {
      setSelectedPRs(prev => {
        const next = new Set(prev);
        pendingPRsOnPage.forEach(pr => next.add(pr.id));
        return next;
      });
    }
  };
  const toggleSelectOne = (id) => setSelectedPRs(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const handleBulkApprove = async () => {
    const ids = [...selectedPRs];
    const ok = await confirmDlg({
      title: `Phê duyệt ${ids.length} yêu cầu mua hàng`,
      message: `Xác nhận phê duyệt hàng loạt ${ids.length} PR đã chọn?`,
      variant: 'primary',
    });
    if (!ok) return;
    setBulkApproving(true);
    try {
      const r = await purchaseAPI.bulkApprovePR(ids);
      setAlert('success', r.data?.message || `Đã phê duyệt ${ids.length} PR`);
      load();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Lỗi phê duyệt hàng loạt'); }
    finally { setBulkApproving(false); }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', justifyContent:'space-between', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
          <select className="form-control" style={{ width:170 }} value={statusFilter} onChange={e=>{ setStatus(e.target.value); setPage(1); }}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(PR_STATUS_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          {isManagerOrAdmin && selectedPRs.size > 0 && (
            <button className="btn btn-success" onClick={handleBulkApprove} disabled={bulkApproving} style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
              {bulkApproving ? '⏳ Đang duyệt...' : `✓ Phê duyệt ${selectedPRs.size} đã chọn`}
            </button>
          )}
        </div>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button className="btn" onClick={() => setShowSuggest(true)}>💡 Gợi ý từ tồn thấp</button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Tạo PR</button>
        </div>
      </div>

      {delayedLoading ? (
        <SkeletonTable headers={['','Mã PR','Trạng thái','Ưu tiên','Lý do','Số SP','Người tạo','Ngày tạo','Thao tác']} rows={5} />
      ) : (
        <div className="data-card">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  {isManagerOrAdmin && pendingPRsOnPage.length > 0 && (
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                  )}
                </th>
                <th>Mã PR</th><th>Trạng thái</th><th>Ưu tiên</th><th>Lý do</th>
                <th className="text-center">Số SP</th><th>Người tạo</th><th>Ngày tạo</th><th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={9}><EmptyState icon="purchase" message="Chưa có yêu cầu mua hàng" sub="Nhấn '+ Tạo PR' để bắt đầu quy trình mua sắm" cta={isManagerOrAdmin ? '+ Tạo PR' : undefined} onCta={isManagerOrAdmin ? () => setShowForm(true) : undefined} /></td></tr>
              ) : list.map(pr => (
                <tr key={pr.id} className={selectedPRs.has(pr.id) ? 'table-active' : ''}>
                  <td className="text-center">{isManagerOrAdmin && pr.status === 'PENDING' && <input type="checkbox" checked={selectedPRs.has(pr.id)} onChange={() => toggleSelectOne(pr.id)} />}</td>
                  <td style={{ verticalAlign:'middle' }}><strong>{pr.pr_code}</strong></td>
                  <td style={{ verticalAlign:'middle' }}><StatusBadge s={pr.status} map={PR_STATUS_LABEL} colors={PR_STATUS_COLOR} /></td>
                  <td style={{ verticalAlign:'middle' }}><span className="status-badge" style={{ background: PRIORITY_COLOR[pr.priority] + '15', color: PRIORITY_COLOR[pr.priority] }}>{PRIORITY_LABEL[pr.priority] || pr.priority}</span></td>
                  <td style={{ verticalAlign:'middle' }}><div style={{ maxWidth:200, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{pr.reason}</div></td>
                  <td className="text-center" style={{ verticalAlign:'middle' }}>{pr.item_count || 0}</td>
                  <td style={{ verticalAlign:'middle' }}>{pr.requested_by_name}</td>
                  <td style={{ verticalAlign:'middle' }}>{fmtDate(pr.created_at)}</td>
                  <td className="text-end" style={{ verticalAlign:'middle' }}><button className="btn btn-sm btn-outline-primary" onClick={() => openDetail(pr.id)}>Chi tiết</button></td>
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
        <Modal title={detail ? `Chi tiết: ${detail.pr_code}` : 'Đang tải...'} onClose={() => setDetail(null)} size="lg">
          {detailLoading ? (
            <table className="data-table"><tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} cols={2} />)}</tbody></table>
          ) : detail && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'1rem' }}>
                {[
                  ['Mã PR', detail.pr_code],
                  ['Trạng thái', <StatusBadge s={detail.status} map={PR_STATUS_LABEL} colors={PR_STATUS_COLOR} />],
                  ['Ưu tiên', <span style={{ color:PRIORITY_COLOR[detail.priority], fontWeight:600 }}>{PRIORITY_LABEL[detail.priority]}</span>],
                  ['Người yêu cầu', detail.requested_by_name], ['Ngày tạo', fmtDate(detail.created_at)],
                  detail.approved_by_name && ['Người duyệt', detail.approved_by_name],
                  detail.approved_at && ['Ngày duyệt', fmtDate(detail.approved_at)],
                  detail.reject_reason && ['Lý do từ chối', detail.reject_reason],
                ].filter(Boolean).map(([k,v]) => (
                  <div key={k} style={{ background:'var(--bg-secondary)', borderRadius:6, padding:'0.5rem 0.75rem' }}>
                    <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:2 }}>{k}</div>
                    <div style={{ fontWeight:500, fontSize:'0.85rem' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:'var(--bg-secondary)', borderRadius:6, padding:'0.5rem 0.75rem', marginBottom:'1rem' }}>
                <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:2 }}>Lý do mua hàng</div>
                <div style={{ fontSize:'0.85rem' }}>{detail.reason}</div>
              </div>
              <div style={{ fontWeight:600, marginBottom:'0.5rem', fontSize:'0.9rem' }}>Sản phẩm yêu cầu ({detail.items?.length||0})</div>
              <table className="data-table" style={{ marginBottom:'1rem' }}>
                <thead><tr><th>Sản phẩm</th><th>SKU</th><th style={{ textAlign:'right' }}>Tồn kho</th><th style={{ textAlign:'right' }}>SL yêu cầu</th></tr></thead>
                <tbody>
                  {(detail.items||[]).map(item => (
                    <tr key={item.id}>
                      <td>{item.product_name}</td>
                      <td style={{ color:'var(--text-secondary)', fontSize:'0.8rem' }}>{item.sku}</td>
                      <td style={{ textAlign:'right', color: item.stock_quantity <= item.min_stock_level ? '#ef4444' : 'inherit' }}>{fmtNum(item.stock_quantity)}</td>
                      <td style={{ textAlign:'right', fontWeight:600 }}>{fmtNum(item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(detail.linked_pos||[]).length > 0 && (
                <>
                  <div style={{ fontWeight:600, marginBottom:'0.5rem', fontSize:'0.9rem' }}>PO liên kết</div>
                  <table className="data-table" style={{ marginBottom:'1rem' }}>
                    <thead><tr><th>Mã PO</th><th>Trạng thái</th><th>Nhà cung cấp</th><th style={{ textAlign:'right' }}>Tổng tiền</th></tr></thead>
                    <tbody>{detail.linked_pos.map(po => (
                      <tr key={po.id}>
                        <td><strong>{po.po_code}</strong></td>
                        <td><StatusBadge s={po.status} map={PO_STATUS_LABEL} colors={PO_STATUS_COLOR} /></td>
                        <td>{po.supplier_name}</td>
                        <td style={{ textAlign:'right' }}>{fmtMoney(po.total_amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </>
              )}
              <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end', flexWrap:'wrap' }}>
                {detail.status === 'PENDING' && (
                  <>
                    <button className="btn btn-success" onClick={() => doAction(() => purchaseAPI.approvePR(detail.id), 'Đã phê duyệt PR')}>✓ Phê duyệt</button>
                    <button className="btn btn-danger" onClick={() => { setRejectId(detail.id); setRejectReason(''); }}>✕ Từ chối</button>
                  </>
                )}
                {['PENDING','APPROVED'].includes(detail.status) && (
                  <button className="btn" onClick={() => confirmDlg({ title: 'Huỷ yêu cầu', message: 'Huỷ yêu cầu mua hàng này?', variant: 'danger' }).then(ok => { if (ok) doAction(() => purchaseAPI.cancelPR(detail.id), 'Đã huỷ PR'); })}>Huỷ PR</button>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {rejectId && (
        <Modal title="Từ chối yêu cầu mua hàng" onClose={() => setRejectId(null)} size="sm">
          <div style={{ marginBottom:'1rem' }}>
            <label className="form-label">Lý do từ chối *</label>
            <textarea className="form-control" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
            <button className="btn" onClick={() => setRejectId(null)}>Huỷ</button>
            <button className="btn btn-danger" onClick={() => {
              if (!rejectReason.trim()) { setAlert('error', 'Vui lòng nhập lý do'); return; }
              doAction(() => purchaseAPI.rejectPR(rejectId, { rejectionNote: rejectReason }), 'Đã từ chối');
              setRejectId(null);
            }}>Xác nhận</button>
          </div>
        </Modal>
      )}

      {showForm && <PRFormModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} setAlert={setAlert} />}
      {showSuggest && <SuggestModal onClose={() => setShowSuggest(false)} setAlert={setAlert} onCreated={() => { setShowSuggest(false); load(); }} />}
      <ConfirmDialog />
    </div>
  );
}
