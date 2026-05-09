// page/Suppliers.jsx — Refactored to Design System v4
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Table, Button, Modal, Form, Alert, Badge, Spinner, Row, Col, Pagination, ProgressBar } from 'react-bootstrap';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { supplierAPI } from '@/services/api';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoPlus, IcoEdit, IcoTrash, IcoSearch, IcoPhone, IcoMail, IcoCheck, IcoDownload, IcoUpload, IcoX } from '@/components/common/Icons.jsx';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';
import { useConfirm } from '@/components/common/ConfirmModal';

const PAGE_SIZE = 20;

const Suppliers = () => {
  const { isAdmin, isManagerOrAdmin } = useAuth();
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { toasts, dismiss, showToast, showErrorToast } = useToast();

  const [suppliers,       setSuppliers]       = useState([]);
  const [total,           setTotal]           = useState(0);
  const [pages,           setPages]           = useState(0);
  const [page,            setPage]            = useState(0);
  const [loading,         setLoading]         = useState(false);
  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form,     setForm]     = useState({ name: '', contactName: '', phone: '', email: '', address: '', taxCode: '', note: '', active: true });
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');

  const [exporting, setExporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await supplierAPI.getAll({ search: debouncedSearch, page, size: PAGE_SIZE });
      setSuppliers(r.data?.data?.items || []);
      setTotal(r.data?.data?.totalCount || 0);
      setPages(r.data?.data?.totalPages || 0);
    } catch { showErrorToast('Lỗi tải danh sách đối tác'); }
    finally { setLoading(false); }
  }, [debouncedSearch, page, showErrorToast]);

  useEffect(() => { load(); }, [load]);
  
  const openEdit = (s) => {
    setEditItem(s);
    setForm({
      name: s.name || '',
      contactName: s.contactName || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      taxCode: s.taxCode || '',
      note: s.note || '',
      active: !!s.active
    });
    setFormErr('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormErr('Tên đối tác là bắt buộc'); return; }
    setSaving(true);
    try {
      if (editItem) await supplierAPI.update(editItem.id, form);
      else await supplierAPI.create(form);
      showToast('Đã lưu thông tin đối tác', { variant: 'success' });
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Lỗi lưu thông tin'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (s) => {
    if (!await confirmDlg({ title: 'Xóa đối tác', message: `Xác nhận xóa đối tác "${s.name}"?`, variant: 'danger' })) return;
    try {
      await supplierAPI.delete(s.id);
      showToast('Đã xóa đối tác', { variant: 'success' });
      load();
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi xóa đối tác'); }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const r = await supplierAPI.exportCsv({ search });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.download = `suppliers-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); window.URL.revokeObjectURL(url);
      showToast('Xuất CSV thành công', { variant: 'success' });
    } catch { showErrorToast('Lỗi xuất CSV'); }
    finally { setExporting(false); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const r = await supplierAPI.importExcel(importFile);
      setImportResult(r.data?.data);
      showToast('Import hoàn tất', { variant: 'success' });
      load();
    } catch (e) { showErrorToast('Lỗi import dữ liệu'); }
    finally { setImporting(false); }
  };

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Đối tác cung ứng</h1>
          <p className="page-subtitle">Danh sách nhà cung cấp · <strong>{total}</strong> đối tác liên kết</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline-success" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? <Spinner size="sm" /> : <IcoDownload size={14} />} Xuất danh sách
          </Button>
          {isManagerOrAdmin && (
             <Button variant="outline-primary" onClick={() => setShowImport(true)}>
               <IcoUpload size={14} /> Nhập Excel
             </Button>
          )}
          {isManagerOrAdmin && (
            <button className="btn-premium" onClick={() => { setEditItem(null); setForm({name:'',contactName:'',phone:'',email:'',address:'',taxCode:'',note:'',active:true}); setFormErr(''); setShowForm(true); }}>
              <IcoPlus size={16} /> Thêm đối tác
            </button>
          )}
        </div>
      </div>

      <div className="data-card mb-4 p-3 shadow-sm border-0">
        <Row className="g-3 align-items-center">
          <Col md={6}>
            <div className="search-bar">
              <span className="search-bar-icon"><IcoSearch size={14}/></span>
              <Form.Control 
                placeholder="Tìm tên, mã số thuế, SĐT..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                className="border-0 bg-light"
              />
            </div>
          </Col>
        </Row>
      </div>

      <div className="data-card animate-fade-in shadow-sm border-0 overflow-hidden">
        {loading ? (
          <table className="table mb-0"><tbody>{[1,2,3,4,5].map(i => <SkeletonRow key={i} cols={7} />)}</tbody></table>
        ) : suppliers.length === 0 ? (
          <EmptyState icon="warehouse" message="Chưa có đối tác nào" sub="Thêm nhà cung cấp để bắt đầu giao dịch" />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="ps-4 py-3 small fw-bold text-muted text-uppercase" style={{ width: 100 }}>Mã NCC</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Tên đối tác</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Thông tin liên hệ</th>
                    <th className="text-center py-3 small fw-bold text-muted text-uppercase">Đơn hàng</th>
                    <th className="text-center py-3 small fw-bold text-muted text-uppercase">Trạng thái</th>
                    {isManagerOrAdmin && <th className="text-end pe-4 py-3 small fw-bold text-muted text-uppercase">Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(s => (
                    <tr key={s.id} className="align-middle">
                      <td className="ps-4 font-monospace small text-primary">{s.code}</td>
                      <td>
                        <div className="fw-bold">{s.name}</div>
                        <div className="small text-muted">{s.taxCode || '—'}</div>
                      </td>
                      <td>
                         <div className="small fw-semibold">{s.contactName || '—'}</div>
                         <div className="d-flex gap-3 mt-1">
                            {s.phone && <span className="small text-muted d-flex align-items-center gap-1"><IcoPhone size={11} /> {s.phone}</span>}
                            {s.email && <span className="small text-muted d-flex align-items-center gap-1"><IcoMail size={11} /> {s.email}</span>}
                         </div>
                      </td>
                      <td className="text-center">
                        <Badge className="badge-neutral" style={{ minWidth: 40 }}>{s.totalOrders}</Badge>
                      </td>
                      <td className="text-center">
                        <Badge className={s.active ? 'badge-success' : 'badge-neutral'}>{s.active ? 'Hoạt động' : 'Tạm dừng'}</Badge>
                      </td>
                      {isManagerOrAdmin && (
                        <td className="text-end pe-4">
                           <div className="d-flex gap-2 justify-content-end">
                              <Button size="sm" variant="outline-primary" className="border-0 bg-light" onClick={() => openEdit(s)}>
                                <IcoEdit size={14} />
                              </Button>
                              {isAdmin && (
                                <Button size="sm" variant="outline-danger" className="border-0 bg-light" onClick={() => handleDelete(s)}>
                                  <IcoTrash size={14} />
                                </Button>
                              )}
                           </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="d-flex justify-content-between align-items-center p-3 border-top bg-light">
                <span className="small text-muted">Trang {page + 1} / {pages}</span>
                <Pagination size="sm" className="mb-0 shadow-sm">
                   <Pagination.Prev onClick={() => setPage(p => p - 1)} disabled={page === 0} />
                   <Pagination.Item active>{page + 1}</Pagination.Item>
                   <Pagination.Next onClick={() => setPage(p => p + 1)} disabled={page >= pages - 1} />
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <Modal show={showForm} onHide={() => setShowForm(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{editItem ? 'Cập nhật đối tác' : 'Thêm đối tác mới'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formErr && <Alert variant="danger" className="py-2 small">{formErr}</Alert>}
          <Row className="g-3">
             <Col md={8}>
               <Form.Group>
                 <Form.Label className="small fw-bold">Tên nhà cung cấp / Công ty <span className="text-danger">*</span></Form.Label>
                 <Form.Control value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus />
               </Form.Group>
             </Col>
             <Col md={4}>
               <Form.Group>
                 <Form.Label className="small fw-bold">Mã số thuế</Form.Label>
                 <Form.Control value={form.taxCode} onChange={e => setForm({...form, taxCode: e.target.value})} />
               </Form.Group>
             </Col>
             <Col md={6}>
               <Form.Group>
                 <Form.Label className="small fw-bold">Người đại diện</Form.Label>
                 <Form.Control value={form.contactName} onChange={e => setForm({...form, contactName: e.target.value})} />
               </Form.Group>
             </Col>
             <Col md={6}>
               <Form.Group>
                 <Form.Label className="small fw-bold">Số điện thoại</Form.Label>
                 <Form.Control value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
               </Form.Group>
             </Col>
             <Col md={12}>
               <Form.Group>
                 <Form.Label className="small fw-bold">Địa chỉ</Form.Label>
                 <Form.Control value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
               </Form.Group>
             </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <IcoCheck size={14}/>} {editItem ? 'Lưu thay đổi' : 'Thêm đối tác'}
          </Button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default Suppliers;