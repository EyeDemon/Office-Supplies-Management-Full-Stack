import React from 'react';

export const ACTION_MAP = {
  CREATE: { label: 'Tạo mới',    cls: 'badge-info'    },
  SUBMIT: { label: 'Gửi duyệt',  cls: 'badge-warning' },
  APPROVE:{ label: 'Duyệt',      cls: 'badge-success' },
  REJECT: { label: 'Từ chối',    cls: 'badge-danger'  },
  COMPLETE:{ label:'Hoàn tất',   cls: 'badge-success' },
  CONFIRM:{ label: 'Xác nhận',   cls: 'badge-success' },
  CANCEL: { label: 'Huỷ',        cls: 'badge-neutral' },
  UPDATE: { label: 'Cập nhật',   cls: 'badge-info'    },
};

export const ENTITY_LABELS = {
  import_order:'Phiếu nhập', export_order:'Phiếu xuất', stock_transfer:'Điều chuyển',
  requisition:'Cấp phát', purchase_request:'Yêu cầu mua', purchase_order:'Đơn mua',
  return_order:'Trả hàng', stocktaking:'Kiểm kê', product:'Sản phẩm',
  stock_adjustment:'Điều chỉnh tồn', user:'Người dùng',
};

export const today = () => new Date().toISOString().slice(0, 10);
export const fmt   = dt => dt ? new Date(dt).toLocaleString('vi-VN') : '—';
