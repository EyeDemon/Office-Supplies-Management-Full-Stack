// page/Warehouses.jsx — Refactored to Design System v4
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Table, Button, Modal, Form, Alert, Badge, Spinner, Row, Col, Tabs, Tab, Pagination } from 'react-bootstrap';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { warehouseAPI } from '@/services/api';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { IcoWarehouse, IcoPlus, IcoEdit, IcoTrash, IcoSearch, IcoCheck, IcoX, IcoRefresh, IcoBarChart } from '@/components/common/Icons.jsx';
import useAutoAlert from '@/hooks/useAutoAlert';
import WarehouseFormModal from '../components/WarehouseFormModal';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';
import { useConfirm } from '@/components/common/ConfirmModal';

const Warehouses = () => {
  const { isAdmin, isManagerOrAdmin } = useAuth();
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { toasts, dismiss, showToast, showErrorToast } = useToast();

  const [warehouses,   setWarehouses]   = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [page,         setPage]         = useState(1);
  const [size]                          = useState(20);
  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [activeTab,    setActiveTab]    = useState('list');

  const [msg, setMsg] = useState({ type: '', text: '' });
  useAutoAlert(msg, setMsg);

  const [showForm,     setShowForm]     = useState(false);
  const [editItem,     setEditItem]     = useState(null);
  const [form,         setForm]         = useState({ name: '', location: '', description: '', isActive: true });
  const [formErr,      setFormErr]      = useState('');
  const [saving,       setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await warehouseAPI.getAll({ page, size, search, active: activeFilter || undefined });
      const d = res.data?.data || {};
      setWarehouses(d.items || []);
      setTotal(d.total || 0);
    } catch { showErrorToast('Không thể tải danh sách kho'); }
    finally { setLoading(false); }
  }, [page, size, search, activeFilter, showErrorToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleSave = async () => {
    if (!form.name.trim()) { setFormErr('Tên kho là bắt buộc'); return; }
    setSaving(true);
    try {
      if (editItem) await warehouseAPI.update(editItem.id, form);
      else await warehouseAPI.create(form);
      showToast('Đã lưu thông tin kho', { variant: 'success' });
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Lỗi lưu kho'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (w) => {
    try {
      await warehouseAPI.toggle(w.id);
      showToast(w.isActive ? 'Đã tạm ngừng kho' : 'Đã kích hoạt kho', { variant: 'info' });
      load();
    } catch { showErrorToast('Thao tác thất bại'); }
  };

  const handleDelete = async (w) => {
    if (!await confirmDlg({ title: 'Xóa kho', message: `Xác nhận xóa kho "${w.name}"?`, variant: 'danger' })) return;
    try {
      await warehouseAPI.delete(w.id);
      showToast('Đã xóa kho', { variant: 'success' });
      load();
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi xóa kho'); }
  };

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kho hàng & Vị trí</h1>
          <p className="page-subtitle">Quản lý mạng lưới lưu trữ · <strong>{total}</strong> địa điểm đang quản lý</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isManagerOrAdmin && (
            <button className="btn-premium" onClick={() => { setEditItem(null); setForm({name:'',location:'',description:'',isActive:true}); setFormErr(''); setShowForm(true); }}>
              <IcoPlus size={16} /> Thêm kho mới
            </button>
          )}
        </div>
      </div>

      <div className="data-card mb-4 p-0 shadow-sm border-0 overflow-hidden">
        <Tabs activeKey={activeTab} onSelect={k => setActiveTab(k)} className="px-3 pt-2 custom-tabs">
          <Tab eventKey="list" title="DANH SÁCH KHO">
            <div className="p-3">
              <Row className="g-3 mb-3 align-items-center">
                <Col md={6}>
                  <div className="search-bar">
                    <span className="search-bar-icon"><IcoSearch size={14}/></span>
                    <Form.Control placeholder="Tìm tên kho, vị trí..." value={searchInput} onChange={e => setSearchInput(e.target.value)} className="border-0 bg-light" />
                  </div>
                </Col>
                <Col md={3}>
                   <Form.Select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} className="border-0 bg-light">
                     <option value="">Tất cả trạng thái</option>
                     <option value="true">Đang hoạt động</option>
                     <option value="false">Tạm ngừng</option>
                   </Form.Select>
                </Col>
              </Row>

              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="bg-light">
                    <tr>
                      <th className="ps-4 py-3 small fw-bold text-muted text-uppercase">Mã kho</th>
                      <th className="py-3 small fw-bold text-muted text-uppercase">Tên kho</th>
                      <th className="py-3 small fw-bold text-muted text-uppercase">Địa chỉ / Vị trí</th>
                      <th className="text-center py-3 small fw-bold text-muted text-uppercase">Trạng thái</th>
                      <th className="text-end pe-4 py-3 small fw-bold text-muted text-uppercase">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? [1,2,3].map(i => <SkeletonRow key={i} cols={5} />) : warehouses.length === 0 ? (
                      <tr><td colSpan={5}><EmptyState icon="warehouse" message="Chưa có kho nào" /></td></tr>
                    ) : warehouses.map(w => (
                      <tr key={w.id} className="align-middle">
                        <td className="ps-4 font-monospace small text-primary">{w.code}</td>
                        <td className="fw-bold">{w.name}</td>
                        <td className="small text-muted">{w.location || '—'}</td>
                        <td className="text-center">
                          <button className={`btn btn-sm shadow-none ${w.isActive ? 'badge-success' : 'badge-neutral'}`} style={{ border:'none', fontSize:'0.7rem' }} onClick={() => isManagerOrAdmin && handleToggle(w)}>
                            {w.isActive ? 'HOẠT ĐỘNG' : 'TẠM NGỪNG'}
                          </button>
                        </td>
                        <td className="text-end pe-4">
                           <div className="d-flex gap-2 justify-content-end">
                              <Button size="sm" variant="outline-primary" className="border-0 bg-light" onClick={() => { setEditItem(w); setForm({...w}); setShowForm(true); }}>
                                <IcoEdit size={14} />
                              </Button>
                              <Button size="sm" variant="outline-info" className="border-0 bg-light" onClick={() => setActiveTab('stock')}>
                                <IcoBarChart size={14} />
                              </Button>
                              {isAdmin && (
                                <Button size="sm" variant="outline-danger" className="border-0 bg-light" onClick={() => handleDelete(w)}>
                                  <IcoTrash size={14} />
                                </Button>
                              )}
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Tab>
          <Tab eventKey="stock" title="TỒN KHO CHI TIẾT">
            <div className="p-3">
               <StockTab warehouses={warehouses} />
            </div>
          </Tab>
        </Tabs>
      </div>

      <WarehouseFormModal
        show={showForm} onHide={() => setShowForm(false)}
        editItem={editItem} form={form} setForm={setForm}
        saving={saving} formErr={formErr} handleSave={handleSave}
      />

      <ConfirmDialog />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

// ── Stock Tab Sub-component ────────────────────────────────
const StockTab = ({ warehouses }) => {
  const [warehouseId, setWhId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    try {
      const r = await warehouseAPI.getStock(parseInt(warehouseId), { page: 1, size: 100 });
      setItems(r.data?.data?.items || []);
      setTotal(r.data?.data?.totalCount || 0);
    } catch { }
    finally { setLoading(false); }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Row className="mb-4">
        <Col md={4}>
          <Form.Label className="small fw-bold">Chọn kho muốn xem</Form.Label>
          <Form.Select value={warehouseId} onChange={e => setWhId(e.target.value)}>
            <option value="">-- Chọn kho --</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Form.Select>
        </Col>
      </Row>

      {warehouseId ? (
        <div className="table-responsive animate-fade-in">
           <table className="table table-hover small">
             <thead className="bg-light">
               <tr><th>SKU</th><th>Sản phẩm</th><th className="text-end">Tồn tại kho</th><th className="text-end">Tồn tổng</th><th>Trạng thái</th></tr>
             </thead>
              <tbody>
                {loading ? <SkeletonRow cols={5} /> : items.length === 0 ? <tr><td colSpan={5} className="text-center py-4">Kho này trống</td></tr> : items.map(it => (
                 <tr key={it.productId}>
                   <td><code>{it.sku}</code></td>
                   <td className="fw-bold">{it.name}</td>
                   <td className="text-end fw-bold text-success">{it.warehouseQty}</td>
                   <td className="text-end text-muted">{it.totalQty}</td>
                   <td><Badge bg={it.isLow ? 'warning' : 'success'} text={it.isLow ? 'dark' : 'white'}>{it.isLow ? 'Tồn thấp' : 'Đủ hàng'}</Badge></td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
      ) : <EmptyState icon="warehouse" message="Vui lòng chọn một kho" sub="Chọn kho từ danh sách trên để xem chi tiết tồn kho" />}
    </div>
  );
};

export default Warehouses;