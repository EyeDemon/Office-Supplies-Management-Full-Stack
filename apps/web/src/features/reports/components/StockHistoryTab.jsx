import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Badge, Row, Col, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable, SkeletonBar } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoDownload, IcoBarChart } from '@/components/common/Icons.jsx';
import { reportsAPI } from '@/services/api';
import { today, downloadBlob } from '../utils/reportHelpers';

const MiniChart = ({ chartData }) => {
  if (!chartData.length) return null;
  const W = 680, H = 160, PL = 52, PR = 16, PT = 14, PB = 34;
  const cW = W - PL - PR, cH = H - PT - PB;
  const vals  = chartData.map(d => d.totalStockQty);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals);
  const range = maxV - minV || 1;
  const pts   = chartData.map((d, i) => ({
    x: PL + (i / Math.max(chartData.length - 1, 1)) * cW,
    y: PT + cH - ((d.totalStockQty - minV) / range) * cH,
    ...d,
  }));
  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M${pts[0].x.toFixed(1)},${(PT + cH).toFixed(1)} ` +
    pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ` L${pts[pts.length-1].x.toFixed(1)},${(PT + cH).toFixed(1)} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    v: Math.round(minV + range * f),
    y: (PT + cH - f * cH).toFixed(1),
  }));
  const step = Math.ceil(pts.length / 7);
  const xLabels = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PL} y1={t.y} x2={W - PR} y2={t.y}
            stroke="var(--border-color)" strokeWidth="1" strokeDasharray="4,3" />
          <text x={PL - 5} y={parseFloat(t.y) + 4} textAnchor="end"
            style={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {t.v >= 1000 ? `${(t.v/1000).toFixed(0)}k` : t.v}
          </text>
        </g>
      ))}
      <path d={area} fill="var(--color-indigo)" fillOpacity="0.10" />
      <polyline points={polyline} fill="none" stroke="var(--color-indigo)"
        strokeWidth="2" strokeLinejoin="round" />
      {pts.length <= 14 && pts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3"
          fill="var(--color-indigo)" stroke="white" strokeWidth="1.5" />
      ))}
      {xLabels.map((p, i) => (
        <text key={i} x={p.x.toFixed(1)} y={H - 5} textAnchor="middle"
          style={{ fontSize: 9, fill: 'var(--text-muted)' }}>
          {p.snapshotDate.slice(5)}
        </text>
      ))}
    </svg>
  );
};

const StockHistoryTab = ({ warehouses = [] }) => {
  const todayStr = today();
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState(todayStr);
  const [warehouseId, setWarehouseId] = useState('');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    reportsAPI.getStockHistory({ dateFrom, dateTo, warehouseId: warehouseId || undefined })
      .then(r => setData(r.data?.data || null))
      .catch(() => setError('Không thể tải lịch sử tồn kho'))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, warehouseId]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await reportsAPI.exportStockHistory({ dateFrom, dateTo, warehouseId: warehouseId || undefined });
      downloadBlob(r.data, `lich-su-ton-${dateFrom}_${dateTo}.csv`);
    } catch { alert('Xuất CSV thất bại'); }
    finally { setExporting(false); }
  };

  const rows      = data?.rows      || [];
  const chartData = data?.chartData || [];
  const meta      = data?.meta      || {};

  const first = chartData[0];
  const last  = chartData[chartData.length - 1];
  const delta = first && last ? last.totalStockQty - first.totalStockQty : 0;
  const maxQty = chartData.length ? Math.max(...chartData.map(d => d.totalStockQty)) : 0;

  return (
    <>
      <Card className="mb-3">
        <Card.Body className="py-2">
          <Row className="g-2 align-items-end">
            <Col xs={12} sm={6} md={2}>
              <Form.Label className="form-label-sm mb-1">Từ ngày</Form.Label>
              <Form.Control size="sm" type="date" value={dateFrom} max={dateTo}
                onChange={e => setDateFrom(e.target.value)} />
            </Col>
            <Col xs={12} sm={6} md={2}>
              <Form.Label className="form-label-sm mb-1">Đến ngày</Form.Label>
              <Form.Control size="sm" type="date" value={dateTo} min={dateFrom} max={todayStr}
                onChange={e => setDateTo(e.target.value)} />
            </Col>
            <Col xs={12} sm={6} md={3}>
              <Form.Label className="form-label-sm mb-1">Kho</Form.Label>
              <Form.Select size="sm" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                <option value="">— Tất cả kho —</option>
                {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Form.Select>
            </Col>
            <Col xs="auto" className="ms-auto d-flex gap-2">
              <Button size="sm" variant="primary" onClick={load} disabled={loading}>
                {loading ? <Spinner size="sm" /> : 'Xem'}
              </Button>
              {rows.length > 0 && (
                <Button size="sm" variant="outline-secondary" onClick={handleExport} disabled={exporting}>
                  <IcoDownload size={13} /> CSV
                </Button>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {data && (
        <div className="mb-3 d-flex align-items-center gap-2">
          <Badge bg={meta.usingSnapshot ? 'success' : 'warning'} style={{ fontSize: '.73rem' }}>
            {meta.usingSnapshot ? '📸 Snapshot' : '🔍 Fallback scan'}
          </Badge>
          <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
            {meta.usingSnapshot
              ? `Dữ liệu từ bảng stock_snapshot_daily · ${meta.rowCount} dòng`
              : 'Snapshot chưa sẵn (cron 23:59 chưa chạy) · tái tạo từ stock_transactions'}
          </span>
        </div>
      )}

      {chartData.length > 0 && (
        <Row className="g-3 mb-4">
          {[
            { color: 'indigo',  value: first?.totalStockQty?.toLocaleString('vi-VN') ?? '—', label: `Tồn đầu kỳ (${first?.snapshotDate ?? ''})` },
            { color: 'emerald', value: last?.totalStockQty?.toLocaleString('vi-VN')  ?? '—', label: `Tồn cuối kỳ (${last?.snapshotDate ?? ''})` },
            { color: delta >= 0 ? 'emerald' : 'rose', value: (delta >= 0 ? '+' : '') + delta.toLocaleString('vi-VN'), label: 'Biến động kỳ' },
            { color: 'amber',   value: maxQty.toLocaleString('vi-VN'), label: 'Tồn cao nhất' },
          ].map(({ color, value, label }) => (
            <Col xs={6} md={3} key={label}>
              <div className={`stat-card-pro ${color}`}>
                <div className="stat-value" style={{ fontSize: '1.3rem' }}>
                  {loading ? <SkeletonBar width="64px" height={24} /> : value}
                </div>
                <div className="stat-label">{label}</div>
              </div>
            </Col>
          ))}
        </Row>
      )}

      {chartData.length > 0 && (
        <Card className="mb-3">
          <Card.Header style={{ fontWeight: 600, fontSize: '.87rem' }}>
            <IcoBarChart size={14} style={{ marginRight: 6 }} />
            Biểu đồ tồn kho theo ngày
          </Card.Header>
          <Card.Body>
            {loading ? <SkeletonBar height={160} /> : <MiniChart chartData={chartData} />}
          </Card.Body>
        </Card>
      )}

      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span style={{ fontWeight: 600, fontSize: '.87rem' }}>Chi tiết lịch sử tồn kho</span>
          <Badge bg="secondary">{rows.length} dòng</Badge>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (
            <SkeletonTable rows={6} cols={8} />
          ) : rows.length === 0 ? (
            <EmptyState icon={IcoBarChart} message="Không có dữ liệu"
              sub="Chưa có snapshot hoặc giao dịch trong khoảng thời gian này" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table hover responsive className="mb-0" style={{ fontSize: '.82rem' }}>
                <thead>
                  <tr>
                    <th>Ngày</th><th>Kho</th><th>SKU</th><th>Sản phẩm</th>
                    <th className="text-end">Tồn cuối ngày</th>
                    <th className="text-end">Đặt trước</th>
                    <th className="text-end">Khả dụng</th>
                    <th className="text-end">Giá vốn TB</th>
                    <th className="text-end">Tổng giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '.78rem' }}>{r.snapshotDate}</td>
                      <td><Badge className="badge-neutral">{r.warehouseName}</Badge></td>
                      <td><code style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>{r.sku}</code></td>
                      <td style={{ fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.productName}</td>
                      <td className="text-end" style={{ fontWeight: 600 }}>{r.stockQty.toLocaleString('vi-VN')}</td>
                      <td className="text-end" style={{ color: r.reservedQty > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{r.reservedQty.toLocaleString('vi-VN')}</td>
                      <td className="text-end" style={{ color: r.availableQty <= 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{r.availableQty.toLocaleString('vi-VN')}</td>
                      <td className="text-end" style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>
                        {r.avgUnitPrice.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}đ
                      </td>
                      <td className="text-end" style={{ fontWeight: 600, color: 'var(--color-indigo)' }}>
                        {r.totalValue >= 1_000_000
                          ? (r.totalValue / 1_000_000).toFixed(1) + ' tr'
                          : r.totalValue.toLocaleString('vi-VN') + 'đ'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  );
};

export default StockHistoryTab;
