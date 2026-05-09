import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Row, Col, Card, Table, Badge, Button, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { requisitionAPI } from '@/services/api';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoCheck, IcoX, IcoRefresh, IcoArrowRight, IcoInbox } from '@/components/common/Icons.jsx';

// Refactored components
import RequisitionDetailModal from '../components/RequisitionDetailModal';
import { RequisitionApproveModal, RequisitionRejectModal, BulkRejectModal } from '../components/RequisitionApprovalModals';

const PAGE_SIZE = 20;
const STATUS_CONFIG = {
  PENDING:             { label: 'Chờ duyệt',     variant: 'warning'  },
  APPROVED:            { label: 'Chờ kho xuất',   variant: 'info'     },
  WAREHOUSE_CONFIRMED: { label: 'Kho đã xuất',    variant: 'success'  },
  REJECTED:            { label: 'Từ chối',         variant: 'danger'   },
  CANCELLED:           { label: 'Đã hủy',          variant: 'secondary'},
};
const StatusBadge = ({ status }) => {
  const c = STATUS_CONFIG[status] || { label: status, variant: 'secondary' };
  return <Badge className={`badge-${c.variant}`} style={{ fontSize: '.65rem', fontWeight: 700, padding: '4px 8px' }}>{c.label.toUpperCase()}</Badge>;
};
const fmtD  = d => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

export default function RequisitionApproval() {
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(0);
  const [statusFilter, setStatus] = useState('PENDING');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const checkAllRef = useRef(null);

  const [approveId, setApproveId]     = useState(null);
  const [rejectItem, setRejectItem]   = useState(null);
  const [detailId, setDetailId]       = useState(null);
  const [showBulkReject, setShowBulkReject] = useState(false);

  const { toasts, dismiss, showToast, showUndoToast, showErrorToast } = useToast();
  const undoTimerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params = { page, size: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await requisitionAPI.getAll(params);
      const d = res.data.data;
      setItems(d.items);
      setTotal(d.totalCount);
    } catch { showErrorToast('Không thể tải danh sách phiếu'); }
    finally { setLoading(false); }
  }, [page, statusFilter, dateFrom, dateTo, showErrorToast]);

  useEffect(() => { load(); }, [load]);

  const pendingItems = items.filter(r => r.status === 'PENDING');
  const allSelected  = pendingItems.length > 0 && pendingItems.every(r => selectedIds.has(r.id));
  const someSelected = pendingItems.some(r => selectedIds.has(r.id));
  useEffect(() => {
    if (checkAllRef.current) checkAllRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(pendingItems.map(r => r.id)));
  const toggleOne = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedCount = selectedIds.size;

  const handleBulkApprove = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const ids = [...selectedIds];
    setBulkLoading(true);
    showUndoToast(`Sắp duyệt ${ids.length} phiếu yêu cầu...`, () => {
      clearTimeout(undoTimerRef.current); setBulkLoading(false); showToast('Đã hoàn tác — không có phiếu nào được duyệt', { variant: 'info' });
    }, { variant: 'success', duration: 5500, undoLabel: 'Hoàn tác' });
    undoTimerRef.current = setTimeout(async () => {
      try {
        const res = await requisitionAPI.bulkApprove(ids);
        showToast(`✅ Đã duyệt ${res.data.data?.approvedCount || ids.length} phiếu`, { variant: 'success' });
        load();
      } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi khi duyệt hàng loạt'); }
      finally { setBulkLoading(false); }
    }, 5000);
  };

  const handleBulkRejectConfirm = (reason) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const ids = [...selectedIds];
    setBulkLoading(true); setShowBulkReject(false);
    showUndoToast(`Sắp từ chối ${ids.length} phiếu yêu cầu...`, () => {
      clearTimeout(undoTimerRef.current); setBulkLoading(false); showToast('Đã hoàn tác — không có phiếu nào bị từ chối', { variant: 'info' });
    }, { variant: 'warning', duration: 5500, undoLabel: 'Hoàn tác' });
    undoTimerRef.current = setTimeout(async () => {
      try {
        const res = await requisitionAPI.bulkReject(ids, reason);
        showToast(`❌ Đã từ chối ${res.data.data?.rejectedCount || ids.length} phiếu`, { variant: 'warning' });
        load();
      } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi khi từ chối hàng loạt'); }
      finally { setBulkLoading(false); }
    }, 5000);
  };

  const handleSuccess = (msg) => {
    setApproveId(null); setRejectItem(null); setDetailId(null);
    showToast(msg, { variant:'success' }); load();
  };

  const totalPages   = Math.ceil(total / PAGE_SIZE);
  const pendingCount = statusFilter === 'PENDING' ? total : null;

  return (
    <div>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <div className="page-header">
        <div>
          <h1 className="page-title">Phê duyệt yêu cầu {pendingCount > 0 && <span className="ms-3 badge rounded-pill bg-danger" style={{ fontSize:'.65rem' }}>{pendingCount} CHỜ DUYỆT</span>}</h1>
          <p className="page-subtitle">Phê duyệt hoặc từ chối các yêu cầu cấp phát văn phòng phẩm từ nhân viên</p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/requisitions" className="btn btn-outline-secondary btn-sm" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><IcoArrowRight size={14} style={{ transform: 'rotate(180deg)' }}/> DANH SÁCH PHIẾU</Link>
          <Button size="sm" variant="outline-secondary" onClick={load} disabled={loading} style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><IcoRefresh size={14}/> LÀM MỚI</Button>
        </div>
      </div>
      {selectedCount > 0 && (
        <div className="d-flex align-items-center gap-2 mb-3 px-3 py-2 rounded" style={{ background:'#e8f4fd', border:'1px solid #b6d4fe', fontSize:'.85rem' }}>
          <span className="fw-semibold text-primary">{selectedCount} phiếu đang chọn</span>
          <div className="ms-auto d-flex gap-2">
            <Button size="sm" variant="success" onClick={handleBulkApprove} disabled={bulkLoading} style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}><IcoCheck size={14}/> PHÊ DUYỆT TẤT CẢ ({selectedCount})</Button>
            <Button size="sm" variant="outline-danger" onClick={() => setShowBulkReject(true)} disabled={bulkLoading} style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}><IcoX size={14}/> TỪ CHỐI TẤT CẢ ({selectedCount})</Button>
            <Button size="sm" variant="outline-secondary" onClick={() => setSelectedIds(new Set())} disabled={bulkLoading}>Bỏ chọn</Button>
          </div>
        </div>
      )}
      <Card className="shadow-sm">
        <Card.Body className="pb-0">
          <Row className="g-2 mb-3 align-items-end">
            <Col md={3}>
              <Form.Label className="mb-1" style={{ fontSize:'.78rem', color:'var(--text-secondary)' }}>Trạng thái</Form.Label>
              <Form.Select size="sm" value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(0); }}>
                <option value="">Tất cả</option><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option><option value="CANCELLED">Đã hủy</option>
              </Form.Select>
            </Col>
            <Col md={2}><Form.Label className="mb-1" style={{ fontSize:'.78rem', color:'var(--text-secondary)' }}>Từ ngày</Form.Label><Form.Control type="date" size="sm" value={dateFrom} max={dateTo||undefined} onChange={e => { setDateFrom(e.target.value); setPage(0); }} /></Col>
            <Col md={2}><Form.Label className="mb-1" style={{ fontSize:'.78rem', color:'var(--text-secondary)' }}>Đến ngày</Form.Label><Form.Control type="date" size="sm" value={dateTo} min={dateFrom||undefined} onChange={e => { setDateTo(e.target.value); setPage(0); }} /></Col>
            {(dateFrom||dateTo) && <Col md="auto"><Button size="sm" variant="outline-secondary" onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }}>Xóa lọc</Button></Col>}
            <Col className="text-end"><small className="text-muted">Tổng: {total} phiếu</small></Col>
          </Row>
          {loading ? (
            <SkeletonTable headers={['','Mã phiếu','Người yêu cầu','Mặt hàng','Trạng thái','Ngày tạo','Ngày xử lý','Thao tác']} rows={8} />
          ) : (
            <Table hover responsive className="mb-0" style={{ fontSize:'.85rem' }}>
              <thead className="table-light">
                <tr>
                  <th style={{ width:40 }}>{statusFilter === 'PENDING' && pendingItems.length > 0 && <Form.Check type="checkbox" ref={checkAllRef} checked={allSelected} onChange={toggleAll} />}</th>
                  <th>Mã phiếu</th><th>Người yêu cầu</th><th className="text-center">Mặt hàng</th><th className="text-center">Trạng thái</th><th>Ngày tạo</th><th>Ngày xử lý</th><th className="text-end">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={8}><EmptyState icon={statusFilter === 'PENDING' ? 'ok' : 'request'} message={statusFilter === 'PENDING' ? 'Không còn phiếu nào chờ duyệt' : 'Chưa có phiếu nào phù hợp'} sub={statusFilter === 'PENDING' ? 'Tất cả phiếu đã được xử lý' : 'Thử thay đổi bộ lọc để tìm kiếm'} /></td></tr>
                )}
                {items.map(r => {
                  const isPending = r.status === 'PENDING';
                  const isSel = selectedIds.has(r.id);
                  return (
                    <tr key={r.id} className={isSel ? 'table-primary' : ''}>
                      <td>{isPending && <Form.Check type="checkbox" checked={isSel} onChange={() => toggleOne(r.id)} />}</td>
                      <td><code className="text-primary">{r.reqCode}</code></td><td>{r.requesterName || '—'}</td><td className="text-center">{r.itemCount}</td><td className="text-center"><StatusBadge status={r.status}/></td><td>{fmtD(r.createdAt)}</td><td>{fmtD(r.approvedAt||r.rejectedAt||r.warehouseConfirmedAt||r.cancelledAt)}</td>
                      <td className="text-end">
                        <div className="d-flex justify-content-end gap-3">
                          <button className="btn btn-link btn-sm p-0 d-flex align-items-center gap-1" style={{ textDecoration: 'none', fontWeight: 600, fontSize: '.75rem' }} onClick={() => setDetailId(r.id)}><IcoInbox size={12}/> CHI TIẾT</button>
                          {isPending && (
                            <>
                              <button className="btn btn-link btn-sm p-0 text-success d-flex align-items-center gap-1" style={{ textDecoration: 'none', fontWeight: 600, fontSize: '.75rem' }} onClick={() => setApproveId(r.id)}><IcoCheck size={12}/> PHÊ DUYỆT</button>
                              <button className="btn btn-link btn-sm p-0 text-danger d-flex align-items-center gap-1" style={{ textDecoration: 'none', fontWeight: 600, fontSize: '.75rem' }} onClick={() => setRejectItem({ id:r.id, reqCode:r.reqCode })}><IcoX size={12}/> TỪ CHỐI</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {totalPages > 1 && (
          <Card.Footer className="d-flex justify-content-between align-items-center">
            <Button size="sm" variant="outline-secondary" disabled={page===0} onClick={() => setPage(p=>p-1)}>← Trước</Button>
            <small>Trang {page+1} / {totalPages}</small>
            <Button size="sm" variant="outline-secondary" disabled={page>=totalPages-1} onClick={() => setPage(p=>p+1)}>Sau →</Button>
          </Card.Footer>
        )}
      </Card>
      {detailId   && <RequisitionDetailModal id={detailId} onClose={() => setDetailId(null)} />}
      {approveId  && <RequisitionApproveModal id={approveId} onClose={() => setApproveId(null)} onSuccess={handleSuccess} />}
      {rejectItem && <RequisitionRejectModal id={rejectItem.id} reqCode={rejectItem.reqCode} onClose={() => setRejectItem(null)} onSuccess={handleSuccess} />}
      {showBulkReject && <BulkRejectModal count={selectedCount} onClose={() => setShowBulkReject(false)} onConfirm={handleBulkRejectConfirm} />}
    </div>
  );
}