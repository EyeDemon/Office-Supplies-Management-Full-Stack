import React, { useState, useCallback, useEffect } from 'react';
import { Card, Table, Row, Col, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { reportsAPI } from '@/services/api';

const StockTrendTab = ({ warehouses = [] }) => {
  const [warehouseId, setWarehouseId] = useState('');
  const [productId,   setProductId]   = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [data,        setData]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [products,    setProducts]    = useState([]);
  const [loadingProds, setLoadingProds] = useState(false);

  useEffect(() => {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const fmt = d => d.toISOString().slice(0, 10);
    setDateFrom(fmt(from));
    setDateTo(fmt(to));
  }, []);

  useEffect(() => {
    setLoadingProds(true);
    import('@/services/api').then(({ productAPI }) => {
      productAPI.getAll({ size: 200 })
        .then(r => setProducts(r.data?.data?.items || r.data?.data || []))
        .catch(() => {})
        .finally(() => setLoadingProds(false));
    });
  }, []);

  const load = useCallback(() => {
    if (!warehouseId || !productId) return;
    setLoading(true); setError('');
    reportsAPI.getStockTrend({ warehouseId, productId, dateFrom, dateTo })
      .then(r => setData(r.data?.data || []))
      .catch(() => setError('Không thể tải dữ liệu xu hướng tồn kho'))
      .finally(() => setLoading(false));
  }, [warehouseId, productId, dateFrom, dateTo]);

  const canLoad = warehouseId && productId && dateFrom && dateTo;

  return (
    <Card>
      <Card.Header className="d-flex align-items-center gap-2 flex-wrap py-2">
        <span style={{ fontWeight: 600 }}>📈 Xu hướng tồn kho theo ngày</span>
      </Card.Header>
      <Card.Body>
        <Row className="g-2 mb-3">
          <Col xs={12} sm={3}>
            <Form.Select size="sm" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              <option value="">-- Chọn kho --</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Form.Select>
          </Col>
          <Col xs={12} sm={3}>
            <Form.Select size="sm" value={productId} onChange={e => setProductId(e.target.value)}
              disabled={loadingProds}>
              <option value="">-- Chọn sản phẩm --</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </Form.Select>
          </Col>
          <Col xs="auto">
            <Form.Control type="date" size="sm" value={dateFrom}
              max={dateTo} onChange={e => setDateFrom(e.target.value)} />
          </Col>
          <Col xs="auto">
            <Form.Control type="date" size="sm" value={dateTo}
              min={dateFrom} onChange={e => setDateTo(e.target.value)} />
          </Col>
          <Col xs="auto">
            <Button size="sm" variant="primary" onClick={load} disabled={!canLoad || loading}>
              {loading ? <Spinner size="sm" animation="border" /> : 'Xem'}
            </Button>
          </Col>
        </Row>

        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

        {!canLoad && (
          <Alert variant="info">Vui lòng chọn kho và sản phẩm để xem xu hướng tồn kho.</Alert>
        )}

        {canLoad && !loading && data.length === 0 && !error && (
          <Alert variant="secondary">Không có dữ liệu trong khoảng thời gian này.</Alert>
        )}

        {data.length > 0 && (
          <Table responsive hover size="sm" className="mb-0">
            <thead className="table-light">
              <tr>
                <th>Ngày</th>
                <th className="text-end">Tồn đầu kỳ</th>
                <th className="text-end">Nhập</th>
                <th className="text-end">Xuất</th>
                <th className="text-end">Tồn cuối kỳ</th>
                <th className="text-end">Đặt giữ (Reserved)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td>{row.snapshot_date || row.date}</td>
                  <td className="text-end">{Number(row.opening_qty ?? row.qty_before ?? 0).toLocaleString()}</td>
                  <td className="text-end text-success">{Number(row.total_in  ?? 0).toLocaleString()}</td>
                  <td className="text-end text-danger"> {Number(row.total_out ?? 0).toLocaleString()}</td>
                  <td className="text-end fw-bold">   {Number(row.closing_qty ?? row.qty_after ?? row.stock_qty ?? 0).toLocaleString()}</td>
                  <td className="text-end text-warning">{Number(row.reserved_quantity ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card.Body>
    </Card>
  );
};

export default StockTrendTab;
