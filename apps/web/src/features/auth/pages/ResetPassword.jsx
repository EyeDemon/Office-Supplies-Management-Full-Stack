import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Form, Button, Alert } from 'react-bootstrap';
import { authAPI } from '@/services/api';
import { IcoWarehouse, IcoLock, IcoKey } from '@/components/common/Icons.jsx';

import AuthLayout from '@/components/auth/AuthLayout.jsx';

const ResetPassword = () => {
  const [searchParams]              = useSearchParams();
  const navigate                    = useNavigate();
  const token                       = searchParams.get('token');
  const [tokenValid, setTokenValid] = useState(null);
  const [form, setForm]             = useState({ newPassword:'', confirmPassword:'' });
  const [msg, setMsg]               = useState({ type:'', text:'' });
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);

  useEffect(() => {
    if (!token) { setTokenValid(false); return; }
    authAPI.verifyResetToken(token).then(()=>setTokenValid(true)).catch(()=>setTokenValid(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg({ type:'', text:'' });
    if (!form.newPassword || !form.confirmPassword) { setMsg({ type:'danger', text:'Vui lòng điền đầy đủ' }); return; }
    if (form.newPassword.length < 6) { setMsg({ type:'danger', text:'Mật khẩu phải có ít nhất 6 ký tự' }); return; }
    if (form.newPassword !== form.confirmPassword) { setMsg({ type:'danger', text:'Mật khẩu xác nhận không khớp' }); return; }
    setLoading(true);
    try {
      const res = await authAPI.resetPassword(token, form.newPassword, form.confirmPassword);
      if (res.data?.success) {
        setDone(true);
        setMsg({ type:'success', text: res.data.message || 'Đặt lại mật khẩu thành công!' });
        setTimeout(() => navigate('/login'), 2500);
      } else setMsg({ type:'danger', text: res.data?.message || 'Đặt lại thất bại' });
    } catch (err) {
      setMsg({ type:'danger', text: err.response?.data?.message || 'Lỗi kết nối máy chủ' });
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout 
      title="Mật khẩu mới" 
      subtitle="Thiết lập lại mật khẩu an toàn cho tài khoản"
    >
      {tokenValid === null && (
        <div className="text-center py-4" style={{ color: 'var(--text-muted)' }}>
          <Spinner size="sm" className="me-2" /> Đang xác minh...
        </div>
      )}

      {tokenValid === false && (
        <div className="text-center">
          <Alert variant="danger" className="py-2 small border-0 shadow-sm mb-4">
            Liên kết đã hết hạn hoặc không chính xác
          </Alert>
          <Link to="/forgot-password" style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>
            Yêu cầu liên kết mới
          </Link>
        </div>
      )}

      {tokenValid === true && !done && (
        <>
          {msg.text && <Alert variant={msg.type} className="py-2 small border-0 shadow-sm mb-4">{msg.text}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Mật khẩu mới</Form.Label>
              <div className="search-bar">
                <span className="search-bar-icon"><IcoLock size={16}/></span>
                <Form.Control type="password" value={form.newPassword} onChange={e=>setForm({...form,newPassword:e.target.value})} placeholder="Tối thiểu 6 ký tự" autoFocus />
              </div>
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>Xác nhận mật khẩu</Form.Label>
              <Form.Control type="password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} placeholder="Nhập lại mật khẩu"/>
            </Form.Group>
            
            <button type="submit" className="btn-auth-premium" disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Đặt lại mật khẩu'}
            </button>
          </Form>
        </>
      )}

      {done && (
        <div className="text-center">
          <Alert variant="success" className="py-2 small border-0 shadow-sm mb-4">{msg.text}</Alert>
          <p className="small text-muted">Đang chuyển hướng về trang đăng nhập...</p>
        </div>
      )}

      <div className="auth-footer-links">
        <Link to="/login">Quay lại đăng nhập</Link>
      </div>
    </AuthLayout>
  );
};
export default ResetPassword;
