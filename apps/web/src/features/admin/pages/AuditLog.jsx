import React, { useState } from 'react';
import { Card, Alert, Nav } from 'react-bootstrap';
import { useAuth } from '@/contexts/AuthContext.jsx';

// Refactored components
import LoginAuditTab from '../components/LoginAuditTab';
import GeneralAuditTab from '../components/GeneralAuditTab';

const AuditLog = () => {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('login');

  if (!isAdmin) return <Alert variant="warning">Chỉ Admin mới có quyền xem audit log.</Alert>;

  return (
    <div className="p-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nhật ký hệ thống</h1>
          <p className="page-subtitle">Lịch sử đăng nhập và thay đổi chứng từ toàn hệ thống</p>
        </div>
      </div>

      <Card className="mb-3 shadow-sm border-0" style={{overflow:'hidden'}}>
        <Nav variant="tabs" style={{padding:'0 1rem',background:'var(--surface-1)',borderBottom:'1px solid var(--border-color)'}}>
          <Nav.Item>
            <Nav.Link active={tab==='login'} onClick={()=>setTab('login')}
              style={{cursor:'pointer',fontSize:'.82rem',fontWeight:tab==='login'?700:500, padding: '0.75rem 1.25rem'}}>
              ĐĂNG NHẬP
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link active={tab==='general'} onClick={()=>setTab('general')}
              style={{cursor:'pointer',fontSize:'.82rem',fontWeight:tab==='general'?700:500, padding: '0.75rem 1.25rem'}}>
              BIẾN ĐỘNG CHỨNG TỪ
            </Nav.Link>
          </Nav.Item>
        </Nav>
      </Card>

      <div className="animate-fade-in">
        {tab === 'login'   && <LoginAuditTab   />}
        {tab === 'general' && <GeneralAuditTab />}
      </div>
    </div>
  );
};

export default AuditLog;