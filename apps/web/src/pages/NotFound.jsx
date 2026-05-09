import React from 'react';
import { Link } from 'react-router-dom';
import { IcoArrowRight } from '@/components/common/Icons.jsx';

const NotFound = () => (
  <div style={{ textAlign:'center', padding:'5rem 1rem', color:'var(--text-secondary)' }}>
    <div style={{ fontSize:'5rem', fontWeight:800, color:'var(--brand-primary)', lineHeight:1, marginBottom:'.5rem' }}>404</div>
    <h2 style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:'.5rem' }}>Trang không tồn tại</h2>
    <p style={{ fontSize:'.9rem', marginBottom:'2rem' }}>Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.</p>
    <Link to="/dashboard" className="btn btn-primary">
      Về trang chủ <IcoArrowRight size={14}/>
    </Link>
  </div>
);

export default NotFound;
