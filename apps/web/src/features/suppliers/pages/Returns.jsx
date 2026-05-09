// apps/web/src/features/suppliers/pages/Returns.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Form, Badge, Spinner, Row, Col, Pagination } from 'react-bootstrap';
import { returnAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoPlus, IcoSearch, IcoCheck, IcoDownload, IcoArrowLeft } from '@/components/common/Icons.jsx';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';
import { useConfirm } from '@/components/common/ConfirmModal';
import ReturnFormModal from '../components/ReturnFormModal';

const STATUS_LABEL = { DRAFT:'Bản nháp', COMPLETED:'Hoàn tất', CANCELLED:'Đã huỷ' };
const STATUS_BADGE = { DRAFT:'badge-warning', COMPLETED:'badge-success', CANCELLED:'badge-danger' };
const TYPE_LABEL   = { EMPLOYEE_RETURN:'NV trả về kho', SUPPLIER_RETURN:'Trả hàng về NCC' };
const TYPE_BADGE   = { EMPLOYEE_RETURN:'badge-success', SUPPLIER_RETURN:'badge-warning' };

const Returns = () => {
  const { isManagerOrAdmin } = useAuth();
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { toasts, dismiss, showToast, showErrorToast } = useToast();

  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatus] = useState('');
  const [typeFilter, setType] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDL] = useState(false);

  const limit = 15;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await returnAPI.getAll({ page, limit, status: statusFilter || undefined, type: typeFilter || undefined, search: debouncedSearch || undefined });
      setList(r.data?.data?.items || []);
      setTotal(r.data?.data?.total || 0);
    } catch { showErrorToast('Lỗi tải danh sách phiếu trả'); }
    finally { setLoading(false); }
  }, [page, statusFilter, typeFilter, debouncedSearch, showErrorToast]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    try {
      const r = await returnAPI.exportCsv({ status: statusFilter, type: typeFilter });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'returns.csv'; a.click();
      showToast('Xuất CSV thành công', { variant: 'success' });
    } catch { showErrorToast('Lỗi xuất CSV'); }
  };

  const openDetail = async (id) => {
    setDL(true); setDetail(null);
    try {
      const r = await returnAPI.getById(id);
      setDetail(r.data?.data);
    } catch { showErrorToast('Lỗi tải chi tiết'); }
    finally { setDL(false); }
  };

  const handleComplete = async (id, type) => {
    const msg = type === 'EMPLOYEE_RETURN' ? 'Hoàn tất sẽ CỘNG tồn kho. Xác nhận?' : 'Hoàn tất sẽ TRỪ tồn kho. Xác nhận?';
    if (!await confirmDlg({ title: 'Hoàn tất phiếu trả', message: msg, variant: 'success' })) return;
    try {
      await returnAPI.complete(id);
      showToast('Đã hoàn tất phiếu trả hàng', { variant: 'success' });
      setDetail(null); load();
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi thao tác'); }
  };

  const handleCancel = async (id) => {
    if (!await confirmDlg({ title: 'Huỷ phiếu trả', message: 'Bạn có chắc muốn huỷ phiếu này?', variant: 'danger' })) return;
    try {
      await returnAPI.cancel(id);
      showToast('Đã huỷ phiếu', { variant: 'info' });
      setDetail(null); load();
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi huỷ phiếu'); }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý Trả hàng</h1>
          <p className="page-subtitle">Xử lý hàng hoàn trả · <strong>{total}</strong> phiếu đã ghi nhận</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline-success" onClick={handleExport}>
            <IcoDownload size={14} /> Xuất danh sách
          </Button>
          {isManagerOrAdmin && (
            <button className="btn-premium" onClick={() => { setEditItem(null); setShowForm(true); }}>
              <IcoPlus size={16} /> Tạo phiếu trả
            </button>
          )}
        </div>
      </div>

      <div className="data-card mb-4 p-3 shadow-sm border-0">
        <Row className="g-3 align-items-center">
          <Col md={4}>
            <div className="search-bar">
              <span className="search-bar-icon"><IcoSearch size={14}/></span>
              <Form.Control placeholder="Tìm mã phiếu, người trả..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="border-0 bg-light" />
            </div>
          </Col>
          <Col md={3}>
            <Form.Select value={typeFilter} onChange={e => { setType(e.target.value); setPage(1); }} className="border-0 bg-light">
              <option value="">Tất cả loại hình</option>
              {Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </Form.Select>
          </Col>
          <Col md={3}>
            <Form.Select value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1); }} className="border-0 bg-light">
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </Form.Select>
          </Col>
        </Row>
      </div>

      <div className="data-card animate-fade-in shadow-sm border-0 overflow-hidden">
        {loading ? (
          <table className="table mb-0"><tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} cols={7} />)}</tbody></table>
        ) : list.length === 0 ? (
          <EmptyState icon="purchase" message="Không tìm thấy phiếu trả hàng" sub="Thử thay đổi bộ lọc hoặc tạo phiếu mới" />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="ps-4 py-3 small fw-bold text-muted text-uppercase">Mã phiếu</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Loại hình</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Đối tượng / NCC</th>
                    <th className="text-center py-3 small fw-bold text-muted text-uppercase">Trạng thái</th>
                    <th className="text-end py-3 small fw-bold text-muted text-uppercase">Tổng SL</th>
                    <th className="text-end pe-4 py-3 small fw-bold text-muted text-uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.id} className="align-middle">
                      <td className="ps-4 fw-bold text-primary">{r.return_code}</td>
                      <td>
                        <Badge className={TYPE_BADGE[r.return_type]}>{TYPE_LABEL[r.return_type]}</Badge>
                      </td>
                      <td>
                        <div className="fw-bold">{r.return_type === 'SUPPLIER_RETURN' ? r.supplier_name : r.returner_name || '—'}</div>
                        <div className="small text-muted">{r.department || '—'}</div>
                      </td>
                      <td className="text-center">
                        <Badge className={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="text-end fw-bold">{r.total_qty}</td>
                      <td className="text-end pe-4">
                         <div className="d-flex gap-2 justify-content-end">
                            <Button size="sm" variant="outline-primary" className="border-0 bg-light" onClick={() => openDetail(r.id)}>Chi tiết</Button>
                            {r.status === 'DRAFT' && (
                               <Button size="sm" variant="outline-warning" className="border-0 bg-light" onClick={() => { setEditItem(r); setShowForm(true); }}>Sửa</Button>
                            )}
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="d-flex justify-content-between align-items-center p-3 border-top bg-light">
                <span className="small text-muted">Trang {page} / {totalPages}</span>
                <Pagination size="sm" className="mb-0 shadow-sm">
                   <Pagination.Prev onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} />
                   <Pagination.Item active>{page}</Pagination.Item>
                   <Pagination.Next onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} />
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <Modal show={!!(detail || detailLoading)} onHide={() => setDetail(null)} size="lg" centered>
          <Modal.Header closeButton>
            <Modal.Title>{detail ? `Phiếu trả: ${detail.return_code}` : 'Đang tải...'}</Modal.Title>
          </Modal.Header>
          <Modal.Body className={detailLoading ? 'p-5 text-center' : ''}>
            {detailLoading ? <Spinner animation="border" variant="primary" /> : detail && (
              <>
                <div className="p-3 rounded mb-3" style={{ background: 'rgba(var(--brand-primary-rgb), 0.05)', border: '1px dashed var(--brand-primary)' }}>
                   <Row className="g-3">
                      <Col md={6}>
                         <div className="small text-muted mb-1 text-uppercase fw-bold">Loại trả hàng</div>
                         <div className="fw-bold text-primary"><IcoArrowLeft size={16} /> {TYPE_LABEL[detail.return_type]}</div>
                      </Col>
                      <Col md={6} className="text-md-end">
                         <div className="small text-muted mb-1 text-uppercase fw-bold">Trạng thái</div>
                         <Badge className={STATUS_BADGE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
                      </Col>
                   </Row>
                </div>
                <Row className="g-4 mb-4">
                   <Col md={6}>
                      <h6 className="small text-muted text-uppercase fw-bold mb-3 border-bottom pb-1">Thông tin chung</h6>
                      <div className="d-flex flex-column gap-2">
                         <div className="d-flex justify-content-between"><span className="text-muted">Đối tượng:</span> <strong>{detail.return_type === 'SUPPLIER_RETURN' ? detail.supplier_name : detail.returner_name || '—'}</strong></div>
                         <div className="d-flex justify-content-between"><span className="text-muted">Ngày tạo:</span> <span>{new Date(detail.created_at).toLocaleDateString('vi-VN')}</span></div>
                         <div className="d-flex justify-content-between"><span className="text-muted">Kho liên quan:</span> <strong>{detail.warehouse_name || '—'}</strong></div>
                      </div>
                   </Col>
                   <Col md={6}>
                      <h6 className="small text-muted text-uppercase fw-bold mb-3 border-bottom pb-1">Lý do & Ghi chú</h6>
                      <p className="small mb-0">{detail.reason || 'Không có lý do chi tiết'}</p>
                   </Col>
                </Row>

                <h6 className="small text-muted text-uppercase fw-bold mb-3">Danh sách sản phẩm ({detail.items?.length || 0})</h6>
                <div className="table-responsive">
                   <table className="table table-sm small">
                      <thead className="bg-light">
                         <tr><th>Sản phẩm</th><th className="text-end">Tồn kho</th><th className="text-end">SL trả</th><th>Tình trạng</th></tr>
                      </thead>
                      <tbody>
                         {detail.items?.map(it => (
                            <tr key={it.id}>
                               <td><strong>{it.product_name}</strong><br/><code className="small text-muted">{it.sku}</code></td>
                               <td className="text-end text-muted">{it.stock_quantity}</td>
                               <td className="text-end fw-bold">{it.quantity}</td>
                               <td className="small">{it.condition_note || '—'}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                <div className="d-flex gap-2 justify-content-end mt-4">
                   {detail.status === 'DRAFT' && (
                      <>
                        <Button variant="outline-danger" onClick={() => handleCancel(detail.id)}>Huỷ phiếu</Button>
                        <Button variant="success" onClick={() => handleComplete(detail.id, detail.return_type)}>
                           <IcoCheck size={14} /> Hoàn tất phiếu
                        </Button>
                      </>
                   )}
                </div>
              </>
            )}
          </Modal.Body>
        </Modal>
      )}

      {showForm && (
         <ReturnFormModal 
            show={showForm} 
            editItem={editItem} 
            onHide={() => setShowForm(false)} 
            onSaved={() => { setShowForm(false); load(); }} 
         />
      )}

      <ConfirmDialog />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default Returns;