import React from 'react';
import { Badge } from 'react-bootstrap';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^(0|\+84)[0-9]{8,10}$/;

export function validateField(name, value, isEdit) {
  switch (name) {
    case 'username':
      if (!value.trim()) return 'Username là bắt buộc';
      if (value.trim().length < 3) return 'Username phải có ít nhất 3 ký tự';
      if (/\s/.test(value)) return 'Username không được chứa khoảng trắng';
      return '';
    case 'fullName':
      if (!value.trim()) return 'Họ tên là bắt buộc';
      if (value.trim().length < 2) return 'Họ tên phải có ít nhất 2 ký tự';
      return '';
    case 'email':
      if (!value.trim()) return 'Email là bắt buộc';
      if (!EMAIL_RE.test(value.trim())) return 'Email không đúng định dạng';
      return '';
    case 'phoneNumber':
      if (value && !PHONE_RE.test(value.trim())) return 'SĐT không đúng định dạng (VD: 0912345678)';
      return '';
    case 'password':
      if (!isEdit && !value) return 'Mật khẩu là bắt buộc';
      if (value && value.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
      return '';
    default: return '';
  }
}

export const RoleBadge = ({ role }) => {
  const map = {
    ADMIN:     { bg: 'danger',  label: 'Admin' },
    MANAGER:   { bg: 'warning', label: 'Manager', text: 'dark' },
    WAREHOUSE: { bg: 'info',    label: 'Nhân viên kho', text: 'dark' },
    USER:      { bg: 'secondary', label: 'Nhân viên' },
  };
  const cfg = map[role] || map.USER;
  return <Badge bg={cfg.bg} text={cfg.text}>{cfg.label}</Badge>;
};
