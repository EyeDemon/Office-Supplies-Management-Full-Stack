import React, { useState, useEffect } from 'react';
import { Modal, Row, Col, Badge, Table, Button, Alert, Spinner } from 'react-bootstrap';
import { orderAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { IcoPrint, IcoEdit, IcoArrowRight, IcoCheck, IcoX } from '@/components/common/Icons.jsx';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';

const STATUS_MAP = {
  DRAFT:     { label: 'Nháp',       cls: 'badge-neutral' },
  PENDING:   { label: 'Chờ duyệt',  cls: 'badge-warning' },
  APPROVED:  { label: 'Đã duyệt',   cls: 'badge-info'    },
  COMPLETED: { label: 'Hoàn tất',   cls: 'badge-success' },
  CANCELLED: { label: 'Đã huỷ',     cls: 'badge-danger'  },
  CONFIRMED: { label: 'Hoàn tất',   cls: 'badge-success' },
};

const ImportOrderDetail = ({ orderId, show, onHide, onAction, onEdit, printFn }) => {
  const { isManagerOrAdmin } = useAuth();
  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [acting,  setActing]  = useState('');
  const [err,     setErr]     = useState('');

  useEffect(() => {
    if (!show || !orderId) return;
    setLoading(true); setErr(''); setOrder(null);
    orderAPI.getById(orderId)
      .then(r => setOrder(r.data?.data))
      .catch(() => setErr('Không thể tải phiếu'))
      .finally(() => setLoading(false));
  }, [show, orderId]);

  const doAction = async (action, extraData = {}) => {
    setActing(action); setErr('');
    try {
      const labels = { submit: 'Gửi duyệt', approve: 'Duyệt', reject: 'Từ chối', complete: 'Nhập kho', cancel: 'Huỷ' };
      if (action === 'submit')   await orderAPI.submit(orderId);
      else if (action === 'approve')  await orderAPI.approve(orderId);
      else if (action === 'reject')   await orderAPI.reject(orderId, extraData);
      else if (action === 'complete') await orderAPI.complete(orderId);
      else if (action === 'cancel')   await orderAPI.cancel(orderId);
      onAction(`Thành công: ${labels[action] || action}`);
    } catch (e) { setErr(e.response?.data?.message || 'Lỗi server'); }
    finally { setActing(''); }
  };

  const formatVND = v => v?.toLocaleString('vi-VN') + 'đ';
  const st = order ? (STATUS_MAP[order.status] || { label: order.status, cls: 'badge-neutral' }) : null;

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Chi tiết phiếu nhập {order?.orderCode}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {err && <Alert variant="danger">{err}</Alert>}
        {loading ? (
          <Table size="sm"><tbody>{[1,2,3].map(i => <SkeletonRow key={i} cols={4} />)}</tbody></Table>
        ) : order && (
          <>
            <Row className="g-3 mb-4">
              {[
                { label: 'Nhà cung cấp', val: order.supplierName },
                { label: 'Kho nhập',     val: order.warehouseName },
                { label: 'Trạng thái',   val: <Badge className={st?.cls}>{st?.label}</Badge> },
                { label: 'Tổng tiền',    val: <strong className="text-success">{formatVND(order.totalAmount)}</strong> },
                { label: 'Ghi chú',      val: order.note || '—' },
                { label: 'Người tạo',    val: order.createdByName },
              ].map(i => (
                <Col md={4} key={i.label}>
                  <div className="small text-muted text-uppercase mb-1">{i.label}</div>
                  <div className="fw-bold">{i.val}</div>
                </Col>
              ))}
            </Row>
            <Table bordered size="sm">
              <thead className="bg-light">
                <tr><th>Sản phẩm</th><th className="text-center">SL</th><th className="text-end">Đơn giá</th><th className="text-end">Thành tiền</th></tr>
              </thead>
              <tbody>
                {order.items?.map(it => (
                  <tr key={it.id}>
                    <td>{it.productName}</td>
                    <td className="text-center">{it.quantity}</td>
                    <td className="text-end">{formatVND(it.unitPrice)}</td>
                    <td className="text-end fw-bold">{formatVND(it.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <Button variant="outline-secondary" size="sm" onClick={() => printFn(order)}><IcoPrint size={14} /> In phiếu</Button>
        <div className="d-flex gap-2">
          {order && isManagerOrAdmin && (
            <>
              {order.status === 'DRAFT' && <Button variant="primary" size="sm" onClick={() => doAction('submit')}>Gửi duyệt</Button>}
              {order.status === 'PENDING' && <Button variant="success" size="sm" onClick={() => doAction('approve')}>Duyệt</Button>}
              {order.status === 'APPROVED' && <Button variant="primary" size="sm" onClick={() => doAction('complete')}>Nhập kho</Button>}
            </>
          )}
          <Button variant="secondary" size="sm" onClick={onHide}>Đóng</Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default ImportOrderDetail;
