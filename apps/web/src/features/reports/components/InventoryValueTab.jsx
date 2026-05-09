import React, { useState, useCallback, useEffect } from 'react';
import { Card, Table, Badge, Row, Col, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { reportsAPI } from '@/services/api';
import { formatVND } from '../utils/reportHelpers';

const InventoryValueTab = ({ warehouses = [] }) => {
  const [warehouseId, setWarehouseId] = useState('');
  const [data,        setData]        = useState([]);
  const [grandTotal,  setGrandTotal]  = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    reportsAPI.getInventoryValue({ warehouseId: warehouseId || undefined })
      .then(r => {
        setData(r.data?.data || []);
        setGrandTotal(r.data?.meta?.grandTotal || 0);
      })
      .catch(() => setError('Không thể tải báo cáo giá trị vốn'))
      .finally(() => setLoading(false));
  }, [warehouseId]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <Card className="shadow-sm">
      <Card.Header className="bg-white py-3">
        <Row className="g-2 align-items-end">
          {warehouses.length > 0 && (
            <Col md={4}>
              <Form.Label className="small fw-semibold mb-1">Lọc theo kho</Form.Label>
              <Form.Select size="sm" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                <option value="">Tất cả kho</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Form.Select>
            </Col>
          )}
          <Col md={3}>
            <Button size="sm" variant="primary" onClick={load} disabled={loading}>
              {loading ? <Spinner size="sm" animation="border" /> : '🔍 Tải dữ liệu'}
            </Button>
          </Col>
        </Row>
      </Card.Header>
      <Card.Body className="p-0">
        {error && <Alert variant="danger" className="m-3">{error}</Alert>}

        {grandTotal > 0 && (
          <div className="p-3 border-bottom bg-warning-subtle">
            <span className="fw-semibold">Tổng giá trị vốn: </span>
            <span className="fw-bold text-dark fs-5">{formatVND(grandTotal)}</span>
            <span className="text-muted small ms-2">({grandTotal.toLocaleString('vi-VN')}đ)</span>
          </div>
        )}

        {loading
          ? <SkeletonTable cols={9} rows={8} />
          : data.length === 0
            ? <EmptyState icon="report" message="Không có hàng trong kho" sub="Không có sản phẩm nào có tồn kho > 0" />
            : (
              <Table responsive hover className="mb-0" style={{ fontSize: '.83rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Kho</th>
                    <th>Sản phẩm</th>
                    <th>SKU</th>
                    <th className="text-end">Tồn kho</th>
                    <th className="text-end">Đặt trước</th>
                    <th className="text-end">Khả dụng</th>
                    <th className="text-end">Giá TB</th>
                    <th className="text-end">Giá trị vốn</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={`${r.warehouse_id}-${r.product_id}`}>
                      <td className="text-muted">{i + 1}</td>
                      <td>
                        <Badge bg="secondary" className="fw-normal">{r.warehouse_name}</Badge>
                      </td>
                      <td><span className="fw-semibold">{r.product_name}</span></td>
                      <td><code className="small">{r.sku}</code></td>
                      <td className="text-end">{Number(r.stock_qty).toLocaleString('vi-VN')}</td>
                      <td className="text-end text-warning">{Number(r.reserved_quantity || 0).toLocaleString('vi-VN')}</td>
                      <td className="text-end text-success fw-semibold">{Number(r.available_qty).toLocaleString('vi-VN')}</td>
                      <td className="text-end">{formatVND(Number(r.avg_unit_price || 0))}</td>
                      <td className="text-end fw-bold">{formatVND(Number(r.total_value || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="table-light fw-bold">
                  <tr>
                    <td colSpan={8} className="text-end">Tổng giá trị vốn</td>
                    <td className="text-end text-primary">{formatVND(grandTotal)}</td>
                  </tr>
                </tfoot>
              </Table>
            )
        }
      </Card.Body>
    </Card>
  );
};

export default InventoryValueTab;
