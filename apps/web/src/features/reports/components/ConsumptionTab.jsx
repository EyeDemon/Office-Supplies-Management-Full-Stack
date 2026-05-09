import React, { useState, useCallback, useEffect } from 'react';
import { Card, Table, Row, Col, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { reportsAPI } from '@/services/api';
import { formatVND, today } from '../utils/reportHelpers';

const ConsumptionTab = ({ warehouses = [] }) => {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const [dateFrom,    setDateFrom]    = useState(firstOfMonth.toISOString().slice(0, 10));
  const [dateTo,      setDateTo]      = useState(today());
  const [warehouseId, setWarehouseId] = useState('');
  const [data,        setData]        = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const load = useCallback(() => {
    if (!dateFrom || !dateTo) { setError('Vui lòng chọn khoảng thời gian'); return; }
    setLoading(true); setError('');
    reportsAPI.getConsumption({ dateFrom, dateTo, warehouseId: warehouseId || undefined })
      .then(r => { setData(r.data?.data || []); setMeta(r.data?.meta || null); })
      .catch(() => setError('Không thể tải báo cáo tiêu hao'))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, warehouseId]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const totalQty  = data.reduce((s, r) => s + Number(r.total_qty_out || 0), 0);
  const totalCost = meta?.totalCost ?? data.reduce((s, r) => s + Number(r.total_cost || 0), 0);

  return (
    <Card className="shadow-sm">
      <Card.Header className="bg-white py-3">
        <Row className="g-2 align-items-end">
          <Col md={3}>
            <Form.Label className="small fw-semibold mb-1">Từ ngày</Form.Label>
            <Form.Control size="sm" type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} />
          </Col>
          <Col md={3}>
            <Form.Label className="small fw-semibold mb-1">Đến ngày</Form.Label>
            <Form.Control size="sm" type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)} />
          </Col>
          {warehouses.length > 0 && (
            <Col md={3}>
              <Form.Label className="small fw-semibold mb-1">Kho</Form.Label>
              <Form.Select size="sm" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                <option value="">Tất cả kho</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Form.Select>
            </Col>
          )}
          <Col md={3} className="d-flex gap-2">
            <Button size="sm" variant="primary" onClick={load} disabled={loading}>
              {loading ? <Spinner size="sm" animation="border" /> : '🔍 Xem báo cáo'}
            </Button>
          </Col>
        </Row>
      </Card.Header>
      <Card.Body className="p-0">
        {error && <Alert variant="danger" className="m-3">{error}</Alert>}

        {data.length > 0 && (
          <Row className="g-3 p-3 border-bottom">
            <Col sm={3}>
              <div className="p-3 bg-danger-subtle rounded text-center">
                <div className="small text-muted">Tổng SL tiêu hao</div>
                <div className="fw-bold fs-5 text-danger">{totalQty.toLocaleString('vi-VN')}</div>
              </div>
            </Col>
            <Col sm={3}>
              <div className="p-3 bg-warning-subtle rounded text-center">
                <div className="small text-muted">Tổng chi phí</div>
                <div className="fw-bold fs-5 text-warning">{formatVND(totalCost)}</div>
              </div>
            </Col>
            <Col sm={3}>
              <div className="p-3 bg-info-subtle rounded text-center">
                <div className="small text-muted">Số mặt hàng xuất</div>
                <div className="fw-bold fs-5 text-info">{data.length}</div>
              </div>
            </Col>
            <Col sm={3}>
              <div className="p-3 bg-secondary-subtle rounded text-center">
                <div className="small text-muted">Tổng phiếu</div>
                <div className="fw-bold fs-5">{data.reduce((s, r) => s + Number(r.transaction_count || 0), 0)}</div>
              </div>
            </Col>
          </Row>
        )}

        {loading
          ? <SkeletonTable cols={7} rows={6} />
          : data.length === 0
            ? <EmptyState icon="report" message="Không có tiêu hao trong kỳ" sub="Chọn khoảng thời gian và nhấn Xem báo cáo" />
            : (
              <Table responsive hover className="mb-0" style={{ fontSize: '.83rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Sản phẩm</th>
                    <th>SKU</th>
                    <th className="text-end">SL xuất</th>
                    <th className="text-end">Giá TB</th>
                    <th className="text-end">Tổng tiền</th>
                    <th className="text-end">Số phiếu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={r.product_id}>
                      <td className="text-muted">{i + 1}</td>
                      <td><span className="fw-semibold">{r.product_name}</span></td>
                      <td><code className="small">{r.sku}</code></td>
                      <td className="text-end fw-semibold">{Number(r.total_qty_out || 0).toLocaleString('vi-VN')}</td>
                      <td className="text-end">{formatVND(Number(r.avg_cost || 0))}</td>
                      <td className="text-end fw-bold text-danger">{formatVND(Number(r.total_cost || 0))}</td>
                      <td className="text-end text-muted">{r.transaction_count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="table-light fw-bold">
                  <tr>
                    <td colSpan={3}>Tổng cộng</td>
                    <td className="text-end">{totalQty.toLocaleString('vi-VN')}</td>
                    <td></td>
                    <td className="text-end text-danger">{formatVND(totalCost)}</td>
                    <td className="text-end">{data.reduce((s, r) => s + Number(r.transaction_count || 0), 0)}</td>
                  </tr>
                </tfoot>
              </Table>
            )
        }
      </Card.Body>
    </Card>
  );
};

export default ConsumptionTab;
