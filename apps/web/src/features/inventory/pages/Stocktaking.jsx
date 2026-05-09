import { useConfirm } from '@/components/common/ConfirmModal';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Row, Col, Card, Table, Badge, Button, Form,
  Modal, Pagination, Alert
} from 'react-bootstrap';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';
import { IcoPlus, IcoCheck, IcoClipboard, IcoX, IcoEye, IcoRefresh } from '@/components/common/Icons.jsx';
import { stocktakingAPI } from '@/services/api';
import useAutoAlert from '@/hooks/useAutoAlert';

// Refactored components
import StocktakingDetail from '../components/StocktakingDetail';
import StocktakingCreateModal from '../components/StocktakingCreateModal';

const STATUS = {
  OPEN:      { label: 'Chờ kiểm',     variant: 'info'    },
  COUNTING:  { label: 'Đang kiểm kê', variant: 'warning' },
  COMPLETED: { label: 'Hoàn tất',     variant: 'success' },
  CANCELLED: { label: 'Đã huỷ',       variant: 'danger'  },
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

export default function Stocktaking() {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { toasts, dismiss, showToast, showErrorToast } = useToast();
  const [sessions, setSessions] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [statusFilter, setStatus] = useState('');

  const [msg, setMsg] = useState({ type: '', text: '' });
  useAutoAlert(msg, setMsg);

  // Detail & Create states
  const [showCreate, setShowCreate] = useState(false);
  const [detail,     setDetail]     = useState(null);
  const [dlLoading,  setDlLoading]  = useState(false);
  const [completing, setCompleting] = useState(false);

  const limit = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await stocktakingAPI.getAll({ page, limit, status: statusFilter || undefined });
      setSessions(r.data?.data?.items || []);
      setTotal(r.data?.data?.total || 0);
    } catch { 
      setMsg({ type: 'danger', text: 'Lỗi tải danh sách kiểm kê' }); 
    } finally { 
      setLoading(false); 
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    setDlLoading(true); setDetail(null);
    try {
      const r = await stocktakingAPI.getById(id);
      setDetail(r.data?.data);
    } catch { 
      setMsg({ type: 'danger', text: 'Lỗi tải chi tiết' }); 
    } finally { 
      setDlLoading(false); 
    }
  };

  const handleCreate = async (data) => {
    try {
      await stocktakingAPI.create(data);
      showToast('Đã tạo đợt kiểm kê mới', { variant: 'success' });
      setShowCreate(false); 
      load();
    } catch (e) { 
      setMsg({ type: 'danger', text: e.response?.data?.message || 'Lỗi tạo đợt KK' }); 
    }
  };

  const handleUpdateItem = async (sessionId, productId, actualQty) => {
    const sId = parseInt(sessionId);
    const pId = parseInt(productId);
    const val = parseInt(actualQty);
    if (isNaN(sId) || isNaN(pId) || isNaN(val)) return;

    try {
      await stocktakingAPI.updateItems(sId, [{ productId: pId, actualQty: val }]);
      const r = await stocktakingAPI.getById(sessionId);
      setDetail(r.data?.data);
    } catch { 
      setMsg({ type: 'danger', text: 'Lỗi cập nhật số lượng' }); 
    }
  };

  const handleComplete = async (id) => {
    if (!await confirmDlg({ 
      title: 'Hoàn tất kiểm kê', 
      message: 'Hoàn tất và tự động điều chỉnh tồn kho theo số thực tế?', 
      variant: 'success' 
    })) return;

    setCompleting(true);
    try {
      const r = await stocktakingAPI.complete(id);
      setMsg({ type: 'success', text: r.data?.message || 'Hoàn tất kiểm kê' });
      setDetail(null); 
      load();
    } catch (e) { 
      setMsg({ type: 'danger', text: e.response?.data?.message || 'Lỗi hoàn tất' }); 
    } finally { 
      setCompleting(false); 
    }
  };

  const handleCancel = async (id) => {
    try {
      await stocktakingAPI.cancel(id);
      showToast('Đã huỷ đợt kiểm kê', { variant: 'info', duration: 4000 });
      setDetail(null); 
      load();
    } catch (e) { 
      showErrorToast(e.response?.data?.message || 'Lỗi huỷ'); 
    }
  };

  const handleStartCounting = async (id) => {
    try {
      await stocktakingAPI.startCounting(id);
      showToast('Đã bắt đầu kiểm kê. Kho đã được khoá.', { variant: 'success' });
      openDetail(id);
      load();
    } catch (e) {
      showErrorToast(e.response?.data?.message || 'Lỗi bắt đầu kiểm kê');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="mb-0 fw-bold">Kiểm kê kho</h5>
          <small className="text-muted">Đối chiếu tồn kho hệ thống vs thực tế</small>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <IcoPlus size={14} className="me-1" /> Tạo đợt kiểm kê
        </Button>
      </div>

      {msg.text && <Alert variant={msg.type} dismissible onClose={() => setMsg({ type: '', text: '' })}>{msg.text}</Alert>}

      <Row className="mb-3 g-2">
        <Col xs="auto">
          <Form.Select size="sm" value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Tất cả trạng thái</option>
            <option value="OPEN">Đang kiểm kê</option>
            <option value="COMPLETED">Hoàn tất</option>
            <option value="CANCELLED">Đã huỷ</option>
          </Form.Select>
        </Col>
      </Row>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {loading ? (
            <Table size="sm" className="mb-0"><tbody>
              {[1,2,3,4,5].map(i => <SkeletonRow key={i} cols={8} />)}
            </tbody></Table>
          ) : (
            <Table size="sm" hover responsive className="mb-0">
              <thead className="table-light">
                <tr>
                  <th>Mã đợt KK</th><th>Trạng thái</th><th>Số SP</th>
                  <th>Đã kiểm</th><th>Ghi chú</th><th>Người tạo</th><th>Ngày tạo</th><th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td colSpan={8}>
                    <div className="text-center py-5 text-muted">
                      <IcoClipboard size={48} className="mb-2 opacity-25" />
                      <div className="fw-bold">Chưa có đợt kiểm kê nào</div>
                      <button className="btn btn-sm btn-link mt-2" onClick={() => setShowCreate(true)}>Tạo đợt kiểm kê đầu tiên</button>
                    </div>
                  </td></tr>
                ) : sessions.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.session_code}</strong></td>
                    <td><Badge bg={STATUS[s.status]?.variant}>{STATUS[s.status]?.label}</Badge></td>
                    <td>{s.item_count}</td>
                    <td>
                      <span className={s.checked_count < s.item_count && s.status === 'OPEN' ? 'text-warning fw-bold' : ''}>
                        {s.checked_count} / {s.item_count}
                      </span>
                    </td>
                    <td className="text-truncate" style={{ maxWidth: 180 }}>{s.note || '—'}</td>
                    <td>{s.created_by_name}</td>
                    <td>{fmtDate(s.created_at)}</td>
                    <td>
                      <Button size="sm" variant="outline-primary" onClick={() => openDetail(s.id)}>
                        <IcoEye size={13} className="me-1" /> Xem
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {totalPages > 1 && (
        <Pagination size="sm" className="justify-content-center mt-3">
          <Pagination.Prev disabled={page <= 1} onClick={() => setPage(p => p - 1)} />
          {[...Array(totalPages)].map((_, i) => (
            <Pagination.Item key={i + 1} active={page === i + 1} onClick={() => setPage(i + 1)}>{i + 1}</Pagination.Item>
          ))}
          <Pagination.Next disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} />
        </Pagination>
      )}

      <StocktakingCreateModal 
        show={showCreate} 
        onHide={() => setShowCreate(false)} 
        onCreate={handleCreate} 
      />

      <Modal show={!!detail || dlLoading} onHide={() => setDetail(null)} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title>{detail ? `Chi tiết: ${detail.session_code}` : 'Đang tải...'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {dlLoading ? (
            <Table size="sm" className="mb-0"><tbody>
              {[1,2,3].map(i=><SkeletonRow key={i} cols={5}/>)}
            </tbody></Table>
          ) : detail && (
            <StocktakingDetail 
              detail={detail} 
              onUpdateItem={handleUpdateItem} 
            />
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setDetail(null)}>Đóng</Button>
          {(detail?.status === 'OPEN' || detail?.status === 'COUNTING') && (
            <Button variant="outline-danger" size="sm" onClick={() => handleCancel(detail.id)}>
              <IcoX size={13} className="me-1" /> Huỷ đợt KK
            </Button>
          )}
          {detail?.status === 'OPEN' && (
            <Button variant="primary" size="sm" onClick={() => handleStartCounting(detail.id)}>
              <IcoCheck size={14} className="me-1" /> Bắt đầu kiểm (Khoá kho)
            </Button>
          )}
          {detail?.status === 'COUNTING' && (
            <Button variant="success" size="sm" disabled={completing} onClick={() => handleComplete(detail.id)}>
              {completing ? <IcoRefresh size={14} className="me-1 spin" /> : <IcoCheck size={14} className="me-1" />}
              Hoàn tất & Điều chỉnh tồn
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <ConfirmDialog />
    </div>
  );
}
