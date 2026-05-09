import React, { useState } from 'react';
import { Row, Col, Table, Badge, Button, Form, Alert } from 'react-bootstrap';
import { IcoAlertTriangle, IcoCheck } from '@/components/common/Icons.jsx';

const DetailPanel = ({ detail, onUpdateItem }) => {
  const [localItems, setLocalItems] = useState(
    (detail.items || []).map(i => ({ ...i, _qty: i.actual_qty !== null ? String(i.actual_qty) : '' }))
  );
  const [saving, setSaving] = useState({});

  const isEditable = detail.status === 'OPEN' || detail.status === 'COUNTING';
  const unchecked = localItems.filter(i => i.actual_qty === null || i.actual_qty === undefined).length;
  const sumDiff = localItems.filter(i => i.difference != null).reduce((s, i) => s + (i.difference || 0), 0);

  const statusMap = {
    OPEN:      { label: 'Chờ kiểm', variant: 'info' },
    COUNTING:  { label: 'Đang kiểm kê', variant: 'warning' },
    COMPLETED: { label: 'Hoàn tất', variant: 'success' },
    CANCELLED: { label: 'Đã huỷ', variant: 'danger' },
  };

  const handleSave = async (item, idx) => {
    const qty = localItems[idx]._qty;
    if (qty === '' || isNaN(Number(qty))) return;
    setSaving(s => ({ ...s, [item.product_id]: true }));
    await onUpdateItem(detail.id, item.product_id, qty);
    setSaving(s => ({ ...s, [item.product_id]: false }));
  };

  return (
    <>
      <Row className="mb-3 g-2">
        <Col xs="auto">
          <Badge bg={statusMap[detail.status]?.variant || 'secondary'}>
            {statusMap[detail.status]?.label || detail.status}
          </Badge>
        </Col>
        <Col xs="auto"><small className="text-muted">Người tạo: <strong>{detail.created_by_name}</strong></small></Col>
        <Col xs="auto"><small className="text-muted">Ngày tạo: <strong>{new Date(detail.created_at).toLocaleString('vi-VN')}</strong></small></Col>
        {detail.completed_at && <Col xs="auto"><small className="text-muted">Hoàn tất: <strong>{new Date(detail.completed_at).toLocaleString('vi-VN')}</strong></small></Col>}
      </Row>

      {isEditable && (
        <Alert variant={unchecked > 0 ? 'warning' : 'success'} className="py-2">
          {detail.status === 'OPEN' && <div className="mb-1 text-primary small fw-bold">Phiếu đang ở trạng thái chuẩn bị. Hãy bấm "Bắt đầu kiểm" để khoá kho.</div>}
          {unchecked > 0
            ? <><IcoAlertTriangle size={14} className="me-2" /> Còn {unchecked} sản phẩm chưa nhập số lượng thực tế</>
            : <><IcoCheck size={14} className="me-2" /> Đã nhập đủ — sẵn sàng hoàn tất kiểm kê</>}
        </Alert>
      )}

      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        <Table size="sm" bordered hover responsive>
          <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
            <tr>
              <th>Sản phẩm</th><th>SKU</th><th>ĐVT</th>
              <th className="text-end">Tồn hệ thống</th>
              <th className="text-end">Thực tế</th>
              <th className="text-end">Chênh lệch</th>
              {isEditable && <th style={{ width: 70 }}>Lưu</th>}
            </tr>
          </thead>
          <tbody>
            {localItems.map((item, idx) => {
              const diff = item.difference;
              const diffColor = diff == null ? '' : diff > 0 ? 'text-success fw-bold' : diff < 0 ? 'text-danger fw-bold' : '';
              return (
                <tr key={item.product_id}>
                  <td>{item.product_name}</td>
                  <td><small className="text-muted">{item.sku}</small></td>
                  <td>{item.unit || '—'}</td>
                  <td className="text-end fw-semibold">{item.system_qty}</td>
                  <td className="text-end">
                    {isEditable ? (
                      <Form.Control size="sm" type="number" min="0" style={{ width: 80, textAlign: 'right', display: 'inline-block' }}
                        value={localItems[idx]._qty}
                        onChange={e => setLocalItems(prev => prev.map((it, i) => i === idx ? { ...it, _qty: e.target.value } : it))} />
                    ) : (
                      <span className="fw-semibold">{item.actual_qty !== null ? item.actual_qty : '—'}</span>
                    )}
                  </td>
                  <td className={`text-end ${diffColor}`}>
                    {diff == null ? '—' : (diff > 0 ? '+' : '') + diff}
                  </td>
                  {isEditable && (
                    <td>
                      <Button size="sm" variant="outline-primary" style={{ fontSize: '0.72rem', padding: '1px 8px' }}
                        disabled={saving[item.product_id] || localItems[idx]._qty === ''}
                        onClick={() => handleSave(item, idx)}>
                        {saving[item.product_id] ? '...' : 'Lưu'}
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {localItems.some(i => i.difference != null) && (
            <tfoot>
              <tr className="table-light">
                <td colSpan={isEditable ? 5 : 4} className="fw-bold">Tổng chênh lệch:</td>
                <td className={`text-end fw-bold ${sumDiff > 0 ? 'text-success' : sumDiff < 0 ? 'text-danger' : ''}`}>
                  {sumDiff > 0 ? '+' : ''}{sumDiff}
                </td>
                {isEditable && <td />}
              </tr>
            </tfoot>
          )}
        </Table>
      </div>
    </>
  );
};

export default DetailPanel;
