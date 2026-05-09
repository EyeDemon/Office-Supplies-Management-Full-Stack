import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Form, Button, Alert } from 'react-bootstrap';
import { authAPI } from '@/services/api';
import { IcoWarehouse, IcoMail } from '@/components/common/Icons.jsx';

import AuthLayout from '@/components/auth/AuthLayout.jsx';

const ForgotPassword = () => {
  const [email, setEmail]     = useState('');
  const [msg, setMsg]         = useState({ type:'', text:'' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setMsg({ type:'danger', text:'Vui lòng nhập email' }); return; }
    setLoading(true); setMsg({ type:'', text:'' });
    try {
      const res = await authAPI.forgotPassword(email.trim());
      if (res.data?.success)
        setMsg({ type:'success', text: res.data.message || 'Email đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.' });
      else setMsg({ type:'danger', text: res.data?.message || 'Không thể gửi email' });
    } catch (err) {
      setMsg({ type:'danger', text: err.response?.data?.message || 'Lỗi kết nối máy chủ' });
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout 
      title="Khôi phục mật khẩu" 
      subtitle="Nhập email của bạn để nhận liên kết đặt lại mật khẩu"
    >
      {msg.text && (
        <Alert variant={msg.type} className="py-2 small border-0 shadow-sm mb-4">
          {msg.text}
        </Alert>
      )}

      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-4">
          <Form.Label>Địa chỉ Email</Form.Label>
          <div className="search-bar">
            <span className="search-bar-icon"><IcoMail size={18}/></span>
            <Form.Control
              type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="Nhập email đã đăng ký" autoFocus
            />
          </div>
        </Form.Group>
        
        <button type="submit" className="btn-auth-premium" disabled={loading}>
          {loading ? <Spinner size="sm" /> : 'Gửi yêu cầu khôi phục'}
        </button>
      </Form>

      <div className="auth-footer-links">
        <Link to="/login">Quay lại đăng nhập</Link>
      </div>
    </AuthLayout>
  );
};
export default ForgotPassword;
