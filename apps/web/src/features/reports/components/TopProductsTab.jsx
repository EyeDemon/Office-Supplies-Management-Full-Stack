import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Badge, Row, Col, Form, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoDownload } from '@/components/common/Icons.jsx';
import { reportsAPI } from '@/services/api';
import { today, downloadBlob } from '../utils/reportHelpers';

const TYPE_COLOR = { 
  EXPORT: 'var(--color-danger)', 
  IMPORT: 'var(--color-success)', 
  ADJUST: 'var(--color-warning)' 
};

const TYPE_LABEL = { 
  EXPORT: 'Xuất nhiều nhất', 
  IMPORT: 'Nhập nhiều nhất', 
  ADJUST: 'Điều chỉnh nhiều nhất' 
};

const TopProductsTab = () => {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');
  const [type,      setType]      = useState('EXPORT');
  const [days,      setDays]      = useState(30);

  const load = useCallback(() => {
    setLoading(true);
    reportsAPI.getTopProducts({ type, days, limit: 15 })
      .then(r => setData(r.data?.data || []))
      .catch(() => setError('Không thể tải dữ liệu'))
      .finally(() => setLoading(false));
  }, [type, days]);

  useEffect(() => { load(); }, [load]);

  const maxQty = data[0]?.total_qty || 1;

  const handleExport = async () => {
    if (!data.length) return;
    setExporting(true);
    try {
      const r = await reportsAPI.exportTopProducts({ type, days, limit: 100 });
      downloadBlob(r.data, `top-san-pham-${type.toLowerCase()}-${days}ngay-${today()}.csv`);
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
          <Col xs={12} sm="auto" className="me-auto">
            <span style={{ fontWeight: 600 }}>Top 15 — {TYPE_LABEL[type]}</span>
          </Col>
          <Col xs="auto">
            <Form.Select size="sm" value={type} onChange={e => setType(e.target.value)} style={{ width: 170 }}>
              <option value="EXPORT">Xuất nhiều nhất</option>
              <option value="IMPORT">Nhập nhiều nhất</option>
              <option value="ADJUST">Điều chỉnh nhiều nhất</option>
            </Form.Select>
          </Col>
          <Col xs="auto">
            <Form.Select size="sm" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 110 }}>
              <option value={7}>7 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={365}>1 năm</option>
            </Form.Select>
          </Col>
          <Col xs="auto">
            <button className="icon-btn icon-btn-success"
              style={{ padding: '.4rem .8rem', borderRadius: 6, fontSize: '.8rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={handleExport} disabled={exporting || data.length === 0}>
              {exporting
                ? <><Spinner size="sm" style={{ width: 12, height: 12 }} /> Đang xuất...</>
                : <><IcoDownload size={13} /> Xuất CSV</>}
            </button>
          </Col>
        </Row>
      </Card.Header>
      <Card.Body className="p-0">
        {error && <Alert variant="danger" className="m-3">{error}</Alert>}
        {loading ? (
          <SkeletonTable cols={6} rows={5} />
        ) : data.length === 0 ? (
          <EmptyState icon="📊" message="Không có dữ liệu" sub="Chưa có giao dịch trong khoảng này" />
        ) : (
          <Table responsive className="mb-0">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Sản phẩm</th>
                <th>Danh mục</th>
                <th className="text-center">Số lượng</th>
                <th className="text-center">Lần GD</th>
                <th style={{ minWidth: 160 }}>Biểu đồ ngang</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const barPct = Math.round((r.total_qty / maxQty) * 100);
                return (
                  <tr key={r.id}>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: '50%', fontSize: '.72rem', fontWeight: 700,
                        background: i < 3 ? TYPE_COLOR[type] : 'var(--border-color)',
                        color: i < 3 ? '#fff' : 'var(--text-secondary)',
                      }}>{i + 1}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{r.name}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.sku}</div>
                    </td>
                    <td><Badge className="badge-neutral">{r.category_name}</Badge></td>
                    <td className="text-center">
                      <span style={{ fontWeight: 700, fontSize: '.9rem', color: TYPE_COLOR[type] }}>
                        {r.total_qty.toLocaleString('vi-VN')}
                      </span>
                    </td>
                    <td className="text-center" style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>{r.tx_count}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--border-color)', overflow: 'hidden' }}>
                          <div style={{ width: barPct + '%', height: '100%', borderRadius: 5, background: TYPE_COLOR[type], transition: 'width .5s ease' }} />
                        </div>
                        <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', minWidth: 30 }}>{barPct}%</span>
                      </div>
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

export default TopProductsTab;
