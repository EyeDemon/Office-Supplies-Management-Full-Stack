import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Form, Button, Nav, Alert } from 'react-bootstrap';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { reportsAPI, userAPI, warehouseAPI } from '@/services/api';
import { IcoBarChart, IcoTrendUp, IcoFolder, IcoFilter, IcoUsers } from '@/components/common/Icons.jsx';
import { today } from '../utils/reportHelpers';

// Sub-components (Tab contents)
import ActivityTab from '../components/ActivityTab';
import CategoryTab from '../components/CategoryTab';
import TopProductsTab from '../components/TopProductsTab';
import BurnRateTab from '../components/BurnRateTab';
import DeadStockTab from '../components/DeadStockTab';
import StockHistoryTab from '../components/StockHistoryTab';
import FinancialTab from '../components/FinancialTab';
import InOutBalanceTab from '../components/InOutBalanceTab';
import InventoryValueTab from '../components/InventoryValueTab';
import ConsumptionTab from '../components/ConsumptionTab';
import StockTrendTab from '../components/StockTrendTab';

const PRESETS = [
  { label: '7 ngày',  days: 7  },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
];

const Reports = () => {
  const { isManagerOrAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('activity');
  const [actData,   setActData]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  /* Time filters for ActivityTab */
  const [preset,   setPreset]   = useState(30);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [useRange, setUseRange] = useState(false);

  /* Department filter */
  const [department,   setDepartment]   = useState('');
  const [departments,  setDepartments]  = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  /* Warehouse filter for stock-activity */
  const [actWarehouseId, setActWarehouseId] = useState('');
  const [warehouses,     setWarehouses]     = useState([]);

  /* Load supporting data */
  useEffect(() => {
    if (!isManagerOrAdmin) return;
    
    setLoadingDepts(true);
    userAPI.getDepartments()
      .then(r => setDepartments(r.data?.data || []))
      .catch(() => {})
      .finally(() => setLoadingDepts(false));

    warehouseAPI.getAll({ size: 100 })
      .then(r => setWarehouses(r.data?.data?.items || []))
      .catch(() => {});
  }, [isManagerOrAdmin]);

  const loadActivity = useCallback(() => {
    if (!isManagerOrAdmin) return;
    setLoading(true); setError('');
    const params = useRange && dateFrom && dateTo
      ? { dateFrom, dateTo }
      : { days: preset };
    if (department) params.department = department;
    if (actWarehouseId) params.warehouseId = actWarehouseId;
    
    reportsAPI.getStockActivity(params)
      .then(r => setActData(r.data?.data || []))
      .catch(() => setError('Không thể tải báo cáo hoạt động kho'))
      .finally(() => setLoading(false));
  }, [isManagerOrAdmin, preset, dateFrom, dateTo, useRange, department, actWarehouseId]);

  useEffect(() => {
    if (activeTab === 'activity') loadActivity();
  }, [activeTab, loadActivity]);

  if (!isManagerOrAdmin) {
    return <Alert variant="warning">Bạn không có quyền xem báo cáo này.</Alert>;
  }

  const exportParams = {
    ...(useRange && dateFrom && dateTo ? { dateFrom, dateTo } : { days: preset }),
    ...(department ? { department } : {}),
    ...(actWarehouseId ? { warehouseId: actWarehouseId } : {}),
  };

  const periodLabel = useRange && dateFrom && dateTo
    ? dateFrom + ' → ' + dateTo
    : preset + ' ngày qua';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Báo cáo kho</h1>
          <p className="page-subtitle">
            Phân tích hoạt động nhập xuất · <strong>{periodLabel}</strong>
            {department && (
              <> · Phòng ban: <strong style={{ color: 'var(--color-indigo)' }}>{department}</strong></>
            )}
          </p>
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {/* Filter bar — only shown on Activity tab */}
      {activeTab === 'activity' && (
        <Card className="mb-3 shadow-sm border-0">
          <Card.Body className="py-2 px-3">
            <Row className="align-items-center g-3">
              <Col xs={12} lg="auto">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>
                    <IcoFilter size={13} style={{ marginRight: 4 }} />Thời gian:
                  </span>
                  {PRESETS.map(p => (
                    <button key={p.days}
                      onClick={() => { setPreset(p.days); setUseRange(false); setDateFrom(''); setDateTo(''); }}
                      className={'icon-btn' + (!useRange && preset === p.days ? ' icon-btn-primary' : '')}
                      style={{ padding: '.3rem .6rem', fontSize: '.78rem', borderRadius: 5 }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </Col>

              <Col xs={12} lg="auto">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>Hoặc:</span>
                  <Form.Control type="date" size="sm" value={dateFrom}
                    max={dateTo || today()}
                    onChange={e => { setDateFrom(e.target.value); setUseRange(false); }}
                    style={{ width: 140 }} />
                  <span style={{ fontSize: '.78rem' }}>→</span>
                  <Form.Control type="date" size="sm" value={dateTo}
                    min={dateFrom} max={today()}
                    onChange={e => { setDateTo(e.target.value); setUseRange(false); }}
                    style={{ width: 140 }} />
                  <Button size="sm" variant="outline-primary"
                    disabled={!dateFrom || !dateTo}
                    onClick={() => setUseRange(true)}
                    style={{ fontSize: '.78rem' }}>
                    Áp dụng
                  </Button>
                </div>
              </Col>

              <Col xs={12} md="auto">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <IcoUsers size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  <Form.Select size="sm"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    disabled={loadingDepts}
                    style={{ width: 160 }}
                    title="Lọc theo phòng ban xuất">
                    <option value="">Tất cả phòng ban</option>
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Form.Select>
                </div>
              </Col>

              <Col xs={12} md="auto">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>🏭 Kho:</span>
                  <Form.Select size="sm"
                    value={actWarehouseId}
                    onChange={e => setActWarehouseId(e.target.value)}
                    style={{ width: 160 }}
                    title="Lọc theo kho">
                    <option value="">Tất cả kho</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </Form.Select>
                </div>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      {/* Navigation Tabs */}
      <Nav variant="tabs" className="mb-3 custom-tabs" activeKey={activeTab} onSelect={k => setActiveTab(k)}>
        <Nav.Item><Nav.Link eventKey="activity"><IcoBarChart size={13} className="me-1" />Hoạt động kho</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="category"><IcoFolder size={13} className="me-1" />Theo danh mục</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="top"><IcoTrendUp size={13} className="me-1" />Top sản phẩm</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="burnrate">🔥 Burn Rate</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="deadstock">💀 Hàng chết</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="stockhistory">📸 Lịch sử tồn</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="financial">💰 Chi phí</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="inout">📊 N-X-Tồn</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="invvalue">💵 Giá trị vốn</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="consumption">📉 Tiêu hao</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="stocktrend">📈 Xu hướng</Nav.Link></Nav.Item>
      </Nav>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'activity' && (
          <ActivityTab 
            data={actData} 
            loading={loading} 
            exportParams={exportParams} 
            actWarehouseId={actWarehouseId} 
          />
        )}
        {activeTab === 'category'    && <CategoryTab />}
        {activeTab === 'top'         && <TopProductsTab />}
        {activeTab === 'burnrate'    && <BurnRateTab />}
        {activeTab === 'deadstock'   && <DeadStockTab />}
        {activeTab === 'stockhistory' && <StockHistoryTab warehouses={warehouses} />}
        {activeTab === 'financial'   && <FinancialTab />}
        {activeTab === 'inout'       && <InOutBalanceTab warehouses={warehouses} />}
        {activeTab === 'invvalue'    && <InventoryValueTab warehouses={warehouses} />}
        {activeTab === 'consumption' && <ConsumptionTab warehouses={warehouses} />}
        {activeTab === 'stocktrend'  && <StockTrendTab warehouses={warehouses} />}
      </div>
    </>
  );
};

export default Reports;