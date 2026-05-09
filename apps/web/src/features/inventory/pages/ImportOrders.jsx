// page/ImportOrders.js — v63 (Refactored for Maintainability)
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Form, Badge, Table, Button, Alert, Spinner, Pagination } from 'react-bootstrap';
import { orderAPI, supplierAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import useAutoAlert from '@/hooks/useAutoAlert';
import { IcoPlus, IcoDownload, IcoFilter, IcoX } from '@/components/common/Icons.jsx';

// Sub-components
import ImportOrderForm   from '../components/ImportOrderForm';
import ImportOrderDetail from '../components/ImportOrderDetail';

const STATUS_MAP = {
  DRAFT:     { label: 'Nháp',       cls: 'badge-neutral' },
  PENDING:   { label: 'Chờ duyệt',  cls: 'badge-warning' },
  APPROVED:  { label: 'Đã duyệt',   cls: 'badge-info'    },
  COMPLETED: { label: 'Hoàn tất',   cls: 'badge-success' },
  CANCELLED: { label: 'Đã huỷ',     cls: 'badge-danger'  },
  CONFIRMED: { label: 'Hoàn tất',   cls: 'badge-success' },
};

const STATUS_FILTERS = ['', 'DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED'];

const printImportOrder = (order) => {
  if (!order) return;
  const statusLabel = STATUS_MAP[order.status]?.label || order.status;
  const rows = (order.items || []).map((item, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="font-family:monospace;font-size:11px">${item.sku || ''}</td>
      <td>${item.productName || ''}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">${Number(item.unitPrice || 0).toLocaleString('vi-VN')}đ</td>
      <td style="text-align:right;font-weight:700">${Number(item.totalPrice || 0).toLocaleString('vi-VN')}đ</td>
    </tr>`).join('');
  const total = (order.items || []).reduce((s, i) => s + Number(i.totalPrice || 0), 0);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Phiếu nhập kho ${order.orderCode}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:13px;margin:20px;color:#111}
      h2{text-align:center;font-size:18px;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#f0f0f0;border:1px solid #ccc;padding:6px 8px;text-align:left}
      td{border:1px solid #ddd;padding:5px 8px}
    </style></head><body>
    <h2>PHIẾU NHẬP KHO</h2>
    <p style="text-align:center">Mã phiếu: <strong>${order.orderCode}</strong> | Trạng thái: <strong>${statusLabel}</strong></p>
    <table>
      <thead><tr><th>#</th><th>SKU</th><th>Sản phẩm</th><th style="text-align:center">SL</th><th style="text-align:right">Đơn giá</th><th style="text-align:right">Thành tiền</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5" style="text-align:right">Tổng cộng:</td><td style="text-align:right">${total.toLocaleString('vi-VN')}đ</td></tr></tfoot>
    </table>
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=850,height=700');
  if (w) { w.document.write(html); w.document.close(); }
};

const ImportOrders = () => {
  const { isManagerOrAdmin } = useAuth();
  const [orders,    setOrders]    = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [statusF,   setStatusF]   = useState('');
  const [supplierF, setSupplierF] = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [exporting, setExporting] = useState(false);
  const [msg,       setMsg]       = useState({ type: '', text: '' });
  const [showForm,  setShowForm]  = useState(false);
  const [detailId,  setDetailId]  = useState(null);
  const [editOrder, setEditOrder] = useState(null);

  useAutoAlert(msg, setMsg);

  useEffect(() => {
    supplierAPI.getAllList().then(r => setSuppliers(r.data?.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await orderAPI.getAll({ status: statusF, supplierId: supplierF, dateFrom, dateTo, page, size: 20 });
      setOrders(r.data?.data?.items || []);
      setTotal(r.data?.data?.totalCount || 0);
    } catch { setMsg({ type: 'danger', text: 'Không thể tải danh sách phiếu' }); }
    finally { setLoading(false); }
  }, [page, statusF, supplierF, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await orderAPI.exportCsv({ status: statusF, supplierId: supplierF, dateFrom, dateTo });
      const url = URL.createObjectURL(blob.data);
      const a = document.createElement('a'); a.href = url; a.download = `phieu-nhap-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      setMsg({ type: 'success', text: 'Xuất CSV thành công' });
    } catch { setMsg({ type: 'warning', text: 'Xuất CSV thất bại' }); }
    finally { setExporting(false); }
  };

  const onSaved = (txt) => { setShowForm(false); setEditOrder(null); setMsg({ type: 'success', text: txt }); load(); };
  const onAction = (txt) => { setDetailId(null); setMsg({ type: 'success', text: txt }); load(); };

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Phiếu nhập kho</h1>
          <p className="page-subtitle">Quản lý phiếu nhập kho · <strong>{total}</strong> phiếu hệ thống</p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-success" size="sm" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? <Spinner size="sm" /> : <IcoDownload size={14} />} Xuất CSV
          </Button>
          {isManagerOrAdmin && (
            <Button variant="primary" size="sm" onClick={() => { setEditOrder(null); setShowForm(true); }}>
              <IcoPlus size={16} /> Tạo phiếu nhập
            </Button>
          )}
        </div>
      </div>

      <div className="data-card mb-4 p-3 shadow-sm">
        <Row className="g-3 align-items-center">
          <Col lg={6}>
            <div className="d-flex gap-1">
              {STATUS_FILTERS.map(s => (
                <Button key={s} size="sm" variant={statusF === s ? 'primary' : 'light'} onClick={() => { setStatusF(s); setPage(0); }}>
                  {s === '' ? 'Tất cả' : STATUS_MAP[s]?.label}
                </Button>
              ))}
            </div>
          </Col>
          <Col lg={6} className="text-lg-end">
            <Form.Select size="sm" className="d-inline-block w-auto me-2" value={supplierF} onChange={e => setSupplierF(e.target.value)}>
              <option value="">Tất cả NCC</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Form.Select>
            <Button variant="outline-secondary" size="sm" onClick={() => { setStatusF(''); setSupplierF(''); setPage(0); }}><IcoX size={14} /></Button>
          </Col>
        </Row>
      </div>

      <div className="data-card shadow-sm overflow-hidden">
        {loading ? (
          <Table className="mb-0"><tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} cols={8} />)}</tbody></Table>
        ) : orders.length === 0 ? (
          <EmptyState icon="import" message="Không có phiếu nào" />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="bg-light">
                <tr><th>Mã phiếu</th><th>Nhà cung cấp</th><th>Trạng thái</th><th className="text-end">Tổng tiền</th><th>Ngày tạo</th><th /></tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td className="fw-bold">{o.orderCode}</td>
                    <td>{o.supplierName}</td>
                    <td><Badge className={STATUS_MAP[o.status]?.cls}>{STATUS_MAP[o.status]?.label}</Badge></td>
                    <td className="text-end fw-bold text-success">{o.totalAmount?.toLocaleString('vi-VN')}đ</td>
                    <td className="small text-muted">{new Date(o.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="text-end">
                      <Button variant="link" size="sm" onClick={() => setDetailId(o.id)}>Chi tiết</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ImportOrderForm show={showForm} editOrder={editOrder} onHide={() => setShowForm(false)} onSaved={onSaved} />
      <ImportOrderDetail orderId={detailId} show={!!detailId} onHide={() => setDetailId(null)} onAction={onAction} onEdit={(o) => { setEditOrder(o); setShowForm(true); }} printFn={printImportOrder} />
    </div>
  );
};

export default ImportOrders;