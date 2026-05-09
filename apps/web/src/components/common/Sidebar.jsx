// components/common/Sidebar.jsx — Refactored to Design System v4 Premium
import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { notificationAPI } from '@/services/api';
import {
  IcoDashboard, IcoBox, IcoBarChart, IcoUsers, IcoLogOut, IcoWarehouse,
  IcoInbox, IcoPackage, IcoShield, IcoCheck, IcoGrid, IcoArrowRight, 
  IcoRefresh, IcoAdjust, IcoClipboard, IcoTruck, IcoBell, IcoActivity
} from './Icons.jsx';

const Sidebar = ({ isOpen = false, onClose }) => {
  const { user, logout, isAdmin, isManagerOrAdmin, isWarehouseOrAdmin } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const r = await notificationAPI.getAll(false);
        setUnread(r.data?.data?.unreadCount || 0);
      } catch { /* ignore */ }
    };
    fetchUnread();
    const t = setInterval(fetchUnread, 60000);
    return () => clearInterval(t);
  }, [user]);

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = (user.fullName || user.username || 'U')
    .split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  const roleName = user.role === 'ADMIN' ? 'Administrator'
    : user.role === 'MANAGER' ? 'Manager'
    : user.role === 'WAREHOUSE' ? 'Nhân viên kho'
    : 'Nhân viên';

  return (
    <aside className={`app-sidebar ${isOpen ? 'mobile-open' : ''}`}>
      <NavLink to="/dashboard" className="sidebar-logo" onClick={() => window.innerWidth < 1024 && onClose && onClose()}>
        <div className="sidebar-logo-icon">Q</div>
        <div className="flex-grow-1">
          <div className="fw-bold" style={{ fontSize: '1.1rem', letterSpacing: '1px' }}>QLVPP</div>
          <div className="small opacity-50" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Smart Inventory</div>
        </div>
      </NavLink>

      <nav className="sidebar-section" onClick={() => window.innerWidth < 1024 && onClose && onClose()}>
        <div className="sidebar-section-label">Tổng quan</div>
        <NavLink to="/dashboard" end className="sidebar-nav-item">
          <IcoDashboard size={18} className="me-3 opacity-75" /> <span>Dashboard</span>
        </NavLink>
        <NavLink to="/notifications" className="sidebar-nav-item">
          <IcoBell size={18} className="me-3 opacity-75" /> 
          <span className="flex-grow-1">Thông báo</span>
          {unread > 0 && <Badge bg="danger" className="rounded-pill" style={{ fontSize: '0.65rem' }}>{unread}</Badge>}
        </NavLink>
        {isWarehouseOrAdmin && (
          <NavLink to="/inventory-intelligence" className="sidebar-nav-item">
            <IcoBarChart size={18} className="me-3 opacity-75" /> <span>Trí tuệ tồn kho</span>
          </NavLink>
        )}

        <div className="sidebar-section-label">Danh mục</div>
        <NavLink to="/products" className="sidebar-nav-item">
          <IcoBox size={18} className="me-3 opacity-75" /> <span>Sản phẩm</span>
        </NavLink>
        <NavLink to="/categories" className="sidebar-nav-item">
          <IcoGrid size={18} className="me-3 opacity-75" /> <span>Danh mục</span>
        </NavLink>
        {isWarehouseOrAdmin && (
          <NavLink to="/warehouses" className="sidebar-nav-item">
            <IcoWarehouse size={18} className="me-3 opacity-75" /> <span>Kho hàng</span>
          </NavLink>
        )}
        {isManagerOrAdmin && (
          <NavLink to="/suppliers" className="sidebar-nav-item">
            <IcoTruck size={18} className="me-3 opacity-75" /> <span>Nhà cung cấp</span>
          </NavLink>
        )}

        <div className="sidebar-section-label">Giao dịch kho</div>
        {isWarehouseOrAdmin && (
          <>
            <NavLink to="/orders" className="sidebar-nav-item">
              <IcoInbox size={18} className="me-3 opacity-75" /> <span>Nhập kho</span>
            </NavLink>
            <NavLink to="/export-orders" className="sidebar-nav-item">
              <IcoPackage size={18} className="me-3 opacity-75" /> <span>Xuất kho</span>
            </NavLink>
            <NavLink to="/returns" className="sidebar-nav-item">
              <IcoRefresh size={18} className="me-3 opacity-75" /> <span>Trả hàng</span>
            </NavLink>
            <NavLink to="/stocktaking" className="sidebar-nav-item">
              <IcoCheck size={18} className="me-3 opacity-75" /> <span>Kiểm kê</span>
            </NavLink>
          </>
        )}
        {isAdmin && (
          <NavLink to="/stock-adjustment" className="sidebar-nav-item">
            <IcoAdjust size={18} className="me-3 opacity-75" /> <span>Điều chỉnh</span>
          </NavLink>
        )}

        <div className="sidebar-section-label">Cấp phát & Mua sắm</div>
        <NavLink to="/requisitions" className="sidebar-nav-item">
          <IcoInbox size={18} className="me-3 opacity-75" /> <span>Yêu cầu cấp phát</span>
        </NavLink>
        {isManagerOrAdmin && (
          <NavLink to="/requisition-approval" className="sidebar-nav-item">
            <IcoCheck size={18} className="me-3 opacity-75" /> <span>Phê duyệt</span>
          </NavLink>
        )}
        {isWarehouseOrAdmin && (
          <NavLink to="/purchases" className="sidebar-nav-item">
            <IcoTruck size={18} className="me-3 opacity-75" /> <span>Đơn mua (PO)</span>
          </NavLink>
        )}

        {isAdmin && (
          <>
            <div className="sidebar-section-label">Hệ thống</div>
            <NavLink to="/users" className="sidebar-nav-item">
              <IcoUsers size={18} className="me-3 opacity-75" /> <span>Người dùng</span>
            </NavLink>
            <NavLink to="/departments" className="sidebar-nav-item">
              <IcoGrid size={18} className="me-3 opacity-75" /> <span>Phòng ban</span>
            </NavLink>
            <NavLink to="/audit" className="sidebar-nav-item">
              <IcoShield size={18} className="me-3 opacity-75" /> <span>Audit Log</span>
            </NavLink>
            <NavLink to="/system-status" className="sidebar-nav-item">
              <IcoActivity size={18} className="me-3 opacity-75" /> <span>Trạng thái hệ thống</span>
            </NavLink>
          </>
        )}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="flex-grow-1 overflow-hidden">
            <div className="sidebar-username text-truncate">{user.fullName || user.username}</div>
            <div className="sidebar-role">{roleName}</div>
          </div>
          <button className="btn btn-link p-0 text-white opacity-50 hover-opacity-100" onClick={handleLogout}>
            <IcoLogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
};

// Helper Badge component since bootstrap's might be too bulky here
const Badge = ({ children, bg, className, style }) => (
  <span className={`badge bg-${bg} ${className}`} style={{ ...style }}>{children}</span>
);

export default Sidebar;
