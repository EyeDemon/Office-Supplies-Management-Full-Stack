import React from 'react';
import { Card, Table, Badge, Row, Col, Form, Button, Spinner } from 'react-bootstrap';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import { IcoDownload, IcoAdjust } from '@/components/common/Icons.jsx';

const AdjustmentHistory = ({ 
  history, total, pages, page, loading, 
  onPageChange, onSearchChange, onExport, exporting,
  dateFrom, dateTo, onDateChange
}) => {
  const diffBadge = diff => {
    if (!diff) return <Badge bg="secondary">0</Badge>;
    return <Badge bg={diff > 0 ? 'success' : 'danger'}>{diff > 0 ? `+${diff}` : diff}</Badge>;
  };

  const fmtDate = d => d
    ? new Date(d).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—';

  return (
    <Card className="shadow-sm border-0">
      <Card.Header className="py-2 bg-white border-bottom">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-semibold small">Lịch sử điều chỉnh</span>
          <div className="d-flex gap-1 align-items-center">
            <Badge bg="secondary">{total}</Badge>
            <Button size="sm" variant="outline-secondary" onClick={onExport} disabled={exporting}>
              {exporting ? <Spinner size="sm"/> : <IcoDownload size={13}/>}
            </Button>
          </div>
        </div>
        <Row className="g-1">
          <Col>
            <Form.Control size="sm" placeholder="Tìm SP, SKU, lý do..."
              onChange={e => onSearchChange(e.target.value)} />
          </Col>
        </Row>
        <Row className="g-1 mt-1">
          <Col>
            <Form.Control type="date" size="sm" value={dateFrom}
              onChange={e => onDateChange('from', e.target.value)} />
          </Col>
          <Col>
            <Form.Control type="date" size="sm" value={dateTo}
              onChange={e => onDateChange('to', e.target.value)} />
          </Col>
        </Row>
      </Card.Header>
      <Card.Body className="p-0">
        {loading ? (
          <Table size="sm" className="mb-0"><tbody>
            {[1,2,3].map(i => <SkeletonRow key={i} cols={4} />)}
          </tbody></Table>
        ) : history.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <IcoAdjust size={36} className="mb-2 opacity-25 d-block mx-auto" />
            <div className="small fw-bold">Chưa có điều chỉnh nào</div>
          </div>
        ) : (
          <Table size="sm" hover className="mb-0">
            <thead className="table-light">
              <tr>
                <th>Sản phẩm</th>
                <th className="text-center">Trước</th>
                <th className="text-center">Sau</th>
                <th className="text-center">Chênh</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {history.map(t => (
                <tr key={t.id}>
                  <td>
                    <div className="small fw-bold text-truncate" style={{maxWidth: 120}} title={t.productName}>{t.productName}</div>
                    <div className="text-muted text-truncate" style={{fontSize: '0.7rem', maxWidth: 120}} title={t.note}>{t.note}</div>
                  </td>
                  <td className="text-center small">{t.stockBefore}</td>
                  <td className="text-center small fw-bold">{t.stockAfter}</td>
                  <td className="text-center">{diffBadge(t.difference)}</td>
                  <td className="text-muted" style={{fontSize: '0.7rem'}}>{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card.Body>
      {pages > 1 && (
        <Card.Footer className="py-2 d-flex justify-content-between align-items-center">
          <Button size="sm" variant="outline-secondary" disabled={page<=1} onClick={()=>onPageChange(page-1)}>‹</Button>
          <span className="small">{page}/{pages}</span>
          <Button size="sm" variant="outline-secondary" disabled={page>=pages} onClick={()=>onPageChange(page+1)}>›</Button>
        </Card.Footer>
      )}
    </Card>
  );
};

export default AdjustmentHistory;
