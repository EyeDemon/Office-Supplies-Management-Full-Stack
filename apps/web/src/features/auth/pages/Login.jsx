// features/auth/pages/Login.jsx — Refactored to Design System v4 Premium
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '@/services/api';
import { IcoWarehouse, IcoUser, IcoLock } from '@/components/common/Icons.jsx';

import AuthLayout from '@/components/auth/AuthLayout.jsx';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Vui lòng điền đầy đủ thông tin tài khoản');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.login(form.username.trim(), form.password);
      if (res.data.success) {
        login(res.data.user, res.data.csrfToken);
        navigate('/dashboard');
      } else {
        const msg = res.data.errors?.[0]?.message || res.data.message || 'Thông tin đăng nhập không chính xác';
        setError(msg);
      }
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || 'Không thể kết nối tới máy chủ';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout 
      title="Chào mừng trở lại" 
      subtitle="Vui lòng đăng nhập để tiếp tục quản lý kho"
    >
      {error && <Alert variant="danger" className="py-2 small border-0 shadow-sm mb-4">{error}</Alert>}

      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-3">
          <Form.Label>Tên đăng nhập</Form.Label>
          <div className="search-bar">
             <span className="search-bar-icon"><IcoUser size={18} /></span>
             <Form.Control 
                name="username" 
                value={form.username} 
                onChange={handleChange} 
                placeholder="Nhập username của bạn" 
                autoFocus 
             />
          </div>
        </Form.Group>

        <Form.Group className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <Form.Label className="m-0">Mật khẩu</Form.Label>
            <Link to="/forgot-password" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-primary)' }}>
              Quên mật khẩu?
            </Link>
          </div>
          <div className="search-bar">
             <span className="search-bar-icon"><IcoLock size={18} /></span>
             <Form.Control 
                type="password" 
                name="password" 
                value={form.password} 
                onChange={handleChange} 
                placeholder="Nhập mật khẩu" 
             />
          </div>
        </Form.Group>

        <button type="submit" className="btn-auth-premium" disabled={loading}>
          {loading ? <Spinner size="sm" /> : 'Đăng nhập vào hệ thống'}
        </button>
      </Form>

      <div className="auth-footer-links">
        Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
      </div>
    </AuthLayout>
  );
};

export default Login;