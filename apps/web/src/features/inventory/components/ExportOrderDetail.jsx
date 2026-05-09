import React from 'react';
import { Row, Col, Badge, Table, Button } from 'react-bootstrap';
import { IcoX, IcoEdit, IcoArrowRight, IcoCheck } from '@/components/common/Icons.jsx';

const STATUS_MAP = {
  DRAFT:     { label: 'Nháp',       cls: 'badge-neutral' },
  PENDING:   { label: 'Chờ duyệt',  cls: 'badge-warning' },
  APPROVED:  { label: 'Đã duyệt',   cls: 'badge-info'    },
  COMPLETED: { label: 'Đã xuất',    cls: 'badge-success' },
  CANCELLED: { label: 'Đã huỷ',     cls: 'badge-danger'  },
};

const WORKFLOW_STEPS = ['DRAFT', 'PENDING', 'APPROVED', 'COMPLETED'];

const ExportOrderDetail = ({ detail, isManagerOrAdmin, onAction, onReject, onCancel, onPartial, onEdit }) => {
  const s = detail.status;
  const steps = WORKFLOW_STEPS.map((step, idx) => ({
    label: STATUS_MAP[step].label,
    done: WORKFLOW_STEPS.indexOf(s) >= idx,
    current: s === step
  }));

  return (
    <div>
      <div className="d-flex justify-content-between mb-4 flex-wrap gap-2">
        {steps.map((step, i) => (
          <React.Fragment key={i}>
            <div className="text-center" style={{ flex: 1 }}>
              <div className={`mx-auto mb-1 d-flex align-items-center justify-content-center rounded-circle ${step.done ? 'bg-success text-white' : 'bg-light text-muted'}`}
                style={{ width: 30, height: 30, fontSize: '0.8rem', fontWeight: 700 }}>
                {step.done ? '✓' : i + 1}
              </div>
              <div className={`small fw-bold ${step.current ? 'text-primary' : 'text-muted'}`}>{step.label}</div>
            </div>
            {i < steps.length - 1 && <div className="mt-3 bg-light" style={{ flex: 0.5, height: 2 }} />}
          </React.Fragment>
        ))}
      </div>

      <div className="data-card p-3 mb-3 bg-light border-0">
        <Row className="g-3">
          {[
            { label: 'Người nhận', val: detail.recipient_name },
            { label: 'Phòng ban', val: detail.department },
            { label: 'Kho xuất', val: detail.warehouse_name },
            { label: 'Người tạo', val: detail.created_by_name },
            { label: 'Ngày tạo', val: new Date(detail.created_at).toLocaleString('vi-VN') },
            { label: 'Trạng thái', val: <Badge className={STATUS_MAP[s]?.cls}>{STATUS_MAP[s]?.label}</Badge> },
            { label: 'Nguồn gốc', val: detail.requisition_code ? (
              <Badge bg="light" text="dark" className="border">
                {detail.requisition_code}
              </Badge>
            ) : 'Trực tiếp' },
          ].map((item, i) => (
            <Col md={4} key={i}>
              <div className="small text-muted text-uppercase fw-semibold mb-1" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>{item.label}</div>
              <div className="fw-bold text-dark" style={{ fontSize: '0.875rem' }}>{item.val || '—'}</div>
            </Col>
          ))}
          {detail.note && <Col md={12}><div className="small text-muted mb-1">Ghi chú:</div><div className="p-2 bg-white rounded border small">{detail.note}</div></Col>}
        </Row>
      </div>

      <Table bordered hover size="sm" className="mb-4">
        <thead className="bg-light">
          <tr>
            <th>Sản phẩm</th><th>SKU</th><th className="text-center">ĐVT</th>
            <th className="text-end">Tồn kho</th><th className="text-end">Số lượng</th>
          </tr>
        </thead>
        <tbody>
          {detail.items?.map(it => (
            <tr key={it.id}>
              <td>{it.product_name}</td>
              <td className="small text-muted font-monospace">{it.sku}</td>
              <td className="text-center small">{it.unit || '—'}</td>
              <td className={`text-end fw-bold ${it.stock_qty < it.quantity ? 'text-danger' : 'text-success'}`}>{it.stock_qty}</td>
              <td className="text-end fw-bold">{it.quantity}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-light">
          <tr>
            <td colSpan={4} className="text-end fw-bold">Tổng cộng:</td>
            <td className="text-end fw-bold text-primary" style={{ fontSize: '1.1rem' }}>{detail.total_qty}</td>
          </tr>
        </tfoot>
      </Table>

      {isManagerOrAdmin && (
        <div className="d-flex gap-2 justify-content-end border-top pt-3">
          {s === 'DRAFT' && (
            <>
              <Button variant="outline-danger" size="sm" onClick={onCancel}><IcoX size={14} /> Hủy phiếu</Button>
              <Button variant="outline-primary" size="sm" onClick={onEdit}><IcoEdit size={14} /> Sửa</Button>
              <Button variant="primary" size="sm" onClick={() => onAction('submit')}>Gửi duyệt <IcoArrowRight size={14} /></Button>
            </>
          )}
          {s === 'PENDING' && (
            <>
              <Button variant="outline-danger" size="sm" onClick={onReject}><IcoX size={14} /> Từ chối</Button>
              <Button variant="outline-warning" size="sm" onClick={onCancel}>Hủy phiếu</Button>
              <Button variant="success" size="sm" onClick={() => onAction('approve')}><IcoCheck size={14} /> Duyệt phiếu</Button>
            </>
          )}
          {s === 'APPROVED' && (
            <>
              <Button variant="outline-danger" size="sm" onClick={onCancel}>Hủy phiếu</Button>
              <Button variant="outline-warning" size="sm" onClick={onPartial}>⚡ Xuất một phần</Button>
              <Button variant="success" size="sm" onClick={() => onAction('complete')}><IcoCheck size={14} /> Hoàn tất & Xuất kho</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportOrderDetail;
