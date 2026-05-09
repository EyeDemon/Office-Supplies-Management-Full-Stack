import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Badge, Button, Modal, Form, Alert, Spinner } from 'react-bootstrap';
import { requisitionAPI } from '@/services/api';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';

const fmtDT = d => d ? new Date(d).toLocaleString('vi-VN') : '—';
const unitLabel = u => u || '';

export const RequisitionApproveModal = ({ id, onClose, onSuccess }) => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSub]  = useState(false);
  const [err, setErr]         = useState('');
  const [approvedQtys, setQtys] = useState({});

  useEffect(() => {
    requisitionAPI.getById(id).then(r => {
      const d = r.data.data;
      setData(d);
      const init = {};
      d.items.forEach(it => { init[it.id] = it.quantityRequested; });
      setQtys(init);
    }).catch(() => setErr('Không thể tải chi tiết phiếu'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleApprove = async () => {
    setSub(true); setErr('');
    try {
      const approvedItems = data.items.map(it => ({
        itemId: it.id, quantityApproved: Number(approvedQtys[it.id] ?? it.quantityRequested),
      }));
      const res = await requisitionAPI.approve(id, { approvedItems });
      onSuccess(res.data.message || 'Đã duyệt phiếu thành công');
    } catch (e) {
      setErr(e.response?.data?.message || 'Lỗi khi duyệt phiếu');
      setSub(false);
    }
  };

  return (
    <Modal show onHide={onClose} size="lg" scrollable centered>
      <Modal.Header closeButton style={{ background: 'var(--color-success)', color: '#fff' }}>
        <Modal.Title style={{ fontSize: '1rem', fontWeight: 700 }}>
          PHÊ DUYỆT PHIẾU {data?.reqCode || '#'+id}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && <SkeletonTable headers={['Sản phẩm','SKU','Tồn','SL YC','SL Duyệt']} rows={4} />}
        {err && <Alert variant="danger" className="py-2">{err}</Alert>}
        {data && !loading && (
          <>
            <div className="mb-3 p-2 rounded" style={{ background:'#f8f9fa', fontSize:'.83rem' }}>
              <strong>Người yêu cầu:</strong> {data.requesterName} &nbsp;|&nbsp;
              <strong>Ngày tạo:</strong> {fmtDT(data.createdAt)}
              {data.note && <><br /><strong>Ghi chú:</strong> {data.note}</>}
            </div>
            <Table size="sm" bordered hover responsive>
              <thead className="table-light">
                <tr>
                  <th>Sản phẩm</th><th>SKU</th>
                  <th className="text-center">Tồn kho</th>
                  <th className="text-center">SL yêu cầu</th>
                  <th className="text-center" style={{ minWidth:100 }}>SL duyệt</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(it => {
                  const qty = Number(approvedQtys[it.id] ?? it.quantityRequested);
                  const avail = Number(it.stockQty || 0);
                  return (
                    <tr key={it.id} className={qty > avail ? 'table-warning' : ''}>
                      <td>{it.productName}</td>
                      <td><code>{it.sku}</code></td>
                      <td className="text-center">
                        <span className={avail <= 0 ? 'text-danger fw-bold' : ''}>{avail}</span>
                        {' '}{unitLabel(it.unit)}
                      </td>
                      <td className="text-center">{it.quantityRequested} {unitLabel(it.unit)}</td>
                      <td>
                        <Form.Control
                          type="number" size="sm" min={0} max={it.quantityRequested}
                          value={approvedQtys[it.id] ?? it.quantityRequested}
                          onChange={e => setQtys(prev => ({
                            ...prev, [it.id]: Math.min(it.quantityRequested, Math.max(0, parseInt(e.target.value)||0))
                          }))}
                          style={{ textAlign:'center' }}
                        />
                        {qty > avail && <div style={{ fontSize:'.72rem', color:'#e85d04' }}>⚠️ Vượt tồn kho</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Alert variant="info" className="py-2 mb-0" style={{ fontSize:'.8rem' }}>
              💡 Tồn kho sẽ được đặt chỗ (reserved) và một Phiếu xuất kho sẽ được tự động tạo sau khi duyệt.
            </Alert>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button size="sm" variant="secondary" onClick={onClose} disabled={submitting}>Hủy</Button>
        <Button size="sm" variant="success" onClick={handleApprove} disabled={submitting||loading||!!err} style={{ fontWeight: 600 }}>
          {submitting ? 'ĐANG XỬ LÝ...' : 'XÁC NHẬN PHÊ DUYỆT'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export const RequisitionRejectModal = ({ id, reqCode, onClose, onSuccess }) => {
  const [reason, setReason]  = useState('');
  const [submitting, setSub] = useState(false);
  const [err, setErr]        = useState('');

  const handleReject = async () => {
    setSub(true); setErr('');
    try {
      await requisitionAPI.reject(id, { rejectionNote: reason.trim() });
      onSuccess('Đã từ chối phiếu ' + reqCode);
    } catch (e) {
      setErr(e.response?.data?.message || 'Lỗi khi từ chối phiếu');
      setSub(false);
    }
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton style={{ background:'var(--color-danger)', color:'#fff' }}>
        <Modal.Title style={{ fontSize:'1rem', fontWeight: 700 }}>TỪ CHỐI PHIẾU {reqCode}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {err && <Alert variant="danger" className="py-2">{err}</Alert>}
        <Form.Group>
          <Form.Label style={{ fontSize:'.85rem' }}>Lý do từ chối <span className="text-muted">(tùy chọn)</span></Form.Label>
          <Form.Control as="textarea" rows={3} placeholder="VD: Không đủ ngân sách..."
            value={reason} onChange={e => setReason(e.target.value)} autoFocus />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button size="sm" variant="secondary" onClick={onClose} disabled={submitting}>Hủy</Button>
        <Button size="sm" variant="danger" onClick={handleReject} disabled={submitting} style={{ fontWeight: 600 }}>
          {submitting ? 'ĐANG XỬ LÝ...' : 'XÁC NHẬN TỪ CHỐI'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export const BulkRejectModal = ({ count, onClose, onConfirm }) => {
  const [reason, setReason]  = useState('');
  const [submitting, setSub] = useState(false);
  const handleConfirm = async () => { setSub(true); try { await onConfirm(reason.trim()); } finally { setSub(false); } };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton style={{ background:'#dc3545', color:'#fff' }}>
        <Modal.Title style={{ fontSize:'1rem' }}>Từ chối {count} phiếu cùng lúc</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p style={{ fontSize:'.88rem' }}>Bạn đang từ chối <strong>{count} phiếu</strong> đang chờ duyệt.</p>
        <Form.Group>
          <Form.Label style={{ fontSize:'.85rem' }}>Lý do từ chối chung <span className="text-muted">(tùy chọn)</span></Form.Label>
          <Form.Control as="textarea" rows={2} placeholder="Lý do từ chối hàng loạt..."
            value={reason} onChange={e => setReason(e.target.value)} autoFocus />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button size="sm" variant="secondary" onClick={onClose} disabled={submitting}>Hủy</Button>
        <Button size="sm" variant="danger" onClick={handleConfirm} disabled={submitting}>
          {submitting ? <><Spinner size="sm" className="me-1"/>Đang xử lý...</> : <>Từ chối {count} phiếu</>}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
