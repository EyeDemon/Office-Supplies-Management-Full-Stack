import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Alert, Row, Col } from 'react-bootstrap';
import { authAPI } from '@/services/api';
import { IcoWarehouse, IcoUser, IcoLock, IcoMail } from '@/components/common/Icons.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

import AuthLayout from '@/components/auth/AuthLayout.jsx';

const Register = () => {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ username:'', fullName:'', email:'', password:'', confirmPassword:'' });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validate = () => {
    if (!form.username.trim() || !form.fullName.trim() || !form.email.trim() || !form.password)
      return 'Vui lòng điền đầy đủ thông tin';
    if (form.username.trim().length < 3) return 'Username phải có ít nhất 3 ký tự';
    if (!EMAIL_RE.test(form.email.trim())) return 'Email không đúng định dạng';
    if (form.password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
    if (form.password !== form.confirmPassword) return 'Mật khẩu xác nhận không khớp';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true); setError('');
    try {
      const res = await authAPI.register(form);
      if (res.data?.success) {
        setSuccess('Đăng ký thành công! Chuyển hướng đến đăng nhập...');
        setTimeout(() => navigate('/login'), 1800);
      } else setError(res.data?.message || 'Đăng ký thất bại');
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi kết nối máy chủ');
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout 
      title="Tạo tài khoản" 
      subtitle="Tham gia cùng hàng nghìn doanh nghiệp tối ưu kho bãi"
    >
      {error   && <Alert variant="danger" className="py-2 small border-0 shadow-sm mb-3">{error}</Alert>}
      {success && <Alert variant="success" className="py-2 small border-0 shadow-sm mb-3">{success}</Alert>}

      <Form onSubmit={handleSubmit}>
        <Row className="g-3">
          <Col md={12}>
            <Form.Group>
              <Form.Label>Tên đăng nhập</Form.Label>
              <div className="search-bar">
                <span className="search-bar-icon"><IcoUser size={16}/></span>
                <Form.Control name="username" value={form.username} onChange={handleChange} placeholder="VD: admin_01" autoFocus />
              </div>
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group>
              <Form.Label>Họ và tên</Form.Label>
              <Form.Control name="fullName" value={form.fullName} onChange={handleChange} placeholder="VD: Nguyễn Văn A" />
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group>
              <Form.Label>Email</Form.Label>
              <div className="search-bar">
                <span className="search-bar-icon"><IcoMail size={16}/></span>
                <Form.Control name="email" type="email" value={form.email} onChange={handleChange} placeholder="email@domain.com" />
              </div>
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group>
              <Form.Label>Mật khẩu</Form.Label>
              <div className="search-bar">
                <span className="search-bar-icon"><IcoLock size={16}/></span>
                <Form.Control name="password" type="password" value={form.password} onChange={handleChange} placeholder="Tối thiểu 6 ký tự" />
              </div>
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group>
              <Form.Label>Xác nhận mật khẩu</Form.Label>
              <Form.Control name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} placeholder="Nhập lại mật khẩu" />
            </Form.Group>
          </Col>
        </Row>
        
        <button type="submit" className="btn-auth-premium mt-4" disabled={loading}>
          {loading ? <Spinner size="sm" /> : 'Tạo tài khoản ngay'}
        </button>
      </Form>

      <div className="auth-footer-links">
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </div>
    </AuthLayout>
  );
};
export default Register;
