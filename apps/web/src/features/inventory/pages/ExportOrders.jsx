// page/ExportOrders.js — v63 (Refactored: Modularized for Maintainability)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Row, Col, Form, Badge, Modal, Button, Spinner, Pagination, Alert } from 'react-bootstrap';
import { exportOrderAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { useConfirm } from '@/components/common/ConfirmModal';
import { IcoPlus, IcoDownload, IcoCheck, IcoX } from '@/components/common/Icons.jsx';

// Sub-components
import PartialFulfillmentModal from '../components/PartialFulfillmentModal';
import ExportOrderDetail       from '../components/ExportOrderDetail';
import ExportOrderForm        from '../components/ExportOrderForm';

const STATUS_MAP = {
  DRAFT:     { label: 'Nháp',       cls: 'badge-neutral' },
  PENDING:   { label: 'Chờ duyệt',  cls: 'badge-warning' },
  APPROVED:  { label: 'Đã duyệt',   cls: 'badge-info'    },
  COMPLETED: { label: 'Đã xuất',    cls: 'badge-success' },
  CANCELLED: { label: 'Đã huỷ',     cls: 'badge-danger'  },
};

const ExportOrders = () => {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { isManagerOrAdmin } = useAuth();
  const { toasts, dismiss, showToast, showUndoToast, showErrorToast } = useToast();
  
  const [orders, setOrders]       = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [statusF, setStatus]      = useState('');
  const [search, setSearch]       = useState('');
  const [actionLoading, setAL]    = useState(false);
  const undoTimerRef = useRef(null);

  const [showForm, setShowForm]   = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [detailId, setDetailId]   = useState(null);
  const [detail, setDetail]       = useState(null);
  const [detailLoading, setDL]    = useState(false);

  // Modals
  const [rejectModal, setRejectModal] = useState({ open: false, orderId: null, orderCode: '' });
  const [rejectReason, setRejectReason] = useState('');
  const [cancelModal, setCancelModal] = useState({ open: false, orderId: null, orderCode: '' });
  const [cancelReason, setCancelReason] = useState('');
  const [partialModal, setPartialModal] = useState({ open: false, orderId: null });

  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await exportOrderAPI.getAll({
        page: page + 1, limit,
        status: statusF || undefined,
        search: search || undefined,
      });
      setOrders(r.data?.data?.items || []);
      setTotal(r.data?.data?.total || 0);
    } catch { showToast('Lỗi tải danh sách phiếu xuất', { variant: 'danger' }); }
    finally { setLoading(false); }
  }, [page, statusF, search, showToast]);

  useEffect(() => { load(); }, [load]);

  const refreshDetail = async (id) => {
    try {
      const r = await exportOrderAPI.getById(id);
      setDetail(r.data?.data);
    } catch { /* ignore */ }
  };

  const openDetail = async (id) => {
    setDetailId(id);
    setDL(true); setDetail(null);
    try {
      const r = await exportOrderAPI.getById(id);
      setDetail(r.data?.data);
    } catch { showToast('Lỗi tải chi tiết phiếu', { variant: 'danger' }); }
    finally { setDL(false); }
  };

  const handleCreate = () => { setEditOrder(null); setShowForm(true); };
  const handleEdit   = (o) => { setEditOrder(o); setShowForm(true); setDetailId(null); setDetail(null); };

  const onActionSuccess = (msg, id) => {
    showToast(msg, { variant: 'success' });
    if (id) refreshDetail(id);
    load();
  };

  const handleActionWithUndo = (id, orderCode, actionType) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    
    const config = {
      submit:   { label: 'Đang gửi duyệt', variant: 'primary', api: exportOrderAPI.submit },
      approve:  { label: 'Đã duyệt phiếu', variant: 'success', api: exportOrderAPI.approve },
      complete: { label: 'Đang hoàn tất xuất kho', variant: 'warning', api: exportOrderAPI.complete },
    };
    
    const { label, variant, api } = config[actionType];

    showUndoToast(
      `${label} ${orderCode || id}...`,
      () => {
        clearTimeout(undoTimerRef.current);
        showToast('Đã hoàn tác thao tác', { variant: 'info' });
      },
      { variant, duration: 5500 }
    );

    undoTimerRef.current = setTimeout(async () => {
      setAL(true);
      try {
        const r = await api(id);
        onActionSuccess(r.data?.message || `Thao tác thành công cho ${orderCode}`, id);
      } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi thao tác'); }
      finally { setAL(false); }
    }, 5000);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setAL(true);
    try {
      await exportOrderAPI.reject(rejectModal.orderId, { reason: rejectReason.trim() });
      setRejectModal({ open: false });
      onActionSuccess(`Đã từ chối phiếu ${rejectModal.orderCode}`, rejectModal.orderId);
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi từ chối'); }
    finally { setAL(false); }
  };

  const handleCancelConfirm = async () => {
    setAL(true);
    try {
      await exportOrderAPI.cancel(cancelModal.orderId, { reason: cancelReason.trim() || undefined });
      setCancelModal({ open: false });
      onActionSuccess(`Đã hủy phiếu ${cancelModal.orderCode}`, cancelModal.orderId);
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi hủy phiếu'); }
    finally { setAL(false); }
  };

  const handlePartialComplete = async (orderId, fulfilledItems) => {
    setAL(true);
    try {
      await exportOrderAPI.complete(orderId, { fulfilledItems });
      setPartialModal({ open: false });
      onActionSuccess('Đã hoàn tất xuất kho (một phần)', orderId);
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi hoàn tất'); }
    finally { setAL(false); }
  };

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Phiếu xuất kho</h1>
          <p className="page-subtitle">Quản lý quy trình xuất kho · <strong>{total}</strong> phiếu hệ thống</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline-success" onClick={() => exportOrderAPI.exportCsv({ status: statusF }).then(r => {
            const url = URL.createObjectURL(new Blob([r.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'phieu_xuat.csv'; a.click();
          })}>
            <IcoDownload size={14} className="me-2" /> Xuất CSV
          </button>
          {isManagerOrAdmin && (
            <button className="btn-premium" onClick={handleCreate}>
              <IcoPlus size={16} /> Tạo phiếu xuất
            </button>
          )}
        </div>
      </div>

      <div className="data-card mb-4 p-3 shadow-sm border-0">
        <Row className="align-items-center g-3">
          <Col lg={4}>
            <Form.Control
              placeholder="Tìm mã phiếu, người nhận..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="border-0 bg-light" style={{ borderRadius: '8px' }}
            />
          </Col>
          <Col lg={8}>
            <div className="d-flex gap-2 justify-content-lg-end">
              {['', 'DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED'].map(s => (
                <button
                  key={s}
                  onClick={() => { setStatus(s); setPage(0); }}
                  className={`btn btn-sm ${statusF === s ? 'btn-primary shadow-sm' : 'btn-light text-muted'}`}
                  style={{ borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}
                >
                  {s === '' ? 'Tất cả' : STATUS_MAP[s]?.label || s}
                </button>
              ))}
            </div>
          </Col>
        </Row>
      </div>

      <div className="data-card animate-fade-in shadow-sm border-0 overflow-hidden">
        {loading ? (
          <table className="table mb-0"><tbody>{[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} cols={9} />)}</tbody></table>
        ) : orders.length === 0 ? (
          <EmptyState
            icon="export"
            message="Chưa có phiếu xuất nào"
            sub="Tạo phiếu xuất kho đầu tiên để quản lý"
            cta={isManagerOrAdmin ? '+ Tạo phiếu xuất' : undefined}
            onCta={isManagerOrAdmin ? handleCreate : undefined}
          />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="ps-4 py-3 small fw-bold text-muted text-uppercase">Mã phiếu</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Trạng thái</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Nguồn gốc</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Người nhận</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Phòng ban</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Kho xuất</th>
                    <th className="text-center py-3 small fw-bold text-muted text-uppercase">Số lượng</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Ngày tạo</th>
                    <th className="text-end pe-4 py-3 small fw-bold text-muted text-uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  {orders.map(o => {
                    const st = STATUS_MAP[o.status] || { label: o.status, cls: 'badge-neutral' };
                    return (
                      <tr key={o.id} className="align-middle">
                        <td className="ps-4">
                          <span className="fw-bold text-primary" style={{ fontFamily: 'var(--font-mono)' }}>{o.order_code}</span>
                        </td>
                        <td><Badge className={st.cls}>{st.label}</Badge></td>
                        <td>
                          {o.requisition_code ? (
                            <Badge bg="light" text="dark" className="border">
                              {o.requisition_code}
                            </Badge>
                          ) : (
                            <span className="text-muted small">Trực tiếp</span>
                          )}
                        </td>
                        <td className="small">{o.recipient_name || '—'}</td>
                        <td className="small">{o.department || '—'}</td>
                        <td className="small text-muted">{o.warehouse_name || '—'}</td>
                        <td className="text-center fw-bold text-success">{o.total_qty}</td>
                        <td className="small text-muted">{new Date(o.created_at).toLocaleDateString('vi-VN')}</td>
                        <td className="text-end pe-4">
                          <button className="btn btn-sm btn-outline-primary shadow-none bg-light border-0 px-3" onClick={() => openDetail(o.id)}>
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total > limit && (
              <div className="d-flex justify-content-between align-items-center p-3 border-top bg-light">
                <span className="small text-muted">Trang {page + 1} / {Math.ceil(total / limit)} ({total} phiếu)</span>
                <Pagination size="sm" className="mb-0 shadow-sm border-0">
                  <Pagination.Prev onClick={() => setPage(p => p - 1)} disabled={page === 0} />
                  <Pagination.Item active>{page + 1}</Pagination.Item>
                  <Pagination.Next onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= total} />
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      <Modal show={!!detailId} onHide={() => setDetailId(null)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Chi tiết phiếu xuất {detail?.order_code}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailLoading ? (
            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
          ) : detail && (
            <ExportOrderDetail
              detail={detail}
              isManagerOrAdmin={isManagerOrAdmin}
              onAction={(type) => handleActionWithUndo(detail.id, detail.order_code, type)}
              onReject={() => setRejectModal({ open: true, orderId: detail.id, orderCode: detail.order_code })}
              onCancel={() => setCancelModal({ open: true, orderId: detail.id, orderCode: detail.order_code })}
              onPartial={() => setPartialModal({ open: true, orderId: detail.id })}
              onEdit={() => handleEdit(detail)}
            />
          )}
        </Modal.Body>
      </Modal>

      {/* Form Modal */}
      <Modal show={showForm} onHide={() => setShowForm(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>{editOrder ? `Chỉnh sửa phiếu ${editOrder.order_code}` : 'Tạo phiếu xuất kho mới'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ExportOrderForm
            existing={editOrder}
            onSaved={(m) => { setShowForm(false); showToast(m, { variant: 'success' }); load(); }}
            onClose={() => setShowForm(false)}
          />
        </Modal.Body>
      </Modal>

      {/* Partial Fulfillment Modal */}
      <PartialFulfillmentModal
        show={partialModal.open}
        orderId={partialModal.orderId}
        onHide={() => setPartialModal({ open: false })}
        onConfirm={handlePartialComplete}
        actionLoading={actionLoading}
      />

      {/* Reject Modal */}
      <Modal show={rejectModal.open} onHide={() => setRejectModal({ open: false })} centered>
        <Modal.Header closeButton><Modal.Title>Từ chối phiếu xuất</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Lý do từ chối <span className="text-danger">*</span></Form.Label>
            <Form.Control as="textarea" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} autoFocus />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setRejectModal({ open: false })}>Hủy</Button>
          <Button variant="danger" onClick={handleReject} disabled={!rejectReason.trim() || actionLoading}>
            Xác nhận từ chối
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Cancel Modal */}
      <Modal show={cancelModal.open} onHide={() => setCancelModal({ open: false })} centered>
        <Modal.Header closeButton><Modal.Title>Hủy phiếu xuất kho</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="small mb-3">Hành động này không thể hoàn tác.</Alert>
          <Form.Group>
            <Form.Label>Lý do hủy (tùy chọn)</Form.Label>
            <Form.Control as="textarea" rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setCancelModal({ open: false })}>Đóng</Button>
          <Button variant="warning" onClick={handleCancelConfirm} disabled={actionLoading}>
            Xác nhận hủy phiếu
          </Button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default ExportOrders;