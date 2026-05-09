import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Badge, Button, Modal, Alert } from 'react-bootstrap';
import { requisitionAPI } from '@/services/api';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';

const STATUS_CONFIG = {
  PENDING:             { label: 'Chờ duyệt',             variant: 'warning'  },
  APPROVED:            { label: 'Chờ kho xuất',          variant: 'info'     },
  WAREHOUSE_CONFIRMED: { label: 'Kho đã xuất',           variant: 'success'  },
  REJECTED:            { label: 'Từ chối',               variant: 'danger'   },
  CANCELLED:           { label: 'Đã hủy',                variant: 'secondary'},
};

const UNIT_LABELS = {
  CAI:'Cái', HOP:'Hộp', GOI:'Gói', CUON:'Cuộn', BO:'Bộ',
  TUP:'Tuýp', LOC:'Lọc', KG:'Kg',  MET:'Mét',  TO:'Tờ',
};

const unitLabel = (u) => UNIT_LABELS[u] || u || '';
const fmtDT = (d) => d ? new Date(d).toLocaleString('vi-VN') : '—';
const fmtD  = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

const StatusBadge = ({ status }) => {
  const c = STATUS_CONFIG[status] || { label: status, variant: 'secondary' };
  return <Badge className={`badge-${c.variant}`} style={{ fontSize: '.65rem', fontWeight: 700, padding: '4px 8px' }}>{c.label.toUpperCase()}</Badge>;
};

const RequisitionDetailModal = ({ id, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    requisitionAPI.getById(id)
      .then(r => setData(r.data.data))
      .catch(e => setErr(e.response?.data?.message || 'Lỗi tải dữ liệu'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Modal show onHide={onClose} size="lg" scrollable centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem', fontWeight: 700 }}>Chi tiết phiếu yêu cầu {data?.reqCode || `#${id}`}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && <table className="table table-sm mb-0"><tbody>{[1,2,3].map(i=><SkeletonRow key={i} cols={5}/>)}</tbody></table>}
        {err    && <Alert variant="danger">{err}</Alert>}
        {data && (
          <>
            <Row className="mb-3 g-3">
              <Col md={4}><small className="text-muted d-block">Mã phiếu</small><strong>{data.reqCode}</strong></Col>
              <Col md={4}><small className="text-muted d-block">Trạng thái</small><StatusBadge status={data.status} /></Col>
              <Col md={4}><small className="text-muted d-block">Ngày tạo</small>{fmtDT(data.createdAt)}</Col>
              <Col md={4}><small className="text-muted d-block">Người yêu cầu</small>{data.requesterName || '—'}</Col>
              {data.approvedByName && <Col md={4}><small className="text-muted d-block">Người duyệt (QL)</small>{data.approvedByName} <small>({fmtD(data.approvedAt)})</small></Col>}
              {data.warehouseConfirmedByName && <Col md={4}><small className="text-muted d-block">Thủ kho xác nhận</small><span className="text-success fw-semibold">{data.warehouseConfirmedByName}</span> <small>({fmtD(data.warehouseConfirmedAt)})</small></Col>}
              {data.rejectedByName && <Col md={4}><small className="text-muted d-block">Người từ chối</small>{data.rejectedByName} <small>({fmtD(data.rejectedAt)})</small></Col>}
              {data.rejectReason   && <Col md={12}><Alert variant="danger" className="py-2 mb-0"><small><strong>Lý do từ chối:</strong> {data.rejectReason}</small></Alert></Col>}
              {data.note && <Col md={12}><small className="text-muted d-block">Ghi chú</small>{data.note}</Col>}
            </Row>
            <Table size="sm" bordered hover responsive>
              <thead className="table-light">
                <tr>
                  <th>#</th><th>Sản phẩm</th><th>SKU</th>
                  <th className="text-center">SL yêu cầu</th>
                  <th className="text-center">SL cấp</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td>{idx + 1}</td>
                    <td>{it.productName}</td>
                    <td><code>{it.sku}</code></td>
                    <td className="text-center">{it.quantityRequested} {unitLabel(it.unit)}</td>
                    <td className="text-center">
                      {it.quantityApproved != null
                        ? <strong className={it.quantityApproved < it.quantityRequested ? 'text-warning' : 'text-success'}>{it.quantityApproved} {unitLabel(it.unit)}</strong>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td><small>{it.note || '—'}</small></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onClose}>Đóng</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default RequisitionDetailModal;
