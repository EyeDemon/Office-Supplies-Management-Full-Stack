import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Badge, Row, Col, Form, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoDownload, IcoSearch } from '@/components/common/Icons.jsx';
import { reportsAPI } from '@/services/api';
import { formatVND } from '../utils/reportHelpers';

const DeadStockTab = () => {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');
  const [days,      setDays]      = useState(90);
  const [search,    setSearch]    = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    reportsAPI.getDeadStock({ days })
      .then(r => setData(r.data?.data || null))
      .catch(() => setError('Không thể tải dữ liệu hàng chết'))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const items    = data?.items || [];
  const filtered = items.filter(r =>
    !search ||
    r.productName.toLowerCase().includes(search.toLowerCase()) ||
    r.sku.toLowerCase().includes(search.toLowerCase())
  );
  const totalValue = filtered.reduce((s, r) => s + r.stockValue, 0);

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await reportsAPI.exportDeadStock({ days });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `hang-chet-${days}ngay-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch { 
      alert('Xuất CSV thất bại'); 
    } finally { 
      setExporting(false); 
    }
  };

  return (
    <Card>
      <Card.Header>
        <Row className="align-items-center g-2">
          <Col className="me-auto">
            <span style={{ fontWeight: 600 }}>💀 Hàng chết (Dead Stock) — Không xuất trong {days} ngày</span>
            {data && (
              <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {data.totalItems} sản phẩm · Tổng giá trị tồn đọng:
                <strong style={{ color: '#ef4444', marginLeft: 4 }}>{formatVND(data.totalValue)}</strong>
              </div>
            )}
          </Col>
          <Col xs="auto">
            <Form.Select size="sm" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 110 }}>
              <option value={30}>30 ngày</option>
              <option value={60}>60 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={180}>180 ngày</option>
              <option value={365}>1 năm</option>
            </Form.Select>
          </Col>
          <Col xs="auto">
            <div className="search-bar" style={{ maxWidth: 220 }}>
              <span className="search-bar-icon"><IcoSearch size={13} /></span>
              <Form.Control size="sm" placeholder="Tìm sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </Col>
          <Col xs="auto">
            <button className="icon-btn icon-btn-success"
              style={{ padding: '.4rem .8rem', borderRadius: 6, fontSize: '.8rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={handleExport} disabled={exporting || !data?.totalItems}>
              {exporting ? <><Spinner size="sm" style={{ width: 12, height: 12 }} /> Đang xuất...</>
                         : <><IcoDownload size={13} /> Xuất CSV</>}
            </button>
          </Col>
        </Row>
      </Card.Header>

      {data && data.totalItems > 0 && (
        <div style={{ padding: '.75rem 1rem', background: '#fff5f5', borderBottom: '1px solid #fecaca', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div><span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>Số sản phẩm</span><br /><strong style={{ color: '#ef4444' }}>{filtered.length}</strong></div>
          <div><span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>Giá trị tồn đọng</span><br /><strong style={{ color: '#ef4444' }}>{formatVND(totalValue)}</strong></div>
          <div><span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>Chưa từng xuất</span><br /><strong style={{ color: '#9f1239' }}>{filtered.filter(r => r.neverExported).length}</strong></div>
          <div><span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>Tồn ≥ 1 năm không xuất</span><br /><strong style={{ color: '#6b7280' }}>{filtered.filter(r => (r.daysSinceLastExport || Infinity) >= 365).length}</strong></div>
        </div>
      )}

      <Card.Body className="p-0">
        {error && <Alert variant="danger" className="m-3">{error}</Alert>}
        {loading ? (
          <SkeletonTable cols={7} rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="💀" message="Không có hàng chết" sub={`Tất cả sản phẩm đều có giao dịch xuất trong ${days} ngày qua`} />
        ) : (
          <Table responsive hover className="mb-0" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Sản phẩm</th>
                <th className="text-center">Tồn kho</th>
                <th className="text-end">Giá vốn TB</th>
                <th className="text-end">Giá trị tồn</th>
                <th className="text-center">Lần cuối xuất</th>
                <th className="text-center">Số ngày</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.productId}>
                  <td><code style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>{r.sku}</code></td>
                  <td style={{ fontWeight: 500 }}>{r.productName}</td>
                  <td className="text-center">{r.currentStock}</td>
                  <td className="text-end text-muted">{r.avgUnitPrice.toLocaleString('vi-VN')}đ</td>
                  <td className="text-end fw-semibold text-danger">{formatVND(r.stockValue)}</td>
                  <td className="text-center">{r.lastExport ? new Date(r.lastExport).toLocaleDateString('vi-VN') : <span className="text-muted">Chưa từng xuất</span>}</td>
                  <td className="text-center">
                    {r.daysSinceLastExport !== null ? (
                      <Badge bg={r.daysSinceLastExport >= 365 ? 'dark' : 'danger'}>
                        {r.daysSinceLastExport} ngày
                      </Badge>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card.Body>
    </Card>
  );
};

export default DeadStockTab;
