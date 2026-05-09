import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Badge, Row, Col, Form, Modal, Button } from 'react-bootstrap';
import { SkeletonRow, SkeletonTable } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { generalAuditAPI } from '@/services/api';
import { IcoSearch, IcoRefresh, IcoDownload, IcoInbox } from '@/components/common/Icons.jsx';
import { ACTION_MAP, ENTITY_LABELS, today, fmt } from './AuditLogHelpers';

const GeneralAuditTab = () => {
  const [data, setData] = useState({ items: [], totalCount: 0 });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ entityType: '', action: '', changedBy: '', dateFrom: '', dateTo: '' });
  const [detailRow, setDetailRow] = useState(null);

  const SIZE = 30;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await generalAuditAPI.getAll({ ...filters, page, size: SIZE });
      setData(r.data?.data || { items: [], totalCount: 0 });
    } catch { }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await generalAuditAPI.exportCsv(filters);
      const url = URL.createObjectURL(new Blob(['\uFEFF', r.data], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `general-audit-${today()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Xuất CSV thất bại.'); }
    finally { setExporting(false); }
  };

  return (
    <>
      <Card className="mb-3 shadow-sm border-0">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={2}><Form.Label className="filter-label">Loại chứng từ</Form.Label>
              <Form.Select size="sm" value={filters.entityType}
                onChange={e => { setFilters(f => ({ ...f, entityType: e.target.value })); setPage(1); }}>
                <option value="">Tất cả</option>
                {Object.entries(ENTITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Form.Select></Col>
            <Col md={2}><Form.Label className="filter-label">Hành động</Form.Label>
              <Form.Select size="sm" value={filters.action}
                onChange={e => { setFilters(f => ({ ...f, action: e.target.value })); setPage(1); }}>
                <option value="">Tất cả</option>
                {Object.entries(ACTION_MAP).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
              </Form.Select></Col>
            <Col md={2}><Form.Label className="filter-label">Người thực hiện</Form.Label>
              <Form.Control size="sm" placeholder="Username..." value={filters.changedBy}
                onChange={e => setFilters(f => ({ ...f, changedBy: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && (setPage(1), load())} /></Col>
            <Col md={2}><Form.Label className="filter-label">Từ ngày</Form.Label>
              <Form.Control size="sm" type="date" value={filters.dateFrom}
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} /></Col>
            <Col md={2}><Form.Label className="filter-label">Đến ngày</Form.Label>
              <Form.Control size="sm" type="date" value={filters.dateTo}
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} /></Col>
            <Col md="auto" className="d-flex align-items-end gap-2">
              <button className="premium-btn btn-sm d-flex align-items-center gap-2" onClick={() => { setPage(1); load(); }} style={{ height: '31px', padding: '0 1rem' }}>
                <IcoSearch size={14} /> Tìm kiếm
              </button>
              <button className={`btn btn-outline-secondary btn-sm d-flex align-items-center gap-2 ${loading ? 'animate-spin' : ''}`}
                onClick={load} disabled={loading} style={{ height: '31px', padding: '0 0.8rem', fontWeight: 600 }}>
                <IcoRefresh size={14} /> {loading ? 'Đang tải...' : 'Làm mới'}
              </button>
              <button className="btn btn-outline-success btn-sm d-flex align-items-center gap-2"
                onClick={handleExport} disabled={exporting} style={{ height: '31px', padding: '0 0.8rem', fontWeight: 600 }}>
                <IcoDownload size={14} /> {exporting ? 'Đang xuất...' : 'Xuất CSV'}
              </button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="shadow-sm border-0">
        <Card.Header className="bg-white border-bottom-0 pt-3">
          <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{data.totalCount} bản ghi</span>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (<table className="table mb-0"><tbody>{[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} cols={5} />)}</tbody></table>) : (
            <Table responsive hover className="mb-0" style={{ fontSize: '.82rem' }}>
              <thead>
                <tr>
                  <th>Thời gian</th><th>Loại chứng từ</th><th>ID</th>
                  <th className="text-center">Hành động</th><th>Người thực hiện</th><th>IP</th><th>Ghi chú</th><th className="text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0
                  ? <tr><td colSpan={8} className="p-0"><EmptyState icon="search" message="Chưa có nhật ký hoạt động" sub="Thử điều chỉnh bộ lọc Entity, Hành động hoặc khoảng ngày" /></td></tr>
                  : data.items.map(row => {
                    const act = ACTION_MAP[row.action] || { label: row.action, cls: 'badge-neutral' };
                    return (
                      <tr key={row.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '.78rem' }}>{fmt(row.created_at)}</td>
                        <td>{ENTITY_LABELS[row.entity_type] || row.entity_type}</td>
                        <td style={{ fontFamily: 'monospace' }}>{row.entity_id}</td>
                        <td className="text-center"><Badge className={act.cls}>{act.label}</Badge></td>
                        <td style={{ fontWeight: 500 }}>{row.changed_by_name || row.changed_by}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '.75rem', color: 'var(--text-secondary)' }}>{row.ip_address || '—'}</td>
                        <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }} title={row.note}>{row.note || '—'}</td>
                        <td className="text-center">
                          {(row.before_data || row.after_data) && (
                            <button className="btn btn-link btn-sm p-0 d-inline-flex align-items-center gap-1" style={{ fontWeight: 600, fontSize: '.75rem', textDecoration: 'none' }} onClick={() => setDetailRow(row)}>
                              <IcoInbox size={12} /> Chi tiết
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {data.totalCount > SIZE && (
          <Card.Footer className="d-flex justify-content-between align-items-center py-2 bg-white">
            <small className="text-muted">{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, data.totalCount)} / {data.totalCount}</small>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1}>Trước</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage(p => p + 1)} disabled={page * SIZE >= data.totalCount}>Sau</button>
            </div>
          </Card.Footer>
        )}
      </Card>

      <Modal show={!!detailRow} onHide={() => setDetailRow(null)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Chi tiết thay đổi — {detailRow && (ACTION_MAP[detailRow.action]?.label || detailRow.action)}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailRow && (
            <Row className="g-3">
              <Col md={6}>
                <div style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>Trước (Before)</div>
                <pre style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, fontSize: '.75rem', maxHeight: 300, overflow: 'auto', margin: 0 }}>
                  {detailRow.before_data ? JSON.stringify(typeof detailRow.before_data === 'string' ? JSON.parse(detailRow.before_data) : detailRow.before_data, null, 2) : '(không có)'}
                </pre>
              </Col>
              <Col md={6}>
                <div style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>Sau (After)</div>
                <pre style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, fontSize: '.75rem', maxHeight: 300, overflow: 'auto', margin: 0 }}>
                  {detailRow.after_data ? JSON.stringify(typeof detailRow.after_data === 'string' ? JSON.parse(detailRow.after_data) : detailRow.after_data, null, 2) : '(không có)'}
                </pre>
              </Col>
              {detailRow.note && <Col xs={12}><div style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Ghi chú</div><div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', fontSize: '.82rem' }}>{detailRow.note}</div></Col>}
            </Row>
          )}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" size="sm" onClick={() => setDetailRow(null)}>Đóng</Button></Modal.Footer>
      </Modal>
    </>
  );
};

export default GeneralAuditTab;
