import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Form, Button, Alert, Badge, Spinner, ProgressBar } from 'react-bootstrap';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { userAPI, authAPI } from '@/services/api';
import { IcoUser, IcoMail, IcoPhone, IcoLock, IcoCheck, IcoShield, IcoGrid } from '@/components/common/Icons.jsx';

const UserProfile = () => {
  const { user, login } = useAuth();

  const [formData, setFormData] = useState({
    email:       user?.email       || '',
    fullName:    user?.fullName    || '',
    phoneNumber: user?.phoneNumber || '',
    department:  user?.department  || '',
  });
  const [pwData, setPwData] = useState({ currentPassword:'', newPassword:'', confirmPassword:'' });
  const [msg,            setMsg]           = useState({ type:'', text:'' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [pwLoading,      setPwLoading]      = useState(false);
  const [pwTouched, setPwTouched] = useState({ currentPassword:false, newPassword:false, confirmPassword:false });

  useEffect(() => {
    if (user) setFormData({ email:user.email||'', fullName:user.fullName||'', phoneNumber:user.phoneNumber||'', department:user.department||'' });
  }, [user]);

  const showMsg = (type, text) => setMsg({ type, text });
  const clearMsg = () => setMsg({ type:'', text:'' });
  const handleChange   = e => setFormData(prev=>({...prev,[e.target.name]:e.target.value}));
  const handlePwChange = e => { const {name,value}=e.target; setPwData(prev=>({...prev,[name]:value})); };
  const handlePwBlur   = field => setPwTouched(prev=>({...prev,[field]:true}));

  const pwStrength = useMemo(() => {
    const pw = pwData.newPassword;
    if (!pw) return { score:0, label:'', variant:'' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
      { score:0, label:'', variant:'' },
      { score:1, label:'Yếu', variant:'danger' },
      { score:2, label:'Trung bình', variant:'warning' },
      { score:3, label:'Khá', variant:'info' },
      { score:4, label:'Mạnh', variant:'success' },
    ];
    return levels[score] || levels[0];
  }, [pwData.newPassword]);

  const pwErrors = useMemo(() => {
    const e = {};
    if (pwTouched.currentPassword && !pwData.currentPassword) e.currentPassword = 'Nhập mật khẩu hiện tại';
    if (pwTouched.newPassword) {
      if (!pwData.newPassword) e.newPassword = 'Nhập mật khẩu mới';
      else if (pwData.newPassword.length < 6) e.newPassword = 'Tối thiểu 6 ký tự';
    }
    if (pwTouched.confirmPassword && pwData.newPassword !== pwData.confirmPassword)
      e.confirmPassword = 'Mật khẩu không khớp';
    return e;
  }, [pwData, pwTouched]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!formData.fullName.trim()) { showMsg('danger','Họ tên là bắt buộc'); return; }
    setProfileLoading(true); clearMsg();
    try {
      const res = await userAPI.updateUser(user.id, formData);
      if (res.data?.success) { login({...user,...res.data.data}); showMsg('success','Cập nhật thông tin thành công'); }
      else showMsg('danger', res.data?.message||'Cập nhật thất bại');
    } catch (err) { showMsg('danger', err.response?.data?.message||'Lỗi kết nối'); }
    finally { setProfileLoading(false); }
  };

  const handlePwSave = async (e) => {
    e.preventDefault();
    setPwTouched({ currentPassword:true, newPassword:true, confirmPassword:true });
    if (!pwData.currentPassword || !pwData.newPassword || !pwData.confirmPassword) { showMsg('danger','Điền đầy đủ thông tin'); return; }
    if (pwData.newPassword.length < 6) { showMsg('danger','Mật khẩu mới tối thiểu 6 ký tự'); return; }
    if (pwData.newPassword !== pwData.confirmPassword) { showMsg('danger','Mật khẩu xác nhận không khớp'); return; }
    setPwLoading(true); clearMsg();
    try {
      const res = await authAPI.changePassword(pwData.currentPassword, pwData.newPassword);
      if (res.data?.success) {
        showMsg('success','Đổi mật khẩu thành công');
        setPwData({ currentPassword:'', newPassword:'', confirmPassword:'' });
        setPwTouched({ currentPassword:false, newPassword:false, confirmPassword:false });
      } else showMsg('danger', res.data?.message||'Đổi mật khẩu thất bại');
    } catch (err) { showMsg('danger', err.response?.data?.message||'Lỗi kết nối'); }
    finally { setPwLoading(false); }
  };

  const initials = (user?.fullName||user?.username||'U').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
  const roleLabel = user?.role==='ADMIN'?'Quản trị viên':user?.role==='MANAGER'?'Quản lý':'Nhân viên';
  const roleBadgeCls = user?.role==='ADMIN'?'badge-danger':user?.role==='MANAGER'?'badge-warning':'badge-info';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hồ sơ cá nhân</h1>
          <p className="page-subtitle">Quản lý thông tin và bảo mật tài khoản</p>
        </div>
      </div>

      {msg.text && (
        <Alert variant={msg.type} dismissible onClose={clearMsg} className="mb-3">{msg.text}</Alert>
      )}

      <Row className="g-4">
        {/* Profile card */}
        <Col lg={4}>
          <Card className="text-center" style={{ padding:'2rem 1.5rem' }}>
            <div style={{ width:80,height:80,borderRadius:'50%',background:'var(--brand-primary)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.75rem',fontWeight:700,color:'#fff',margin:'0 auto 1rem' }}>
              {initials}
            </div>
            <h5 style={{ fontWeight:700,marginBottom:'.25rem' }}>{user?.fullName || user?.username}</h5>
            <p style={{ color:'var(--text-secondary)',fontSize:'.82rem',marginBottom:'.75rem' }}>@{user?.username}</p>
            <Badge className={roleBadgeCls}>{roleLabel}</Badge>
            <div style={{ marginTop:'1.5rem',borderTop:'1px solid var(--card-border)',paddingTop:'1.25rem',textAlign:'left' }}>
              {[
                { icon:IcoMail,  label:'Email',     value:user?.email       || '—' },
                { icon:IcoPhone, label:'SĐT',       value:user?.phoneNumber || '—' },
                { icon:IcoGrid,  label:'Phòng ban',  value:user?.department  || '—' },
                { icon:IcoShield,label:'Vai trò',   value:roleLabel },
              ].map(({ icon:Icon, label, value }) => (
                <div key={label} style={{ display:'flex',alignItems:'center',gap:'.65rem',marginBottom:'.75rem',fontSize:'.82rem' }}>
                  <div style={{ width:28,height:28,borderRadius:6,background:'var(--brand-light)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    <Icon size={13} style={{ color:'var(--brand-primary)' }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:'.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.04em' }}>{label}</div>
                    <div style={{ color:'var(--text-primary)',fontWeight:500,wordBreak:'break-all' }}>{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* Edit forms */}
        <Col lg={8}>
          {/* Profile info form */}
          <Card className="mb-4">
            <Card.Header>
              <div style={{ display:'flex',alignItems:'center',gap:'.5rem' }}>
                <IcoUser size={15} style={{ color:'var(--brand-primary)' }}/>
                Thông tin cá nhân
              </div>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleProfileSave}>
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Tên đăng nhập</Form.Label>
                      <Form.Control value={user?.username||''} disabled style={{ background:'var(--table-header-bg)',color:'var(--text-secondary)' }}/>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Họ và tên <span style={{color:'var(--color-danger)'}}>*</span></Form.Label>
                      <Form.Control name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Họ và tên đầy đủ" autoFocus/>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Email <span style={{color:'var(--color-danger)'}}>*</span></Form.Label>
                      <Form.Control name="email" type="email" value={formData.email} onChange={handleChange} placeholder="email@example.com"/>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Số điện thoại</Form.Label>
                      <Form.Control name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} placeholder="0912 345 678"/>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Phòng ban</Form.Label>
                      <Form.Control name="department" value={formData.department} onChange={handleChange} placeholder="VD: Phòng IT, Kế toán..."/>
                    </Form.Group>
                  </Col>
                </Row>
                <div style={{ marginTop:'1rem',display:'flex',justifyContent:'flex-end' }}>
                  <Button type="submit" variant="primary" disabled={profileLoading}>
                    {profileLoading ? <><Spinner size="sm"/> Đang lưu...</> : <><IcoCheck size={14}/> Lưu thay đổi</>}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>

          {/* Password form */}
          <Card>
            <Card.Header>
              <div style={{ display:'flex',alignItems:'center',gap:'.5rem' }}>
                <IcoLock size={15} style={{ color:'var(--brand-primary)' }}/>
                Đổi mật khẩu
              </div>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handlePwSave}>
                <Row className="g-3">
                  <Col md={12}>
                    <Form.Group>
                      <Form.Label>Mật khẩu hiện tại <span style={{color:'var(--color-danger)'}}>*</span></Form.Label>
                      <Form.Control
                        name="currentPassword" type="password" value={pwData.currentPassword}
                        onChange={handlePwChange} onBlur={()=>handlePwBlur('currentPassword')}
                        placeholder="Nhập mật khẩu hiện tại"
                        autoComplete="current-password"
                        isInvalid={!!pwErrors.currentPassword}
                      />
                      {pwErrors.currentPassword && <Form.Control.Feedback type="invalid">{pwErrors.currentPassword}</Form.Control.Feedback>}
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Mật khẩu mới <span style={{color:'var(--color-danger)'}}>*</span></Form.Label>
                      <Form.Control
                        name="newPassword" type="password" value={pwData.newPassword}
                        onChange={handlePwChange} onBlur={()=>handlePwBlur('newPassword')}
                        placeholder="Tối thiểu 6 ký tự"
                        autoComplete="new-password"
                        isInvalid={!!pwErrors.newPassword}
                      />
                      {pwErrors.newPassword && <Form.Control.Feedback type="invalid">{pwErrors.newPassword}</Form.Control.Feedback>}
                      {pwData.newPassword && (
                        <div style={{ marginTop:'.4rem' }}>
                          <ProgressBar now={pwStrength.score*25} variant={pwStrength.variant} style={{ height:4, borderRadius:2 }}/>
                          <small style={{ color:`var(--color-${pwStrength.variant||'success'})`,fontSize:'.72rem' }}>{pwStrength.label}</small>
                        </div>
                      )}
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Xác nhận mật khẩu <span style={{color:'var(--color-danger)'}}>*</span></Form.Label>
                      <Form.Control
                        name="confirmPassword" type="password" value={pwData.confirmPassword}
                        onChange={handlePwChange} onBlur={()=>handlePwBlur('confirmPassword')}
                        placeholder="Nhập lại mật khẩu mới"
                        autoComplete="new-password"
                        isInvalid={!!pwErrors.confirmPassword}
                        isValid={pwTouched.confirmPassword && !pwErrors.confirmPassword && pwData.confirmPassword!==''}
                      />
                      {pwErrors.confirmPassword && <Form.Control.Feedback type="invalid">{pwErrors.confirmPassword}</Form.Control.Feedback>}
                    </Form.Group>
                  </Col>
                </Row>
                <div style={{ marginTop:'1rem',display:'flex',justifyContent:'flex-end' }}>
                  <Button type="submit" variant="primary" disabled={pwLoading}>
                    {pwLoading ? <><Spinner size="sm"/> Đang đổi...</> : <><IcoLock size={14}/> Đổi mật khẩu</>}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default UserProfile;
