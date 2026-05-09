import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Row, Col, Card, Table, Button, Badge, Form, Alert, InputGroup } from 'react-bootstrap';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import { useToast, ToastContainer } from '@/components/common/ToastNotification.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { productAPI, categoryAPI, adjustmentAPI, warehouseAPI } from '@/services/api';
import { IcoAdjust, IcoSearch, IcoBox, IcoAlertTriangle } from '@/components/common/Icons.jsx';
import useAutoAlert from '@/hooks/useAutoAlert';

// Refactored components
import AdjustmentModal from '../components/AdjustmentModal';
import AdjustmentHistory from '../components/AdjustmentHistory';

const UNIT_LABELS = {
  CAI:'Cái', HOP:'Hộp', GOI:'Gói', CUON:'Cuộn', BO:'Bộ',
  TUP:'Tuýp', LOC:'Lọc', KG:'Kg', MET:'Mét', TO:'Tờ',
};

const StockAdjustment = () => {
  const { isAdmin } = useAuth();
  const { toasts, dismiss, showToast } = useToast();

  // Product list state
  const [products,    setProducts]   = useState([]);
  const [categories,  setCategories] = useState([]);
  const [totalCount,  setTotalCount] = useState(0);
  const [totalPages,  setTotalPages] = useState(0);
  const [loading,     setLoading]    = useState(false);
  const [page,        setPage]       = useState(1);
  const [search,      setSearch]     = useState('');
  const [catFilter,   setCatFilter]  = useState('');
  const [lowOnly,     setLowOnly]    = useState(false);

  // History state
  const [history,     setHistory]    = useState([]);
  const [histTotal,   setHistTotal]  = useState(0);
  const [histPages,   setHistPages]  = useState(0);
  const [histPage,    setHistPage]   = useState(1);
  const [histLoading, setHistLoading] = useState(false);
  const [histSearch,  setHistSearch]  = useState('');
  const [dateFrom,    setDateFrom]   = useState('');
  const [dateTo,      setDateTo]     = useState('');
  const [exporting,   setExporting]  = useState(false);

  // Modal state
  const [modal,      setModal]      = useState({ show: false, product: null });
  const [warehouses, setWarehouses] = useState([]);

  const [msg, setMsg] = useState({ type: '', text: '' });
  useAutoAlert(msg, setMsg);

  const searchTimer = useRef(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productAPI.getAll({ 
        page, size: 20, search, categoryId: catFilter, lowStock: lowOnly 
      });
      const d = res.data?.data || {};
      setProducts(d.items || []);
      setTotalCount(d.totalCount || 0);
      setTotalPages(d.totalPages || 0);
    } catch { 
      setMsg({ type: 'danger', text: 'Không thể tải danh sách sản phẩm' }); 
    } finally { 
      setLoading(false); 
    }
  }, [page, search, catFilter, lowOnly]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await adjustmentAPI.getAll({
        page: histPage, size: 15,
        search: histSearch || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
      });
      const d = res.data?.data || {};
      setHistory(d.items || []);
      setHistTotal(d.totalCount || 0);
      setHistPages(d.totalPages || 0);
    } catch { 
      setHistory([]); 
    } finally { 
      setHistLoading(false); 
    }
  }, [histPage, histSearch, dateFrom, dateTo]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    categoryAPI.getAll().then(r => setCategories(r.data?.data?.items || [])).catch(() => {});
    warehouseAPI.getAllList().then(r => setWarehouses(r.data?.data || [])).catch(() => {});
  }, []);

  const handleSearch = (v) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1); }, 400);
  };

  const handleAdjustmentSubmit = async (data) => {
    await productAPI.stockAdjust(data.productId, {
      quantity: data.quantity,
      reason: data.reason,
      warehouseId: data.warehouseId
    });
    
    const diffStr = (data.quantity - data.baseQty) > 0 ? `+${data.quantity - data.baseQty}` : `${data.quantity - data.baseQty}`;
    showToast(`✅ Điều chỉnh "${modal.product.name}" → ${data.quantity} (${diffStr}) tại ${data.whName}`, { variant: 'success' });
    
    loadProducts();
    setHistPage(1);
    loadHistory();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await adjustmentAPI.exportCsv({
        search: histSearch || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `lich-su-dieu-chinh-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch { 
      setMsg({ type: 'danger', text: 'Xuất CSV thất bại' }); 
    } finally { 
      setExporting(false); 
    }
  };

  if (!isAdmin) {
    return (
      <Container className="py-4">
        <Alert variant="warning"><IcoAlertTriangle size={16} className="me-2"/>Chỉ Admin mới có quyền điều chỉnh tồn kho.</Alert>
      </Container>
    );
  }

  return (
    <Container fluid className="py-3">
      <div className="d-flex align-items-center gap-2 mb-3">
        <IcoAdjust size={20} className="text-warning"/>
        <h5 className="mb-0 fw-bold">Điều chỉnh Tồn Kho</h5>
      </div>

      {msg.text && <Alert variant={msg.type} dismissible onClose={() => setMsg({ type:'', text:'' })} className="py-2 small">{msg.text}</Alert>}

      <Row className="g-3">
        <Col lg={7}>
          <Card className="shadow-sm border-0">
            <Card.Header className="py-2 bg-white border-bottom">
              <Row className="g-2">
                <Col>
                  <InputGroup size="sm">
                    <InputGroup.Text><IcoSearch size={13}/></InputGroup.Text>
                    <Form.Control placeholder="Tìm sản phẩm..." onChange={e => handleSearch(e.target.value)} />
                  </InputGroup>
                </Col>
                <Col xs="auto">
                  <Form.Select size="sm" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}>
                    <option value="">Tất cả danh mục</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Form.Select>
                </Col>
                <Col xs="auto">
                  <Form.Check type="switch" label={<small>Tồn thấp</small>} checked={lowOnly} onChange={e => { setLowOnly(e.target.checked); setPage(1); }} />
                </Col>
              </Row>
            </Card.Header>
            <Card.Body className="p-0">
              {loading ? (
                <Table size="sm" className="mb-0"><tbody>{[1,2,3,4,5].map(i => <SkeletonRow key={i} cols={5} />)}</tbody></Table>
              ) : products.length === 0 ? (
                <div className="text-center py-5 text-muted"><IcoBox size={32} className="mb-2 opacity-25 d-block mx-auto"/><small>Không có sản phẩm</small></div>
              ) : (
                <Table hover size="sm" className="mb-0" responsive>
                  <thead className="table-light">
                    <tr><th>SKU</th><th>Tên sản phẩm</th><th className="text-center">Tồn hiện tại</th><th className="text-center">Tồn tối thiểu</th><th></th></tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id} className={p.lowStock ? 'table-warning' : ''}>
                        <td className="text-muted small">{p.sku}</td>
                        <td className="fw-medium">{p.name}</td>
                        <td className="text-center fw-bold">{p.stockQty} <small className="text-muted fw-normal">{UNIT_LABELS[p.unit] || p.unit}</small></td>
                        <td className="text-center text-muted small">{p.minStockQty}</td>
                        <td className="text-center">
                          <Button size="sm" variant="outline-warning" onClick={() => setModal({ show: true, product: p })} style={{ fontSize: '0.72rem' }}>
                            <IcoAdjust size={12} className="me-1"/>Điều chỉnh
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
            {totalPages > 1 && (
              <Card.Footer className="py-2 d-flex justify-content-between">
                <Button size="sm" variant="outline-secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>‹</Button>
                <span className="small">{page}/{totalPages}</span>
                <Button size="sm" variant="outline-secondary" disabled={page>=totalPages} onClick={()=>setPage(page+1)}>›</Button>
              </Card.Footer>
            )}
          </Card>
        </Col>

        <Col lg={5}>
          <AdjustmentHistory 
            history={history} total={histTotal} pages={histPages} page={histPage} loading={histLoading}
            onPageChange={setHistPage} onSearchChange={setHistSearch} onExport={handleExport} exporting={exporting}
            dateFrom={dateFrom} dateTo={dateTo} onDateChange={(type, val) => type === 'from' ? setDateFrom(val) : setDateTo(val)}
          />
        </Col>
      </Row>

      <AdjustmentModal 
        show={modal.show} product={modal.product} warehouses={warehouses}
        onHide={() => setModal({ show: false, product: null })}
        onSubmit={handleAdjustmentSubmit}
      />
      
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </Container>
  );
};

export default StockAdjustment;