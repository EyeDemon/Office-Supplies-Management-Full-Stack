import React, { useState, useEffect } from 'react';
import { Modal, Form, Row, Col, Button, Alert, Spinner } from 'react-bootstrap';
import { userAPI } from '@/services/api';
import { validateField } from './UserManagementHelpers';

const UserFormModal = ({ show, editUser, departments, onClose, onSaved }) => {
  const [formData, setFormData] = useState({
    username: '', email: '', fullName: '', phoneNumber: '', department: '', role: 'USER', password: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched]         = useState({});
  const [formErr, setFormErr]         = useState('');
  const [saving, setSaving]           = useState(false);
  const [showNewDept, setShowNewDept] = useState(false);

  useEffect(() => {
    if (show) {
      if (editUser) {
        const dept = editUser.department || '';
        setFormData({
          username: editUser.username, email: editUser.email || '', fullName: editUser.fullName || '',
          phoneNumber: editUser.phoneNumber || '', department: dept, role: editUser.role || 'USER', password: ''
        });
        setShowNewDept(!!dept && !departments.includes(dept));
      } else {
        setFormData({ username: '', email: '', fullName: '', phoneNumber: '', department: '', role: 'USER', password: '' });
        setShowNewDept(departments.length === 0);
      }
      setFieldErrors({}); setTouched({}); setFormErr('');
    }
  }, [show, editUser, departments]);

  const handleFieldChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (touched[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: validateField(name, value, !!editUser) }));
    }
  };

  const handleBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    setFieldErrors(prev => ({ ...prev, [name]: validateField(name, formData[name], !!editUser) }));
  };

  const handleSave = async () => {
    const fields = editUser
      ? ['fullName', 'email', 'phoneNumber', 'password']
      : ['username', 'fullName', 'email', 'phoneNumber', 'password'];
    
    const allTouched = Object.fromEntries(fields.map(f => [f, true]));
    const allErrors  = Object.fromEntries(fields.map(f => [f, validateField(f, formData[f], !!editUser)]));
    
    setTouched(allTouched);
    setFieldErrors(allErrors);
    
    if (Object.values(allErrors).some(e => e)) return;

    setSaving(true);
    try {
      if (editUser) {
        const payload = { 
          email: formData.email, fullName: formData.fullName,
          phoneNumber: formData.phoneNumber, department: formData.department, role: formData.role 
        };
        if (formData.password) payload.password = formData.password;
        await userAPI.updateUser(editUser.id, payload);
      } else {
        await userAPI.createUser(formData);
      }
      onSaved(editUser ? `Đã cập nhật "${editUser.username}"` : `Đã tạo "${formData.username}"`);
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Lưu thất bại');
    } finally { setSaving(false); }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{editUser ? `Chỉnh sửa: ${editUser.username}` : 'Thêm người dùng mới'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {formErr && <Alert variant="danger" className="py-2">{formErr}</Alert>}
        <Row>
          {!editUser && (
            <Col md={12}>
              <Form.Group className="mb-3">
                <Form.Label>Username *</Form.Label>
                <Form.Control
                  value={formData.username}
                  onChange={e => handleFieldChange('username', e.target.value)}
                  onBlur={() => handleBlur('username')}
                  isInvalid={touched.username && !!fieldErrors.username}
                  placeholder="Nhập username" autoFocus />
                <Form.Control.Feedback type="invalid">{fieldErrors.username}</Form.Control.Feedback>
              </Form.Group>
            </Col>
          )}
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Họ và tên *</Form.Label>
              <Form.Control
                value={formData.fullName}
                onChange={e => handleFieldChange('fullName', e.target.value)}
                onBlur={() => handleBlur('fullName')}
                isInvalid={touched.fullName && !!fieldErrors.fullName}
                placeholder="Nguyễn Văn A" />
              <Form.Control.Feedback type="invalid">{fieldErrors.fullName}</Form.Control.Feedback>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Email *</Form.Label>
              <Form.Control
                type="email" value={formData.email}
                onChange={e => handleFieldChange('email', e.target.value)}
                onBlur={() => handleBlur('email')}
                isInvalid={touched.email && !!fieldErrors.email}
                placeholder="user@email.com" />
              <Form.Control.Feedback type="invalid">{fieldErrors.email}</Form.Control.Feedback>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Số điện thoại</Form.Label>
              <Form.Control
                value={formData.phoneNumber}
                onChange={e => handleFieldChange('phoneNumber', e.target.value)}
                onBlur={() => handleBlur('phoneNumber')}
                isInvalid={touched.phoneNumber && !!fieldErrors.phoneNumber}
                placeholder="0912345678" />
              <Form.Control.Feedback type="invalid">{fieldErrors.phoneNumber}</Form.Control.Feedback>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Phòng ban</Form.Label>
              <Form.Select
                value={showNewDept ? '__new__' : (formData.department || '')}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setShowNewDept(true);
                    setFormData({ ...formData, department: '' });
                  } else {
                    setShowNewDept(false);
                    setFormData({ ...formData, department: e.target.value });
                  }
                }}>
                <option value="">-- Chọn phòng ban --</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="__new__">➕ Nhập phòng ban mới...</option>
              </Form.Select>
              {(showNewDept || departments.length === 0) && (
                <Form.Control
                  className="mt-1"
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  placeholder="Nhập tên phòng ban mới..."
                />
              )}
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Vai trò</Form.Label>
              <Form.Select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                <option value="USER">Nhân viên</option>
                <option value="WAREHOUSE">Nhân viên kho</option>
                <option value="MANAGER">Quản lý</option>
                <option value="ADMIN">Quản trị viên</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group className="mb-1">
              <Form.Label>{editUser ? 'Mật khẩu mới (để trống = giữ nguyên)' : 'Mật khẩu *'}</Form.Label>
              <Form.Control
                type="password" value={formData.password}
                onChange={e => handleFieldChange('password', e.target.value)}
                onBlur={() => handleBlur('password')}
                isInvalid={touched.password && !!fieldErrors.password}
                placeholder={editUser ? 'Để trống nếu không muốn đổi' : 'Tối thiểu 6 ký tự'} />
              <Form.Control.Feedback type="invalid">{fieldErrors.password}</Form.Control.Feedback>
            </Form.Group>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Hủy</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? <><Spinner size="sm" className="me-1" /> Đang lưu...</> : (editUser ? 'Lưu thay đổi' : 'Tạo người dùng')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default UserFormModal;
