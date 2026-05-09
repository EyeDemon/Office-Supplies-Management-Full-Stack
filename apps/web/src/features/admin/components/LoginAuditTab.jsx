import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Badge, Alert, Row, Col, Form } from 'react-bootstrap';
import { SkeletonBar, SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { auditAPI } from '@/services/api';
import { IcoAlertTriangle, IcoSearch, IcoRefresh, IcoDownload } from '@/components/common/Icons.jsx';
import { today, fmt } from './AuditLogHelpers';

const LoginAuditTab = () => {
  const [data,       setData]      = useState({ items: [], totalCount: 0, stats: {} });
  const [suspicious, setSuspicious]= useState([]);
  const [loading,    setLoading]   = useState(false);
  const [exporting,  setExporting] = useState(false);
  const [page,       setPage]      = useState(1);
  const [filters,    setFilters]   = useState({ username: '', success: '', dateFrom: '', dateTo: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        auditAPI.getLogins({ ...filters, page, size: 30 }),
        auditAPI.getSuspicious(),
      ]);
      setData(r.data?.data || { items: [], totalCount: 0, stats: {} });
      setSuspicious(s.data?.data || []);
    } catch { }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const r = await auditAPI.exportCsv(filters);
      const url = URL.createObjectURL(new Blob(['\uFEFF', r.data], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `login-audit-${today()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Xuất CSV thất bại.'); }
    finally { setExporting(false); }
  };

  const st = data.stats || {};
  const failRate = st.totalAttempts > 0 ? Math.round((st.failCount / st.totalAttempts) * 100) : 0;

  return (
    <>
      {suspicious.length > 0 && (
        <Alert variant="warning" className="mb-3" style={{ display:'flex', alignItems:'flex-start', gap:'.65rem' }}>
          <IcoAlertTriangle size={16} style={{ marginTop:2, flexShrink:0 }} />
          <div>
            <strong>Cảnh báo bảo mật:</strong> Phát hiện {suspicious.length} IP/tài khoản đăng nhập thất bại nhiều lần trong 24h.
            <div style={{ marginTop:'.5rem', display:'flex', flexWrap:'wrap', gap:'.4rem' }}>
              {suspicious.slice(0,5).map((s,i) => (
                <Badge key={i} className="badge-warning">{s.username} ({s.ip_address}) — {s.attempts} lần</Badge>
              ))}
            </div>
          </div>
        </Alert>
      )}

      <Row className="g-3 mb-3">
        {[
          { label:'Tổng đăng nhập',  val: st.totalAttempts || 0, color:'indigo'  },
          { label:'Thành công',       val: st.successCount  || 0, color:'emerald' },
          { label:'Thất bại',         val: st.failCount     || 0, color:'rose'    },
          { label:'Tỷ lệ thất bại',   val: `${failRate}%`,        color: failRate > 20 ? 'rose' : 'amber' },
        ].map(s => (
          <Col xs={6} md={3} key={s.label}>
            <div className={`stat-card-pro ${s.color}`}>
              <div className="stat-value">{loading ? <SkeletonBar width={48} height={20} /> : s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Card className="mb-3 shadow-sm border-0">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={3}><Form.Label className="filter-label">Username</Form.Label>
              <Form.Control size="sm" placeholder="Lọc theo username..." value={filters.username}
                onChange={e => setFilters(f=>({...f,username:e.target.value}))}
                onKeyDown={e => e.key==='Enter' && (setPage(1),load())} /></Col>
            <Col md={2}><Form.Label className="filter-label">Kết quả</Form.Label>
              <Form.Select size="sm" value={filters.success}
                onChange={e => { setFilters(f=>({...f,success:e.target.value})); setPage(1); }}>
                <option value="">Tất cả</option><option value="true">Thành công</option><option value="false">Thất bại</option>
              </Form.Select></Col>
            <Col md={2}><Form.Label className="filter-label">Từ ngày</Form.Label>
              <Form.Control size="sm" type="date" value={filters.dateFrom}
                onChange={e => setFilters(f=>({...f,dateFrom:e.target.value}))} /></Col>
            <Col md={2}><Form.Label className="filter-label">Đến ngày</Form.Label>
              <Form.Control size="sm" type="date" value={filters.dateTo}
                onChange={e => setFilters(f=>({...f,dateTo:e.target.value}))} /></Col>
            <Col md="auto" className="d-flex align-items-end gap-2">
              <button className="premium-btn btn-sm" onClick={()=>{setPage(1);load();}} style={{ height: '31px', padding: '0 1rem' }}>Tìm kiếm</button>
              <button className={`btn btn-outline-secondary btn-sm ${loading ? 'animate-spin' : ''}`}
                onClick={load} disabled={loading} style={{ height: '31px', padding: '0 0.8rem', fontWeight: 600 }}>
                {loading ? 'Đang tải...' : 'Làm mới'}
              </button>
              <button className="btn btn-outline-success btn-sm"
                onClick={handleExport} disabled={exporting} style={{ height: '31px', padding: '0 0.8rem', fontWeight: 600 }}>
                {exporting ? 'Đang xuất...' : 'Xuất CSV'}
              </button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="shadow-sm border-0">
        <Card.Header className="bg-white border-bottom-0 pt-3">
          <span style={{fontSize:'.8rem',color:'var(--text-secondary)',fontWeight:500}}>{data.totalCount} bản ghi</span>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (<table className="table mb-0"><tbody>{[1,2,3,4,5].map(i=><SkeletonRow key={i} cols={5}/>)}</tbody></table>) : (
            <Table responsive hover className="mb-0">
              <thead><tr><th>Thời gian</th><th>Username</th><th>IP</th><th className="text-center">Kết quả</th><th>User Agent</th></tr></thead>
              <tbody>
                {data.items.length===0
                  ? <tr><td colSpan={5} className="p-0"><EmptyState icon="search" message="Không có bản ghi đăng nhập" sub="Thử điều chỉnh bộ lọc hoặc chọn khoảng thời gian khác" /></td></tr>
                  : data.items.map(l => (
                    <tr key={l.id}>
                      <td style={{fontSize:'.78rem',whiteSpace:'nowrap'}}>{fmt(l.created_at)}</td>
                      <td style={{fontWeight:500,fontSize:'.82rem'}}>{l.username}</td>
                      <td style={{fontFamily:'monospace',fontSize:'.78rem',color:'var(--text-secondary)'}}>{l.ip_address}</td>
                      <td className="text-center">{l.success ? <Badge className="badge-success">THÀNH CÔNG</Badge> : <Badge className="badge-danger">THẤT BẠI</Badge>}</td>
                      <td style={{fontSize:'.72rem',color:'var(--text-secondary)',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={l.user_agent}>{l.user_agent||'—'}</td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {data.totalCount > 30 && (
          <Card.Footer className="d-flex justify-content-between align-items-center py-2 bg-white">
            <small className="text-muted">{(page-1)*30+1}–{Math.min(page*30,data.totalCount)} / {data.totalCount}</small>
            <div style={{display:'flex',gap:4}}>
              <button className="btn btn-sm btn-outline-secondary" onClick={()=>setPage(p=>p-1)} disabled={page===1}>Trước</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={()=>setPage(p=>p+1)} disabled={page*30>=data.totalCount}>Sau</button>
            </div>
          </Card.Footer>
        )}
      </Card>
    </>
  );
};

export default LoginAuditTab;
