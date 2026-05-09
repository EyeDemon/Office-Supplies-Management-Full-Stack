import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Table, Badge, Button, Form, Modal, Spinner, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { requisitionAPI } from '@/services/api';
import { IcoPlus, IcoX, IcoRefresh, IcoDownload, IcoInbox, IcoCheck } from '@/components/common/Icons.jsx';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';

// Refactored components
import RequisitionDetailModal from '../components/RequisitionDetailModal';
import RequisitionCreateModal from '../components/RequisitionCreateModal';

const STATUS_CONFIG = {
  PENDING:             { label: 'Chờ duyệt',             variant: 'warning'  },
  APPROVED:            { label: 'Chờ kho xuất',          variant: 'info'     },
  WAREHOUSE_CONFIRMED: { label: 'Kho đã xuất',           variant: 'success'  },
  REJECTED:            { label: 'Từ chối',               variant: 'danger'   },
  CANCELLED:           { label: 'Đã hủy',                variant: 'secondary'},
};
const fmtD  = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

const StatusBadge = ({ status }) => {
  const c = STATUS_CONFIG[status] || { label: status, variant: 'secondary' };
  return <Badge className={`badge-${c.variant}`} style={{ fontSize: '.65rem', fontWeight: 700, padding: '4px 8px' }}>{c.label.toUpperCase()}</Badge>;
};

export default function Requisitions() {
  const { isManagerOrAdmin } = useAuth();
  const [items, setItems]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [statusFilter, setStatus] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId]   = useState(null);
  const [cancelId, setCancelId]   = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [alert, setAlert]         = useState(null);
  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await requisitionAPI.getAll({
        page, size: PAGE_SIZE, status: statusFilter,
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
      });
      const d = res.data.data;
      setItems(d.items);
      setTotal(d.totalCount);
    } catch (e) {
      setAlert({ variant: 'danger', msg: e.response?.data?.message || 'Lỗi tải dữ liệu' });
    } finally { setLoading(false); }
  }, [page, statusFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleCancelConfirm = async () => {
    setCancelling(true);
    try {
      await requisitionAPI.cancel(cancelId);
      setAlert({ variant: 'success', msg: 'Hủy phiếu thành công' });
      setCancelId(null);
      load();
    } catch (e) {
      setAlert({ variant: 'danger', msg: e.response?.data?.message || 'Lỗi hủy phiếu' });
    } finally { setCancelling(false); }
  };

  const handleExport = async () => {
    try {
      const res = await requisitionAPI.exportCsv({ status: statusFilter, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `phieu-yeu-cau-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    } catch { setAlert({ variant: 'danger', msg: 'Xuất CSV thất bại' }); }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Yêu cầu cấp phát</h1>
          <p className="page-subtitle">
            {isManagerOrAdmin ? 'Quản lý và theo dõi danh sách phiếu yêu cầu từ nhân viên' : 'Yêu cầu văn phòng phẩm và theo dõi trạng thái phê duyệt'}
          </p>
        </div>
        <div className="d-flex gap-2">
          {isManagerOrAdmin && (
            <Button variant="outline-secondary" size="sm" onClick={handleExport} style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IcoDownload size={14}/> Xuất báo cáo
            </Button>
          )}
          {isManagerOrAdmin && (
            <Link to="/requisition-approval" className="btn btn-outline-warning btn-sm" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IcoCheck size={14}/> PHÊ DUYỆT
            </Link>
          )}
          <button className="premium-btn btn-sm d-flex align-items-center gap-2" onClick={() => setShowCreate(true)}>
            <IcoPlus size={14}/> Tạo yêu cầu mới
          </button>
        </div>
      </div>

      {alert && (
        <Alert variant={alert.variant} dismissible onClose={() => setAlert(null)} className="py-2">
          {alert.msg}
        </Alert>
      )}

      <Card className="shadow-sm">
        <Card.Body className="pb-0">
          <Row className="g-2 mb-3">
            <Col md={2}>
              <Form.Select size="sm" value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(0); }}>
                <option value="">Tất cả trạng thái</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Control size="sm" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} title="Từ ngày" />
            </Col>
            <Col md={2}>
              <Form.Control size="sm" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} title="Đến ngày" />
            </Col>
            <Col md={1}>
              <Button size="sm" variant="outline-secondary" onClick={() => { setDateFrom(''); setDateTo(''); setStatus(''); setPage(0); }} title="Xóa bộ lọc">
                <IcoX size={13} />
              </Button>
            </Col>
            <Col md={2}>
              <Button size="sm" variant="outline-secondary" onClick={load}>
                <IcoRefresh size={14} className="me-1" />Làm mới
              </Button>
            </Col>
            <Col className="text-end">
              <small className="text-muted">Tổng: {total} phiếu</small>
            </Col>
          </Row>

          {loading
            ? <table className="table table-sm mb-0"><tbody>{[1,2,3].map(i=><SkeletonRow key={i} cols={5}/>)}</tbody></table>
            : items.length === 0
              ? (
                <div className="text-center py-5 px-3">
                  <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: 12 }}>📭</div>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary, #111)', marginBottom: 6 }}>
                    {statusFilter ? 'Không tìm thấy phiếu nào phù hợp' : 'Bạn chưa có yêu cầu cấp phát nào'}
                  </div>
                  <div style={{ fontSize: '.85rem', color: 'var(--text-secondary, #666)', marginBottom: 20 }}>
                    {statusFilter ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm' : 'Tạo phiếu yêu cầu để nhận văn phòng phẩm từ kho'}
                  </div>
                  {!isManagerOrAdmin && !statusFilter && (
                    <Button variant="primary" onClick={() => setShowCreate(true)}>
                      <IcoPlus size={15} className="me-2" />Tạo yêu cầu đầu tiên
                    </Button>
                  )}
                  {statusFilter && (
                    <Button variant="outline-secondary" size="sm" onClick={() => { setStatus(''); setPage(0); }}>Xóa lọc</Button>
                  )}
                </div>
              )
            : (
              <Table hover responsive className="mb-0" style={{ fontSize: '.85rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Mã phiếu</th>
                    {isManagerOrAdmin && <th>Người yêu cầu</th>}
                    <th className="text-center">Số mặt hàng</th>
                    <th className="text-center">Trạng thái</th>
                    <th>Ngày tạo</th><th>Ngày duyệt/từ chối</th><th className="text-end">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(r => (
                    <tr key={r.id}>
                      <td><code className="text-primary">{r.reqCode}</code></td>
                      {isManagerOrAdmin && <td>{r.requesterName || '—'}</td>}
                      <td className="text-center">{r.itemCount} mặt hàng</td>
                      <td className="text-center"><StatusBadge status={r.status} /></td>
                      <td>{fmtD(r.createdAt)}</td>
                      <td>{fmtD(r.approvedAt || r.rejectedAt || r.cancelledAt)}</td>
                      <td className="text-end">
                        <div className="d-flex justify-content-end gap-3">
                          <button className="btn btn-link btn-sm p-0 d-flex align-items-center gap-1" style={{ textDecoration: 'none', fontWeight: 600, fontSize: '.75rem' }} onClick={() => setDetailId(r.id)}>
                            <IcoInbox size={12}/> XEM CHI TIẾT
                          </button>
                          {r.status === 'PENDING' && (
                            <button className="btn btn-link btn-sm p-0 text-danger d-flex align-items-center gap-1" style={{ textDecoration: 'none', fontWeight: 600, fontSize: '.75rem' }} onClick={() => setCancelId(r.id)}>
                              <IcoX size={12}/> HỦY PHIẾU
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
        }
        </Card.Body>
        {totalPages > 1 && (
          <Card.Footer className="d-flex justify-content-between align-items-center">
            <Button size="sm" variant="outline-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Trước</Button>
            <small>Trang {page + 1} / {totalPages}</small>
            <Button size="sm" variant="outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Sau →</Button>
          </Card.Footer>
        )}
      </Card>

      {showCreate && <RequisitionCreateModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); setAlert({ variant:'success', msg:'Tạo phiếu thành công! Vui lòng chờ phê duyệt.' }); load(); }} />}
      {detailId && <RequisitionDetailModal id={detailId} onClose={() => setDetailId(null)} />}

      <Modal show={!!cancelId} onHide={() => setCancelId(null)} size="sm" centered>
        <Modal.Header closeButton><Modal.Title>Xác nhận hủy phiếu</Modal.Title></Modal.Header>
        <Modal.Body>Bạn có chắc muốn hủy phiếu yêu cầu này không?</Modal.Body>
        <Modal.Footer>
          <Button size="sm" variant="secondary" onClick={() => setCancelId(null)}>Không</Button>
          <Button size="sm" variant="danger" onClick={handleCancelConfirm} disabled={cancelling}>{cancelling ? <Spinner size="sm" /> : 'Hủy phiếu'}</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}