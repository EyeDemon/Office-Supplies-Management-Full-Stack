import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Row, Col, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { reportsAPI } from '@/services/api';
import { formatVND } from '../utils/reportHelpers';

const FinancialTab = () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().slice(0, 10);

  const [grouping,  setGrouping]  = useState('category');
  const [dateFrom,  setDateFrom]  = useState(firstOfMonth);
  const [dateTo,    setDateTo]    = useState(todayStr);
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const load = useCallback(() => {
    if (!dateFrom || !dateTo) return;
    setLoading(true); setError('');
    reportsAPI.getFinancial({ dateFrom, dateTo, grouping })
      .then(r => setData(r.data.data || []))
      .catch(e => setError(e.response?.data?.message || 'Không thể tải báo cáo'))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, grouping]);

  useEffect(() => { load(); }, [load]);

  const totalImport = data.reduce((s, r) => s + (r.totalImportCost ?? 0), 0);
  const totalExport = data.reduce((s, r) => s + (r.totalExportCost ?? 0), 0);
  const maxCost = Math.max(...data.map(r => Math.max(r.totalImportCost ?? 0, r.totalExportCost ?? 0)), 1);

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Row className="g-2 align-items-end mb-3">
          <Col xs={12} sm={4} md={3}>
            <Form.Label className="small fw-semibold mb-1">Nhóm theo</Form.Label>
            <Form.Select size="sm" value={grouping} onChange={e => setGrouping(e.target.value)}>
              <option value="category">Danh mục sản phẩm</option>
              <option value="department">Phòng ban</option>
            </Form.Select>
          </Col>
          <Col xs={6} sm={3} md={2}>
            <Form.Label className="small fw-semibold mb-1">Từ ngày</Form.Label>
            <Form.Control size="sm" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </Col>
          <Col xs={6} sm={3} md={2}>
            <Form.Label className="small fw-semibold mb-1">Đến ngày</Form.Label>
            <Form.Control size="sm" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </Col>
          <Col xs={12} sm={2} md={2}>
            <Button size="sm" variant="primary" onClick={load} disabled={loading} className="w-100">
              {loading ? <Spinner size="sm" as="span" className="me-1" /> : null}
              Xem báo cáo
            </Button>
          </Col>
        </Row>

        {error && <Alert variant="danger" className="py-2">{error}</Alert>}

        {!loading && data.length > 0 && (
          <Row className="g-2 mb-3">
            <Col xs={6} md={4}>
              <div className="p-3 rounded" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div className="text-muted" style={{ fontSize: '.75rem' }}>Tổng giá trị nhập kỳ</div>
                <div className="fw-bold text-success" style={{ fontSize: '1.1rem' }}>{formatVND(totalImport)}</div>
              </div>
            </Col>
            <Col xs={6} md={4}>
              <div className="p-3 rounded" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                <div className="text-muted" style={{ fontSize: '.75rem' }}>Tổng giá trị xuất kỳ</div>
                <div className="fw-bold text-danger" style={{ fontSize: '1.1rem' }}>{formatVND(totalExport)}</div>
              </div>
            </Col>
            <Col xs={12} md={4}>
              <div className="p-3 rounded" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div className="text-muted" style={{ fontSize: '.75rem' }}>Chênh lệch (Nhập − Xuất)</div>
                <div className={`fw-bold ${totalImport - totalExport >= 0 ? 'text-primary' : 'text-warning'}`}
                  style={{ fontSize: '1.1rem' }}>
                  {totalImport - totalExport >= 0 ? '+' : ''}{formatVND(totalImport - totalExport)}
                </div>
              </div>
            </Col>
          </Row>
        )}

        {loading ? (
          <SkeletonTable cols={grouping === 'category' ? 4 : 3} rows={6} />
        ) : data.length === 0 ? (
          <EmptyState
            icon="💰"
            message="Không có dữ liệu trong kỳ"
            sub={`Không có giao dịch ${grouping === 'category' ? 'theo danh mục' : 'theo phòng ban'} từ ${dateFrom} đến ${dateTo}`}
          />
        ) : (
          <Table responsive hover className="mb-0" style={{ fontSize: '.83rem' }}>
            <thead className="table-light">
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>{grouping === 'category' ? 'Danh mục' : 'Phòng ban'}</th>
                {grouping === 'category' && <th className="text-end">Chi phí nhập</th>}
                <th className="text-end">Chi phí xuất</th>
                <th style={{ width: '30%' }}>Tỉ lệ xuất</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const exportPct = maxCost > 0 ? Math.round((r.totalExportCost / maxCost) * 100) : 0;
                return (
                  <tr key={i}>
                    <td className="text-muted">{i + 1}</td>
                    <td className="fw-semibold">{r.groupName || '—'}</td>
                    {grouping === 'category' && (
                      <td className="text-end text-success">{formatVND(r.totalImportCost)}</td>
                    )}
                    <td className="text-end text-danger fw-semibold">{formatVND(r.totalExportCost)}</td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div style={{
                          flex: 1, background: '#fee2e2', borderRadius: 4, height: 10, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${exportPct}%`, background: '#ef4444',
                            height: '100%', borderRadius: 4, transition: 'width .3s',
                          }} />
                        </div>
                        <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', minWidth: 32 }}>
                          {exportPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="table-light">
              <tr>
                <td colSpan={2} className="fw-bold text-end">Tổng cộng</td>
                {grouping === 'category' && <td className="fw-bold text-end text-success">{formatVND(totalImport)}</td>}
                <td className="fw-bold text-end text-danger">{formatVND(totalExport)}</td>
                <td />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card.Body>
    </Card>
  );
};

export default FinancialTab;
