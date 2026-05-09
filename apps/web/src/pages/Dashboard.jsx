// page/Dashboard.jsx — Refactored to Design System v4 Premium
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Table, Badge, Alert, Spinner, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { productAPI, dashboardAPI, reportsAPI, orderAPI } from '@/services/api';
import { IcoBox, IcoAlertTriangle, IcoUsers, IcoTrendUp, IcoBarChart, IcoClock, IcoPackage, IcoArrowRight, IcoInbox, IcoRefresh, IcoCheck } from '@/components/common/Icons.jsx';
import { SkeletonCard, SkeletonBar, SkeletonRow } from '@/components/common/SkeletonRow.jsx';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

const Dashboard = () => {
  const { user, isManagerOrAdmin, isWarehouseOrAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [weekly, setWeekly] = useState([]);
  const [top5, setTop5] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, wRes, tRes, rRes] = await Promise.all([
        dashboardAPI.getStats(),
        dashboardAPI.getWeekly(),
        reportsAPI.getTopProducts({ type: 'EXPORT', days: 30, limit: 5 }),
        productAPI.getRecentTx(8)
      ]);
      setStats(sRes.data?.data);
      setWeekly(wRes.data?.data || []);
      setTop5(tRes.data?.data || []);
      setRecentTx(rRes.data?.data?.items || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hệ thống Quản trị</h1>
          <p className="page-subtitle">Chào mừng trở lại, <strong>{user?.fullName}</strong>. Dưới đây là tình hình kho bãi hôm nay.</p>
        </div>
        <div className="d-flex gap-2">
           <button className="btn-premium" onClick={loadData} disabled={loading}>
             {loading ? <Spinner size="sm" /> : <IcoRefresh size={16} />} Làm mới
           </button>
        </div>
      </div>

      <Row className="g-4 mb-4">
        <Col md={3}>
           <div className="stat-card-premium blue">
              <div className="label">Tổng Sản Phẩm</div>
              <div className="value">{loading ? <SkeletonBar width="60%" height={28} /> : (stats?.totalProducts || 0)}</div>
              <div className="small text-muted mt-2">Đang quản lý trong hệ thống</div>
           </div>
        </Col>
        <Col md={3}>
           <div className="stat-card-premium green">
              <div className="label">Giá Trị Kho</div>
              <div className="value">{loading ? <SkeletonBar width="80%" height={28} /> : (Number(stats?.totalStockValue || 0).toLocaleString('vi-VN') + 'đ')}</div>
              <div className="small text-muted mt-2">Ước tính giá trị tồn kho</div>
           </div>
        </Col>
        <Col md={3}>
           <div className="stat-card-premium orange">
              <div className="label">Tồn Kho Thấp</div>
              <div className="value">{loading ? <SkeletonBar width="40%" height={28} /> : (stats?.lowStockCount || 0)}</div>
              <div className="small text-warning fw-bold mt-2">Cần nhập thêm hàng ngay</div>
           </div>
        </Col>
        <Col md={3}>
           <div className="stat-card-premium red">
              <div className="label">Hết Hàng</div>
              <div className="value">{loading ? <SkeletonBar width="40%" height={28} /> : (stats?.outOfStockCount || 0)}</div>
              <div className="small text-danger fw-bold mt-2">Giao dịch bị gián đoạn</div>
           </div>
        </Col>
      </Row>

      <Row className="g-4 mb-4">
        <Col lg={8}>
          <div className="data-card p-4 h-100">
            <div className="d-flex justify-content-between align-items-center mb-4">
               <h6 className="fw-bold m-0"><IcoBarChart size={18} className="text-primary me-2" /> Hoạt động kho 7 ngày gần nhất</h6>
               <Badge className="badge-neutral">Theo số lượng mặt hàng</Badge>
            </div>
            <div style={{ height: 300 }}>
               {loading ? <SkeletonBar width="100%" height="100%" /> : (
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={weekly}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                     <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                     <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                     <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                     <Bar dataKey="imported" name="Nhập kho" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                     <Bar dataKey="exported" name="Xuất kho" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                   </BarChart>
                 </ResponsiveContainer>
               )}
            </div>
          </div>
        </Col>
        <Col lg={4}>
          <div className="data-card p-4 h-100">
            <h6 className="fw-bold mb-4"><IcoTrendUp size={18} className="text-success me-2" /> Top 5 tiêu thụ mạnh nhất</h6>
            <div className="d-flex flex-column gap-3">
               {loading ? [1,2,3,4,5].map(i => <SkeletonBar key={i} width="100%" height={40} />) : top5.map((it, idx) => (
                 <div key={idx} className="d-flex align-items-center gap-3 p-2 rounded hover-bg-light transition-all">
                    <div className="fw-bold text-muted" style={{ width: 20 }}>{idx + 1}</div>
                    <div className="flex-grow-1">
                       <div className="fw-bold small text-truncate" style={{ maxWidth: 180 }}>{it.name}</div>
                       <div className="progress mt-1" style={{ height: 4 }}>
                          <div className="progress-bar" style={{ width: `${(it.total_qty / top5[0].total_qty) * 100}%`, backgroundColor: COLORS[idx % COLORS.length] }}></div>
                       </div>
                    </div>
                    <div className="fw-bold text-primary">{it.total_qty}</div>
                 </div>
               ))}
            </div>
            {!loading && top5.length === 0 && <div className="text-center py-5 text-muted small">Chưa có dữ liệu tiêu thụ</div>}
          </div>
        </Col>
      </Row>

      <div className="data-card overflow-hidden">
        <div className="p-4 border-bottom d-flex justify-content-between align-items-center">
           <h6 className="fw-bold m-0"><IcoClock size={18} className="text-warning me-2" /> Giao dịch gần nhất</h6>
           <Link to="/reports" className="small text-primary text-decoration-none fw-bold">Xem tất cả báo cáo →</Link>
        </div>
        <div className="table-responsive">
           <table className="table table-hover mb-0">
              <thead>
                 <tr>
                    <th>Thời gian</th>
                    <th>Sản phẩm</th>
                    <th className="text-center">Loại giao dịch</th>
                    <th className="text-end">Số lượng</th>
                    <th className="text-end">Biến động tồn</th>
                 </tr>
              </thead>
              <tbody>
                 {loading ? [1,2,3,4,5].map(i => <SkeletonRow key={i} cols={5} />) : recentTx.map(tx => (
                    <tr key={tx.id} className="align-middle">
                       <td className="text-muted small">{new Date(tx.createdAt).toLocaleString('vi-VN')}</td>
                       <td>
                          <div className="fw-bold">{tx.productName}</div>
                          <div className="small text-muted font-monospace">{tx.sku}</div>
                       </td>
                       <td className="text-center">
                          <Badge className={tx.type === 'IMPORT' ? 'badge-success' : tx.type === 'EXPORT' ? 'badge-info' : 'badge-warning'}>
                             {tx.type === 'IMPORT' ? 'NHẬP KHO' : tx.type === 'EXPORT' ? 'XUẤT KHO' : 'ĐIỀU CHỈNH'}
                          </Badge>
                       </td>
                       <td className="text-end fw-bold text-primary">{tx.type === 'EXPORT' ? '-' : '+'}{tx.quantity}</td>
                       <td className="text-end text-muted small">{tx.stockBefore} → <strong className="text-dark">{tx.stockAfter}</strong></td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;