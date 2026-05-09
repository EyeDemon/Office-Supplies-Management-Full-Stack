import React from 'react';

export const PR_STATUS_LABEL = { PENDING:'Chờ duyệt', APPROVED:'Đã duyệt', REJECTED:'Từ chối', CANCELLED:'Đã huỷ', PO_CREATED:'Đã tạo PO' };
export const PR_STATUS_COLOR = { PENDING:'#f59e0b', APPROVED:'#3b82f6', REJECTED:'#ef4444', CANCELLED:'#6b7280', PO_CREATED:'#10b981' };
export const PO_STATUS_LABEL = { DRAFT:'Bản nháp', CONFIRMED:'Đã xác nhận', RECEIVED:'Đã nhận hàng', CANCELLED:'Đã huỷ' };
export const PO_STATUS_COLOR = { DRAFT:'#6b7280', CONFIRMED:'#3b82f6', RECEIVED:'#10b981', CANCELLED:'#ef4444' };
export const PRIORITY_LABEL  = { LOW:'Thấp', MEDIUM:'Trung bình', HIGH:'Cao', URGENT:'Khẩn' };
export const PRIORITY_COLOR  = { LOW:'#6b7280', MEDIUM:'#3b82f6', HIGH:'#f59e0b', URGENT:'#ef4444' };

export const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
export const fmtNum   = (n) => Number(n||0).toLocaleString('vi-VN');
export const fmtMoney = (n) => Number(n||0).toLocaleString('vi-VN') + ' ₫';

export const StatusBadge = ({ s, map, colors }) => (
  <span style={{
    background: (colors[s]||'#6b7280')+'22', color: colors[s]||'#6b7280',
    border: `1px solid ${(colors[s]||'#6b7280')}44`,
    borderRadius:6, padding:'2px 8px', fontSize:'0.72rem', fontWeight:600, whiteSpace:'nowrap'
  }}>{map[s]||s}</span>
);
