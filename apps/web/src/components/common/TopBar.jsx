// components/common/TopBar.jsx — Refactored to Design System v4 Premium
import React from 'react';
import { useAuth } from '@/contexts/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import { IcoMenu } from './Icons.jsx';

const PAGE_TITLES = {
  '/dashboard':             { title: 'Bảng điều khiển',     sub: 'Số liệu tổng quan toàn hệ thống' },
  '/products':              { title: 'Kho Vật Phẩm',        sub: 'Quản lý tồn kho và định mức' },
  '/categories':            { title: 'Phân Loại',           sub: 'Danh mục văn phòng phẩm' },
  '/reports':               { title: 'Báo Cáo',             sub: 'Phân tích dữ liệu nhập xuất' },
  '/suppliers':             { title: 'Nhà Cung Cấp',        sub: 'Quản lý đối tác chiến lược' },
  '/orders':                { title: 'Nhập Kho',            sub: 'Xử lý hàng hóa vào kho' },
  '/audit':                 { title: 'Audit Log',           sub: 'Nhật ký an toàn hệ thống' },
  '/users':                 { title: 'Người Dùng',          sub: 'Phân quyền và tài khoản' },
  '/profile':               { title: 'Hồ Sơ',               sub: 'Thiết lập cá nhân' },
  '/requisitions':          { title: 'Yêu Cầu',             sub: 'Phiếu xin cấp phát vật phẩm' },
  '/requisition-approval':  { title: 'Phê Duyệt',           sub: 'Xét duyệt yêu cầu từ bộ phận' },
  '/stocktaking':           { title: 'Kiểm Kê',             sub: 'Đối chiếu kho thực tế' },
  '/export-orders':         { title: 'Xuất Kho',            sub: 'Phân phối vật phẩm ra ngoài' },
  '/transfers':             { title: 'Điều Chuyển',         sub: 'Luân chuyển giữa các kho' },
  '/purchases':             { title: 'Mua Sắm',             sub: 'Theo dõi đơn hàng PO/PR' },
  '/returns':               { title: 'Hàng Trả',            sub: 'Xử lý hàng hoàn, hàng lỗi' },
  '/stock-adjustment':      { title: 'Điều Chỉnh',          sub: 'Cập nhật số dư tồn kho' },
  '/warehouses':            { title: 'Kho Bãi',             sub: 'Cấu trúc hệ thống kho hàng' },
  '/notifications':         { title: 'Thông Báo',           sub: 'Tin nhắn hệ thống và cảnh báo' },
};

const TopBar = ({ path, onMenuClick }) => {
  const { user } = useAuth();
  if (!user) return null;

  const info = PAGE_TITLES[path] || { title: 'Hệ Thống', sub: 'Quản lý văn phòng phẩm' };
  
  return (
    <header className="app-topbar">
      <button className="btn btn-link p-0 me-3 d-lg-none" onClick={onMenuClick}>
        <IcoMenu size={20} />
      </button>

      <div className="flex-grow-1">
        <div className="fw-bold text-dark" style={{ fontSize: '1rem', letterSpacing: '-0.01em' }}>{info.title}</div>
        <div className="small text-muted d-none d-sm-block" style={{ fontSize: '0.75rem' }}>{info.sub}</div>
      </div>

      <div className="d-flex align-items-center gap-3">
        <NotificationBell />
        <div className="d-none d-md-block text-end">
           <div className="fw-bold small" style={{ lineHeight: 1.2 }}>{user.fullName || user.username}</div>
           <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>{user.role}</div>
        </div>
        <div className="sidebar-avatar" style={{ width: 34, height: 34, fontSize: '0.75rem' }}>
          {(user.fullName || user.username || 'U')[0].toUpperCase()}
        </div>
      </div>
    </header>
  );
};

export default TopBar;