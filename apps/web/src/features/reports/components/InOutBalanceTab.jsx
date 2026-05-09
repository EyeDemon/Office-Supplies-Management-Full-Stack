import React, { useState, useCallback, useEffect } from 'react';
import { Card, Table, Badge, Row, Col, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { reportsAPI } from '@/services/api';

const InOutBalanceTab = ({ warehouses = [] }) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(todayStr);
  const [warehouseId, setWarehouseId] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    reportsAPI.getInOutBalance({ dateFrom, dateTo, warehouseId: warehouseId || undefined })
      .then(r => setData(r.data?.data || []))
      .catch(() => setError('Không thể tải báo cáo N-X-Tồn'))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, warehouseId]);

  useEffect(() => {
    const from = new Date();
    from.setDate(1); // Mặc định đầu tháng
    setDateFrom(from.toISOString().slice(0, 10));
  }, []);

  const totalImport = data.reduce((s, r) => s + Number(r.totalImport || 0), 0);
  const totalExport = data.reduce((s, r) => s + Number(r.totalExport || 0), 0);

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
            <Col sm={4}>
              <div className="p-3 bg-success-subtle rounded text-center">
                <div className="small text-muted">Tổng nhập kỳ</div>
                <div className="fw-bold fs-5 text-success">{totalImport.toLocaleString('vi-VN')}</div>
              </div>
            </Col>
            <Col sm={4}>
              <div className="p-3 bg-danger-subtle rounded text-center">
                <div className="small text-muted">Tổng xuất kỳ</div>
                <div className="fw-bold fs-5 text-danger">{totalExport.toLocaleString('vi-VN')}</div>
              </div>
            </Col>
            <Col sm={4}>
              <div className="p-3 bg-primary-subtle rounded text-center">
                <div className="small text-muted">Số mặt hàng</div>
                <div className="fw-bold fs-5 text-primary">{data.length}</div>
              </div>
            </Col>
          </Row>
        )}

        {loading
          ? <SkeletonTable cols={7} rows={6} />
          : data.length === 0
            ? <EmptyState icon="report" message="Không có dữ liệu" sub="Chọn khoảng thời gian và nhấn Xem báo cáo" />
            : (
              <Table responsive hover className="mb-0" style={{ fontSize: '.83rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Sản phẩm</th>
                    <th>SKU</th>
                    <th className="text-end">Tổng nhập</th>
                    <th className="text-end">Tổng xuất</th>
                    <th className="text-end">Chênh lệch</th>
                    <th className="text-end">Tồn hiện tại</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={r.productId}>
                      <td className="text-muted">{i + 1}</td>
                      <td><span className="fw-semibold">{r.productName}</span></td>
                      <td><code className="small">{r.sku}</code></td>
                      <td className="text-end text-success fw-semibold">{r.totalImport.toLocaleString('vi-VN')}</td>
                      <td className="text-end text-danger fw-semibold">{r.totalExport.toLocaleString('vi-VN')}</td>
                      <td className="text-end">
                        <Badge bg={r.netChange >= 0 ? 'success' : 'danger'}>
                          {r.netChange >= 0 ? '+' : ''}{r.netChange.toLocaleString('vi-VN')}
                        </Badge>
                      </td>
                      <td className="text-end fw-semibold">
                        {r.closingQty !== null ? r.closingQty.toLocaleString('vi-VN') : <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="table-light fw-bold">
                  <tr>
                    <td colSpan={3}>Tổng cộng</td>
                    <td className="text-end text-success">{totalImport.toLocaleString('vi-VN')}</td>
                    <td className="text-end text-danger">{totalExport.toLocaleString('vi-VN')}</td>
                    <td className="text-end">
                      <Badge bg={(totalImport - totalExport) >= 0 ? 'success' : 'danger'}>
                        {(totalImport - totalExport) >= 0 ? '+' : ''}{(totalImport - totalExport).toLocaleString('vi-VN')}
                      </Badge>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </Table>
            )
        }
      </Card.Body>
    </Card>
  );
};

export default InOutBalanceTab;
