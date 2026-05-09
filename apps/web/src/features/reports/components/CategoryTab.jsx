import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Badge, Row, Col, Form, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoDownload, IcoFolder, IcoFilter } from '@/components/common/Icons.jsx';
import { reportsAPI } from '@/services/api';
import { formatVND, today, downloadBlob } from '../utils/reportHelpers';

const CategoryTab = () => {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');

  const dateParams = dateFrom && dateTo ? { dateFrom, dateTo } : {};

  const load = useCallback(() => {
    setLoading(true); setError('');
    reportsAPI.getByCategory(dateParams)
      .then(r => setData(r.data?.data || []))
      .catch(() => setError('Không thể tải báo cáo danh mục'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const total = data.reduce((s, r) => s + r.stockValue, 0);

  const handleExport = async () => {
    if (!data.length) return;
    setExporting(true);
    try {
      const r = await reportsAPI.exportByCategory(dateParams);
      const label = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : today();
      downloadBlob(r.data, `bao-cao-danh-muc-${label}.csv`);
    } catch { 
      alert('Xuất CSV thất bại'); 
    } finally { 
      setExporting(false); 
    }
  };

  const periodLabel = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : 'Toàn bộ thời gian';

  return (
    <Card>
      <Card.Header>
        <Row className="align-items-center g-2">
          <Col className="me-auto">
            <span style={{ fontWeight: 600 }}>Báo cáo theo danh mục</span>
            {total > 0 && (
              <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginLeft: '.5rem' }}>
                · Tổng giá trị: <strong style={{ color: 'var(--color-indigo)' }}>{formatVND(total)}</strong>
              </span>
            )}
          </Col>
          <Col xs="auto" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <IcoFilter size={13} style={{ color: 'var(--text-secondary)' }} />
            <Form.Control
              type="date" size="sm" style={{ width: 140 }}
              value={dateFrom}
              max={dateTo || today()}
              placeholder="Từ ngày"
              onChange={e => setDateFrom(e.target.value)}
            />
            <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>→</span>
            <Form.Control
              type="date" size="sm" style={{ width: 140 }}
              value={dateTo}
              min={dateFrom} max={today()}
              placeholder="Đến ngày"
              onChange={e => setDateTo(e.target.value)}
            />
            {(dateFrom || dateTo) && (
              <button
                className="btn btn-sm"
                style={{ fontSize: '.75rem', padding: '2px 8px' }}
                onClick={() => { setDateFrom(''); setDateTo(''); }}
              >✕ Xoá</button>
            )}
            <button className="icon-btn icon-btn-success"
              style={{ padding: '.4rem .8rem', borderRadius: 6, fontSize: '.8rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={handleExport} disabled={exporting || data.length === 0}>
              {exporting ? <><Spinner size="sm" style={{ width: 12, height: 12 }} /> Đang xuất...</> : <><IcoDownload size={13} /> Xuất CSV</>}
            </button>
          </Col>
        </Row>
        {(dateFrom || dateTo) && (
          <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Kỳ lọc: <strong>{periodLabel}</strong>
            {!(dateFrom && dateTo) && <span style={{ color: '#ef4444', marginLeft: 6 }}>⚠ Cần chọn đủ ngày bắt đầu và kết thúc</span>}
          </div>
        )}
      </Card.Header>
      <Card.Body className="p-0">
        {error && <Alert variant="danger" className="m-3">{error}</Alert>}
        {loading ? (
          <SkeletonTable cols={7} rows={5} />
        ) : data.length === 0 ? (
          <EmptyState icon="category" message="Không có dữ liệu" sub="Chưa có dữ liệu theo danh mục" />
        ) : (
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Danh mục</th>
                <th className="text-center">Số SP</th>
                <th className="text-center">Tổng tồn</th>
                <th className="text-end">Giá trị kho</th>
                <th className="text-center">Hết hàng</th>
                <th className="text-center">Tồn thấp</th>
                <th>Tỷ trọng</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => {
                const pct = total > 0 ? Math.round((r.stockValue / total) * 100) : 0;
                return (
                  <tr key={r.categoryId}>
                    <td style={{ fontWeight: 600 }}>
                      <IcoFolder size={12} style={{ marginRight: 6, color: 'var(--color-violet)' }} />
                      {r.categoryName}
                    </td>
                    <td className="text-center"><Badge className="badge-neutral">{r.productCount}</Badge></td>
                    <td className="text-center" style={{ fontWeight: 600 }}>
                      {r.totalStock ? r.totalStock.toLocaleString('vi-VN') : 0}
                    </td>
                    <td className="text-end" style={{ fontWeight: 700, color: 'var(--color-indigo)' }}>
                      {formatVND(r.stockValue)}
                    </td>
                    <td className="text-center">
                      {r.outOfStockCount > 0
                        ? <Badge className="badge-danger">{r.outOfStockCount}</Badge>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>0</span>}
                    </td>
                    <td className="text-center">
                      {r.lowStockCount > 0
                        ? <Badge className="badge-warning">{r.lowStockCount}</Badge>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>0</span>}
                    </td>
                    <td style={{ width: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, background: '#f1f5f9', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, background: 'var(--color-violet)', height: '100%' }} />
                        </div>
                        <span style={{ fontSize: '.7rem', color: 'var(--text-secondary)', minWidth: 24 }}>{pct}%</span>
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

export default CategoryTab;
