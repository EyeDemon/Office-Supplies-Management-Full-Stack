// page/Products.jsx — Refactored to Design System v4
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Table, Button, Badge, Alert, Spinner, Modal, Form, Row, Col, Pagination, Container } from 'react-bootstrap';
import { productAPI, categoryAPI, unitAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { useConfirm } from '@/components/common/ConfirmModal';
import {
  IcoPlus, IcoCheck, IcoX, IcoTrash, IcoEye, IcoEdit,
  IcoDownload, IcoFilter, IcoSearch, IcoUpload, IcoBarChart, IcoAdjust, IcoBox, IcoArrowRight
} from '@/components/common/Icons.jsx';
import ProductFormModal from '../components/ProductFormModal';
import useAutoAlert from '@/hooks/useAutoAlert';

const UNIT_LABELS = { CAI:'Cái',HOP:'Hộp',GOI:'Gói',CUON:'Cuộn',BO:'Bộ',TUP:'Tuýp',LOC:'Lọc',KG:'Kg',MET:'Mét',TO:'Tờ' };
const TYPE_COLORS = { IMPORT:'success', EXPORT:'danger', ADJUST:'warning' };
const TYPE_LABELS = { IMPORT:'Nhập', EXPORT:'Xuất', ADJUST:'Điều chỉnh' };

const emptyForm = { sku:'', barcode:'', name:'', categoryId:'', unit:'CAI', price:'', minStockQty:'5', description:'', baseUnitId:'', reorderPoint:'' };
const emptyTouched = { sku:false, name:false, categoryId:false, price:false, minStockQty:false };

const validateForm = (form) => {
  const errors = {};
  if (!form.name.trim())  errors.name       = 'Tên sản phẩm là bắt buộc';
  if (!form.sku.trim())   errors.sku        = 'Mã SKU là bắt buộc';
  if (!form.categoryId)   errors.categoryId = 'Vui lòng chọn danh mục';
  if (!form.price || isNaN(form.price) || Number(form.price) < 0) errors.price = 'Đơn giá không hợp lệ';
  return errors;
};

const Products = () => {
  const { isAdmin, isManagerOrAdmin } = useAuth();
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { toasts, dismiss, showToast, showErrorToast } = useToast();

  const [products,    setProducts]   = useState([]);
  const [categories,  setCategories] = useState([]);
  const [dbUnits,     setDbUnits]    = useState([]);
  const [totalCount,  setTotalCount] = useState(0);
  const [totalPages,  setTotalPages] = useState(0);
  const [loading,     setLoading]    = useState(false);

  const [page,        setPage]       = useState(1);
  const [size,        setSize]       = useState(20);
  const [searchInput, setSearchInput]= useState('');
  const [search,      setSearch]     = useState('');
  const [catFilter,   setCatFilter]  = useState('');
  const [lowOnly,     setLowOnly]    = useState(false);

  const [msg,         setMsg]        = useState({ type:'', text:'' });
  const [showForm,    setShowForm]   = useState(false);
  const [editItem,    setEditItem]   = useState(null);
  const [form,        setForm]       = useState(emptyForm);
  const [formErr,     setFormErr]    = useState('');
  const [saving,      setSaving]     = useState(false);
  const [touched,     setTouched]    = useState(emptyTouched);
  const [fieldErrors, setFieldErrors]= useState({});

  const [stockModal,  setStockModal] = useState({ show:false, product:null, type:'' });
  const [stockForm,   setStockForm]  = useState({ quantity:'', note:'' });
  const [stockErr,    setStockErr]   = useState('');

  const [exporting,   setExporting]  = useState(false);
  const [showImport,  setShowImport] = useState(false);
  const [importing,   setImporting]  = useState(false);
  const [importFile,  setImportFile] = useState(null);

  const [txModal,     setTxModal]    = useState({ show:false, product:null });
  const [txList,      setTxList]     = useState([]);
  const [txLoading,   setTxLoading]  = useState(false);
  const [txPage,      setTxPage]     = useState(0);
  const [txTotal,     setTxTotal]    = useState(0);

  const [showTrash,   setShowTrash]  = useState(false);
  const [deletedItems,setDeletedItems]= useState([]);
  const [trashLoading,setTrashLoading]= useState(false);

  useAutoAlert(msg, setMsg);

  useEffect(() => {
    categoryAPI.getAll().then(r => setCategories(r.data?.data?.items || [])).catch(() => {});
    unitAPI.getAll().then(r => setDbUnits(r.data?.data?.items || [])).catch(() => {});
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await productAPI.getAll({ page, size, search, categoryId: catFilter, lowStock: lowOnly });
      const d = r.data?.data;
      setProducts(d?.items || []);
      setTotalCount(d?.totalCount || 0);
      setTotalPages(d?.totalPages || 0);
    } catch { showToast('Lỗi tải danh sách sản phẩm', { variant: 'danger' }); }
    finally { setLoading(false); }
  }, [page, size, search, catFilter, lowOnly, showToast]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleFormChange = (field, value) => {
    const newForm = { ...form, [field]: value };
    setForm(newForm);
    if (touched[field]) setFieldErrors(validateForm(newForm));
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setFieldErrors(validateForm(form));
  };

  const handleSave = async () => {
    setTouched({ sku:true, name:true, categoryId:true, price:true, minStockQty:true });
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { setFormErr('Kiểm tra các trường bắt buộc'); return; }
    
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        minStockQty: Number(form.minStockQty || 5),
        categoryId: Number(form.categoryId),
        baseUnitId: form.baseUnitId ? Number(form.baseUnitId) : null,
        reorderPoint: form.reorderPoint !== '' ? Number(form.reorderPoint) : null,
      };
      if (editItem) await productAPI.update(editItem.id, payload);
      else await productAPI.create(payload);
      setShowForm(false); showToast('Đã lưu sản phẩm thành công', { variant: 'success' }); loadProducts();
    } catch (e) { setFormErr(e.response?.data?.message || 'Lỗi lưu sản phẩm'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (p) => {
    if (!await confirmDlg({ title: 'Xóa sản phẩm', message: `Bạn có chắc muốn xóa "${p.name}"?`, variant: 'danger' })) return;
    try {
      await productAPI.delete(p.id);
      showToast('Đã xóa sản phẩm', { variant: 'success' });
      loadProducts();
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi xóa sản phẩm'); }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await productAPI.exportCsv();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `products-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); window.URL.revokeObjectURL(url);
      showToast('Đã xuất CSV thành công', { variant: 'success' });
    } catch { showErrorToast('Lỗi xuất CSV'); }
    finally { setExporting(false); }
  };

  const handleStock = async () => {
    const qty = Number(stockForm.quantity);
    if (qty <= 0 && stockModal.type !== 'ADJUST') { setStockErr('Số lượng phải > 0'); return; }
    setSaving(true);
    try {
      const payload = { quantity: qty, note: stockForm.note };
      if (stockModal.type === 'IMPORT') await productAPI.stockIn(stockModal.product.id, payload);
      else if (stockModal.type === 'EXPORT') await productAPI.stockOut(stockModal.product.id, payload);
      else await productAPI.stockAdjust(stockModal.product.id, payload);
      setStockModal({ show:false, product:null, type:'' });
      showToast('Đã cập nhật kho thành công', { variant: 'success' });
      loadProducts();
    } catch (e) { setStockErr(e.response?.data?.message || 'Lỗi thao tác kho'); }
    finally { setSaving(false); }
  };

  const openTx = (p) => {
    setTxList([]); setTxModal({ show:true, product:p }); setTxPage(0);
    loadTx(p.id, 0);
  };
  const loadTx = async (pid, pg) => {
    setTxLoading(true);
    try {
      const r = await productAPI.getTransactions(pid, pg, 20);
      setTxList(r.data?.data?.items || []);
      setTxTotal(r.data?.data?.totalCount || 0);
    } catch { showErrorToast('Lỗi tải lịch sử kho'); }
    finally { setTxLoading(false); }
  };

  const handleImport = async () => {
    if (!importFile) { showToast('Vui lòng chọn file', { variant: 'warning' }); return; }
    setImporting(true);
    try {
      const res = await productAPI.importExcel(importFile);
      const { created, updated, errors } = res.data.data;
      showToast(`Nhập thành công: ${created} tạo mới, ${updated} cập nhật.`, { variant: 'success' });
      if (errors && errors.length > 0) {
        showToast(`${errors.length} dòng bị lỗi. Kiểm tra console để xem chi tiết.`, { variant: 'warning' });
        console.table(errors);
      }
      setShowImport(false); setImportFile(null); loadProducts();
    } catch (e) { showErrorToast(e.response?.data?.message || 'Lỗi nhập file'); }
    finally { setImporting(false); }
  };

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý Sản phẩm</h1>
          <p className="page-subtitle">Danh mục hàng hóa · <strong>{totalCount}</strong> mặt hàng · Theo dõi tồn kho thời gian thực</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline-success" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? <Spinner size="sm" /> : <IcoDownload size={14} />} Xuất Excel
          </Button>
          {isManagerOrAdmin && (
            <>
              <Button variant="outline-primary" onClick={() => setShowImport(true)}>
                <IcoUpload size={14} /> Nhập Excel
              </Button>
              <button className="btn-premium" onClick={() => { setEditItem(null); setForm(emptyForm); setTouched(emptyTouched); setFieldErrors({}); setFormErr(''); setShowForm(true); }}>
                <IcoPlus size={16} /> Thêm sản phẩm
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="data-card mb-4 p-3 shadow-sm border-0">
        <Row className="g-3 align-items-center">
          <Col md={4}>
            <div className="search-bar">
              <span className="search-bar-icon"><IcoSearch size={14}/></span>
              <Form.Control 
                placeholder="Tìm tên sản phẩm, mã SKU..." 
                value={searchInput} 
                onChange={e => setSearchInput(e.target.value)} 
                className="border-0 bg-light"
              />
            </div>
          </Col>
          <Col md={3}>
            <Form.Select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }} className="border-0 bg-light">
              <option value="">Tất cả danh mục</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Form.Select>
          </Col>
          <Col md={3} className="d-flex align-items-center gap-3">
             <Form.Check type="switch" label="Tồn kho thấp" checked={lowOnly} onChange={e => { setLowOnly(e.target.checked); setPage(1); }} />
          </Col>
          <Col md={2} className="text-end">
             {isAdmin && (
               <Button variant="link" className="text-danger p-0 small" onClick={() => { setShowTrash(true); setTrashLoading(true); productAPI.getDeleted().then(r => setDeletedItems(r.data.data || [])).finally(() => setTrashLoading(false)); }}>
                 <IcoTrash size={14} className="me-1" /> Thùng rác
               </Button>
             )}
          </Col>
        </Row>
      </div>

      <div className="data-card animate-fade-in shadow-sm border-0 overflow-hidden">
        {loading ? (
          <table className="table mb-0"><tbody>{[1,2,3,4,5,6].map(i => <SkeletonRow key={i} cols={8} />)}</tbody></table>
        ) : products.length === 0 ? (
          <EmptyState icon="inventory" message="Không tìm thấy sản phẩm" sub="Thử thay đổi bộ lọc hoặc thêm mới" />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="ps-4 py-3 small fw-bold text-muted text-uppercase">SKU</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Tên sản phẩm</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">Danh mục</th>
                    <th className="py-3 small fw-bold text-muted text-uppercase">ĐVT</th>
                    <th className="text-end py-3 small fw-bold text-muted text-uppercase">Đơn giá</th>
                    <th className="text-center py-3 small fw-bold text-muted text-uppercase">Tồn thực tế</th>
                    <th className="text-end pe-4 py-3 small fw-bold text-muted text-uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="align-middle">
                      <td className="ps-4"><code className="small text-primary">{p.sku}</code></td>
                      <td>
                        <div className="fw-bold">{p.name}</div>
                        {p.barcode && <div className="small text-muted" style={{fontSize:'0.7rem'}}>UPC: {p.barcode}</div>}
                      </td>
                      <td><Badge className="badge-neutral shadow-none">{p.categoryName || '—'}</Badge></td>
                      <td className="small">{UNIT_LABELS[p.unit] || p.unit}</td>
                      <td className="text-end fw-bold">{Number(p.price).toLocaleString('vi-VN')}đ</td>
                      <td className="text-center">
                        <Badge className={p.stockQty === 0 ? 'badge-danger' : p.lowStock ? 'badge-warning' : 'badge-success'} style={{ fontSize:'0.75rem', minWidth:60 }}>
                          {p.stockQty} {p.unit}
                        </Badge>
                      </td>
                      <td className="text-end pe-4">
                        <div className="d-flex gap-2 justify-content-end">
                          {isManagerOrAdmin && (
                            <>
                              <Button size="sm" variant="outline-success" className="shadow-none border-0 bg-light" onClick={() => setStockModal({ show:true, product:p, type:'IMPORT' })} title="Nhập nhanh">
                                <IcoPlus size={14} />
                              </Button>
                              <Button size="sm" variant="outline-danger" className="shadow-none border-0 bg-light" onClick={() => setStockModal({ show:true, product:p, type:'EXPORT' })} title="Xuất nhanh">
                                <IcoArrowRight size={14} />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline-primary" className="shadow-none border-0 bg-light" onClick={() => { setEditItem(p); setForm({ ...p, categoryId: String(p.categoryId), price: String(p.price), minStockQty: String(p.minStockQty) }); setTouched(emptyTouched); setFieldErrors({}); setShowForm(true); }}>
                            <IcoEdit size={14} />
                          </Button>
                          <Button size="sm" variant="outline-info" className="shadow-none border-0 bg-light" onClick={() => openTx(p)}>
                            <IcoBarChart size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="d-flex justify-content-between align-items-center p-3 border-top bg-light">
                <span className="small text-muted">Hiển thị <strong>{(page-1)*size+1}</strong>–<strong>{Math.min(page*size, totalCount)}</strong> / <strong>{totalCount}</strong> sản phẩm</span>
                <Pagination size="sm" className="mb-0 shadow-sm">
                   <Pagination.Prev onClick={() => setPage(p => p - 1)} disabled={page === 1} />
                   <Pagination.Item active>{page}</Pagination.Item>
                   <Pagination.Next onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} />
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <ProductFormModal
        show={showForm} onHide={() => setShowForm(false)}
        editItem={editItem} form={form} setForm={setForm}
        categories={categories} dbUnits={dbUnits}
        saving={saving} formErr={formErr} touched={touched} fieldErrors={fieldErrors}
        handleFormChange={handleFormChange} handleBlur={handleBlur} handleSave={handleSave}
      />

      <Modal show={stockModal.show} onHide={() => setStockModal({show:false,product:null,type:''})} centered>
        <Modal.Header closeButton>
          <Modal.Title>{stockModal.type==='IMPORT' ? 'Nhập kho' : stockModal.type==='EXPORT' ? 'Xuất kho' : 'Điều chỉnh kho'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {stockErr && <Alert variant="danger" className="py-2">{stockErr}</Alert>}
          <div className="p-3 bg-light rounded mb-3 text-center">
            <div className="small text-muted">Sản phẩm: <strong>{stockModal.product?.name}</strong></div>
            <div className="h4 mb-0 mt-1">Tồn hiện tại: <span className="text-primary">{stockModal.product?.stockQty}</span></div>
          </div>
          <Form.Group className="mb-3">
            <Form.Label>Số lượng {stockModal.type==='IMPORT'?'nhập':'xuất'}</Form.Label>
            <Form.Control type="number" size="lg" className="text-center fw-bold" value={stockForm.quantity} onChange={e => setStockForm({...stockForm, quantity:e.target.value})} autoFocus />
          </Form.Group>
          <Form.Group>
            <Form.Label>Ghi chú</Form.Label>
            <Form.Control as="textarea" rows={2} value={stockForm.note} onChange={e => setStockForm({...stockForm, note:e.target.value})} placeholder="Lý do thao tác..." />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setStockModal({show:false,product:null,type:''})}>Hủy</Button>
          <Button variant={stockModal.type==='IMPORT'?'success':'danger'} onClick={handleStock} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <IcoCheck size={14}/>} Xác nhận
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={txModal.show} onHide={() => setTxModal({show:false,product:null})} size="lg">
        <Modal.Header closeButton><Modal.Title>Lịch sử kho — {txModal.product?.name}</Modal.Title></Modal.Header>
        <Modal.Body className="p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="bg-light">
                <tr><th>Thời gian</th><th>Loại</th><th className="text-center">SL</th><th className="text-center">Trước</th><th className="text-center">Sau</th><th>Người tạo</th></tr>
              </thead>
              <tbody>
                {txLoading ? <tr><td colSpan={6}><SkeletonRow cols={6} /></td></tr> : txList.map(t => (
                  <tr key={t.id}>
                    <td>{new Date(t.createdAt).toLocaleString('vi-VN')}</td>
                    <td><Badge bg={TYPE_COLORS[t.type]}>{TYPE_LABELS[t.type]}</Badge></td>
                    <td className="text-center fw-bold">{t.quantity}</td>
                    <td className="text-center text-muted">{t.stockBefore}</td>
                    <td className="text-center fw-bold text-primary">{t.stockAfter}</td>
                    <td>{t.createdByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal.Body>
      </Modal>

      <Modal show={showImport} onHide={() => !importing && setShowImport(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Nhập sản phẩm từ Excel/CSV</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted mb-3">
            Hệ thống hỗ trợ file .xlsx hoặc .csv. Các cột yêu cầu: 
            <strong> SKU, Tên sản phẩm, Danh mục, ĐVT, Đơn giá</strong>.
            <br />
            <a href="/api/products/import-template" target="_blank" rel="noopener noreferrer" className="text-primary fw-bold">
              <IcoDownload size={12} /> Tải file mẫu
            </a>
          </p>
          <Form.Group className="mb-3">
            <Form.Label>Chọn file</Form.Label>
            <Form.Control 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              onChange={e => setImportFile(e.target.files[0])}
              disabled={importing}
            />
          </Form.Group>
          {importing && (
            <div className="text-center py-3">
              <Spinner animation="border" variant="primary" className="mb-2" />
              <div className="small">Đang xử lý dữ liệu, vui lòng đợi...</div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowImport(false)} disabled={importing}>Hủy</Button>
          <Button variant="primary" onClick={handleImport} disabled={importing || !importFile}>
            {importing ? 'Đang nhập...' : 'Bắt đầu nhập'}
          </Button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default Products;