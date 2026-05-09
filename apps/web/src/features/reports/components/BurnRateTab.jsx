import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Badge, Row, Col, Form, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoDownload, IcoSearch } from '@/components/common/Icons.jsx';
import { reportsAPI } from '@/services/api';

const STATUS_BURN = {
  critical:       { label: 'Sắp hết', color: '#ef4444' },
  warning:        { label: 'Cảnh báo', color: '#f59e0b' },
  ok:             { label: 'Ổn định',  color: '#10b981' },
  no_consumption: { label: 'Không xuất', color: '#6b7280' },
};

const BurnRateTab = () => {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');
  const [days,      setDays]      = useState(30);
  const [search,    setSearch]    = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    reportsAPI.getBurnRate({ days })
      .then(r => setData(r.data?.data?.items || []))
      .catch(() => setError('Không thể tải dữ liệu burn rate'))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter(r =>
    !search ||
    r.productName.toLowerCase().includes(search.toLowerCase()) ||
    r.sku.toLowerCase().includes(search.toLowerCase())
  );

  const critical = filtered.filter(r => r.status === 'critical').length;
  const warning  = filtered.filter(r => r.status === 'warning').length;

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await reportsAPI.exportBurnRate({ days });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `burn-rate-${days}ngay-${new Date().toISOString().slice(0,10)}.csv`;
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
            <span style={{ fontWeight: 600 }}>🔥 Phân tích Burn Rate — Dự báo hết hàng</span>
            <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Tốc độ tiêu thụ trung bình mỗi ngày · kỳ {days} ngày
              {critical > 0 && (
                <span style={{ marginLeft: 8, color: '#ef4444', fontWeight: 600 }}>
                  ⚠ {critical} sản phẩm sắp hết trong 7 ngày
                </span>
              )}
              {warning > 0 && (
                <span style={{ marginLeft: 8, color: '#f59e0b', fontWeight: 600 }}>
                  · {warning} cảnh báo 30 ngày
                </span>
              )}
            </div>
          </Col>
          <Col xs="auto">
            <Form.Select size="sm" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 110 }}>
              <option value={7}>7 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={180}>180 ngày</option>
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
              onClick={handleExport} disabled={exporting || data.length === 0}>
              {exporting ? <><Spinner size="sm" style={{ width: 12, height: 12 }} /> Đang xuất...</>
                         : <><IcoDownload size={13} /> Xuất CSV</>}
            </button>
          </Col>
        </Row>
      </Card.Header>
      <Card.Body className="p-0">
        {error && <Alert variant="danger" className="m-3">{error}</Alert>}
        {loading ? (
          <SkeletonTable cols={8} rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔥" message="Không có dữ liệu" sub={`Chưa có sản phẩm nào được xuất trong kỳ ${days} ngày`} />
        ) : (
          <Table responsive hover className="mb-0" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Sản phẩm</th>
                <th className="text-center">Tồn KD</th>
                <th className="text-center">Xuất {days}N</th>
                <th className="text-center">Burn Rate<br /><span style={{ fontWeight: 400, fontSize: '.72rem' }}>(cái/ngày)</span></th>
                <th className="text-center">Còn dùng<br /><span style={{ fontWeight: 400, fontSize: '.72rem' }}>(ngày)</span></th>
                <th>Tiến trình</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const status = r.daysRemaining === null ? STATUS_BURN.no_consumption : STATUS_BURN[r.status] || STATUS_BURN.ok;
                const progressPct = r.daysRemaining === null ? 0 : Math.max(0, Math.min(100, (r.daysRemaining / 60) * 100));

                return (
                  <tr key={r.productId}>
                    <td><code style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>{r.sku}</code></td>
                    <td style={{ fontWeight: 500 }}>{r.productName}</td>
                    <td className="text-center">{r.availableStock}</td>
                    <td className="text-center">{r.totalExported}</td>
                    <td className="text-center fw-semibold text-indigo">{r.burnRatePerDay}</td>
                    <td className="text-center">
                      {r.daysRemaining === null ? '∞' : (
                        <span style={{ fontWeight: 700, color: status.color }}>{r.daysRemaining} ngày</span>
                      )}
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden', marginTop: 8 }}>
                        <div style={{
                          width: `${progressPct}%`,
                          height: '100%',
                          background: status.color,
                          transition: 'width .3s'
                        }} />
                      </div>
                    </td>
                    <td>
                      <Badge style={{ background: status.color }}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card.Body>
    </Card>
  );
};

export default BurnRateTab;
