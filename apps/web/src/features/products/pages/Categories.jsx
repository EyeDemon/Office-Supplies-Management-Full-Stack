// page/Categories.jsx — Refactored to Design System v4
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Alert, Badge, Spinner, Row, Col, Pagination } from 'react-bootstrap';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { categoryAPI } from '@/services/api';
import useAutoAlert from '@/hooks/useAutoAlert';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoFolder, IcoPlus, IcoEdit, IcoTrash, IcoSearch, IcoX, IcoDownload, IcoCheck } from '@/components/common/Icons.jsx';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import { useConfirm } from '@/components/common/ConfirmModal';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';

const PAGE_SIZE = 20;

const Categories = () => {
  const { isAdmin, isManagerOrAdmin } = useAuth();
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { toasts, dismiss, showToast, showErrorToast } = useToast();

  const [categories,  setCategories]  = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [search,      setSearch]      = useState('');
  const [debouncedQ,  setDebouncedQ]  = useState('');
  const [page,        setPage]        = useState(0);
  const [msg,         setMsg]         = useState({ type:'', text:'' });
  const [showForm,    setShowForm]    = useState(false);
  const [editItem,    setEditItem]    = useState(null);
  const [form,        setForm]        = useState({ name:'', description:'' });
  const [formErr,     setFormErr]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const nameInputRef = useRef(null);

  useAutoAlert(msg, setMsg);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await categoryAPI.getAll(debouncedQ ? { search: debouncedQ } : {});
      setCategories(r.data?.data?.items || []);
    } catch {
      showErrorToast('Không thể tải danh mục');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, showErrorToast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim()) { setFormErr('Tên danh mục là bắt buộc'); return; }
    setSaving(true); setFormErr('');
    try {
      if (editItem) await categoryAPI.update(editItem.id, form);
      else          await categoryAPI.create(form);
      showToast(editItem ? 'Cập nhật thành công' : 'Thêm thành công', { variant: 'success' });
      setShowForm(false);
      load();
    } catch (e) {
      setFormErr(e.response?.data?.message || 'Lỗi lưu danh mục');
    } finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!await confirmDlg({ title: 'Xóa danh mục', message: `Xác nhận xóa danh mục "${c.name}"?`, variant: 'danger' })) return;
    try {
      await categoryAPI.delete(c.id);
      showToast('Đã xóa danh mục', { variant: 'success' });
      load();
    } catch (e) {
      showErrorToast(e.response?.data?.message || 'Lỗi xóa danh mục');
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const r = await categoryAPI.exportCsv(debouncedQ ? { search: debouncedQ } : {});
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'categories.csv'; a.click();
      showToast('Xuất CSV thành công', { variant: 'success' });
    } catch { showErrorToast('Lỗi xuất CSV'); }
    finally { setExporting(false); }
  };

  const paginated = categories.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(categories.length / PAGE_SIZE);

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Danh mục Sản phẩm</h1>
          <p className="page-subtitle">Phân loại hàng hóa · <strong>{categories.length}</strong> nhóm hệ thống</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline-success" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? <Spinner size="sm" /> : <IcoDownload size={14} />} Xuất CSV
          </Button>
          {isManagerOrAdmin && (
            <button className="btn-premium" onClick={() => { setEditItem(null); setForm({name:'',description:''}); setFormErr(''); setShowForm(true); }}>
              <IcoPlus size={16} /> Thêm danh mục
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
                placeholder="Tìm tên danh mục..." 
                value={search} 
                onChange={e => { setSearch(e.target.value); setPage(0); }} 
                className="border-0 bg-light"
              />
            </div>
          </Col>
        </Row>
      </div>

      <div className="data-card animate-fade-in shadow-sm border-0 overflow-hidden">
        {loading ? (
          <table className="table mb-0"><tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} cols={4} />)}</tbody></table>
        ) : categories.length === 0 ? (
          <EmptyState icon="inventory" message="Chưa có danh mục nào" sub="Thêm danh mục để bắt đầu phân loại sản phẩm" />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="ps-4 py-3 small fw-bold text-muted text-uppercase" style={{ width: 60 }}>#</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Tên danh mục</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Mô tả</th>
                    <th className="text-center py-3 small fw-bold text-muted text-uppercase">Sản phẩm</th>
                    {isManagerOrAdmin && <th className="text-end pe-4 py-3 small fw-bold text-muted text-uppercase">Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, idx) => (
                    <tr key={c.id} className="align-middle">
                      <td className="ps-4 text-muted small">{page * PAGE_SIZE + idx + 1}</td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                           <div className="bg-light p-2 rounded text-primary"><IcoFolder size={14} /></div>
                           <span className="fw-bold">{c.name}</span>
                        </div>
                      </td>
                      <td className="small text-muted">{c.description || '—'}</td>
                      <td className="text-center">
                        <Badge className="badge-neutral" style={{ minWidth: 40 }}>{c.productCount ?? 0}</Badge>
                      </td>
                      {isManagerOrAdmin && (
                        <td className="text-end pe-4">
                          <div className="d-flex gap-2 justify-content-end">
                            <Button size="sm" variant="outline-primary" className="shadow-none border-0 bg-light" onClick={() => { setEditItem(c); setForm({name:c.name,description:c.description||''}); setShowForm(true); }}>
                              <IcoEdit size={14} />
                            </Button>
                            {isAdmin && (
                              <Button size="sm" variant="outline-danger" className="shadow-none border-0 bg-light" onClick={() => handleDelete(c)}>
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
            {totalPages > 1 && (
              <div className="d-flex justify-content-between align-items-center p-3 border-top bg-light">
                <span className="small text-muted">Trang {page + 1} / {totalPages}</span>
                <Pagination size="sm" className="mb-0 shadow-sm">
                   <Pagination.Prev onClick={() => setPage(p => p - 1)} disabled={page === 0} />
                   <Pagination.Item active>{page + 1}</Pagination.Item>
                   <Pagination.Next onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} />
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      <Modal show={showForm} onHide={() => setShowForm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editItem ? 'Cập nhật danh mục' : 'Thêm danh mục mới'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formErr && <Alert variant="danger" className="py-2 small">{formErr}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label className="small fw-bold">Tên danh mục <span className="text-danger">*</span></Form.Label>
            <Form.Control ref={nameInputRef} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="VD: Văn phòng phẩm" autoFocus />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small fw-bold">Mô tả</Form.Label>
            <Form.Control as="textarea" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="..." />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <IcoCheck size={14}/>} {editItem ? 'Cập nhật' : 'Thêm mới'}
          </Button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default Categories;