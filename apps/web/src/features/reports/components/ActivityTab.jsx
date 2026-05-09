import React, { useState } from 'react';
import { Card, Table, Badge, Row, Col, Form, Spinner } from 'react-bootstrap';
import { SkeletonTable, SkeletonBar } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import {
  IcoBarChart, IcoDownload, IcoSearch, IcoAlertTriangle,
  IcoTrendUp, IcoBox, IcoUsers,
} from '@/components/common/Icons.jsx';
import { reportsAPI } from '@/services/api';
import { today, downloadBlob } from '../utils/reportHelpers';

const ActivityTab = ({ data, loading, exportParams, actWarehouseId }) => {
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const filtered = data.filter(r =>
    !search ||
    r.productName.toLowerCase().includes(search.toLowerCase()) ||
    r.sku.toLowerCase().includes(search.toLowerCase()) ||
    (r.categoryName || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalImport = filtered.reduce((s, r) => s + r.importedQty, 0);
  const totalExport = filtered.reduce((s, r) => s + r.exportedQty, 0);
  const totalTx     = filtered.reduce((s, r) => s + r.totalTransactions, 0);
  const lowCount    = filtered.filter(r => r.isLowStock).length;

  const handleExport = async () => {
    if (!data.length) return;
    setExporting(true);
    try {
      const r = await reportsAPI.exportCsv(exportParams || {});
      downloadBlob(r.data, `bao-cao-kho-${today()}.csv`);
    } catch { 
      alert('Xuất CSV thất bại'); 
    } finally { 
      setExporting(false); 
    }
  };

  return (
    <>
      <Row className="g-3 mb-4">
        {[
          { color: 'emerald', icon: IcoTrendUp,      value: totalImport, label: 'Tổng nhập kho' },
          { color: 'rose',    icon: IcoBox,           value: totalExport, label: 'Tổng xuất kho' },
          { color: 'indigo',  icon: IcoBarChart,      value: totalTx,     label: 'Giao dịch' },
          { color: 'amber',   icon: IcoAlertTriangle, value: lowCount,    label: 'Cần nhập thêm' },
        ].map(({ color, icon: Icon, value, label }) => (
          <Col xs={6} md={3} key={label}>
            <div className={'stat-card-pro ' + color}>
              <div className={'stat-card-icon ' + color}><Icon size={16} strokeWidth={2} /></div>
              <div className="stat-value">{loading ? <SkeletonBar width="64px" height={24} /> : value}</div>
              <div className="stat-label">{label}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Card>
        <Card.Header>
          <Row className="align-items-center g-2">
            <Col xs={12} sm="auto" className="me-auto">
              <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {filtered.length} sản phẩm
                {exportParams?.department && (
                  <Badge className="badge-neutral ms-2" style={{ fontSize: '.72rem' }}>
                    <IcoUsers size={10} style={{ marginRight: 4 }} />
                    {exportParams.department}
                  </Badge>
                )}
              </span>
            </Col>
            <Col xs={12} sm="auto">
              <div className="search-bar" style={{ maxWidth: 260 }}>
                <span className="search-bar-icon"><IcoSearch size={14} /></span>
                <Form.Control placeholder="Tìm sản phẩm, SKU, danh mục..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </Col>
            <Col xs="auto">
              <button className="icon-btn icon-btn-success"
                style={{ padding: '.4rem .8rem', borderRadius: 6, fontSize: '.8rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onClick={handleExport} disabled={exporting || filtered.length === 0}>
                {exporting
                  ? <><Spinner size="sm" style={{ width: 12, height: 12 }} /> Đang xuất...</>
                  : <><IcoDownload size={13} /> Xuất CSV</>}
              </button>
            </Col>
          </Row>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (
            <SkeletonTable cols={8} rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState icon="📊" message="Không có dữ liệu" sub="Chưa có giao dịch nào trong khoảng thời gian đã chọn" />
          ) : (
            <Table responsive hover className="mb-0">
              <thead>
                <tr>
                  <th>SKU</th><th>Sản phẩm</th><th>Danh mục</th>
                  <th className="text-center">Tồn kho</th>
                  <th className="text-center">Nhập</th>
                  <th className="text-center">Xuất</th>
                  <th className="text-center">GD</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.productId}
                    className={r.currentStock === 0 ? 'row-out-of-stock' : r.isLowStock ? 'row-low-stock' : ''}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '.78rem', color: 'var(--text-secondary)' }}>{r.sku}</span></td>
                    <td style={{ fontWeight: 600, fontSize: '.875rem' }}>{r.productName}</td>
                    <td><Badge className="badge-neutral">{r.categoryName || '—'}</Badge></td>
                    <td className="text-center">
                      <Badge className={r.currentStock === 0 ? 'badge-danger' : r.isLowStock ? 'badge-warning' : 'badge-success'}>
                        {r.currentStock}
                      </Badge>
                      {actWarehouseId && r.warehouseAvgPrice > 0 && (
                        <div style={{ fontSize: '.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          avg: {r.warehouseAvgPrice.toLocaleString('vi-VN')}đ
                        </div>
                      )}
                    </td>
                    <td className="text-center" style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: '.85rem' }}>
                      {r.importedQty > 0 ? '+' + r.importedQty : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                    </td>
                    <td className="text-center" style={{ color: r.exportedQty > 0 ? 'var(--color-danger)' : 'var(--text-muted)', fontWeight: r.exportedQty > 0 ? 600 : 400, fontSize: '.85rem' }}>
                      {r.exportedQty > 0 ? '-' + r.exportedQty : '0'}
                    </td>
                    <td className="text-center" style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>{r.totalTransactions}</td>
                    <td>
                      {r.currentStock === 0
                        ? <Badge className="badge-danger">Hết hàng</Badge>
                        : r.isLowStock
                        ? <Badge className="badge-warning">Tồn thấp</Badge>
                        : <Badge className="badge-success">Bình thường</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
    </>
  );
};

export default ActivityTab;
