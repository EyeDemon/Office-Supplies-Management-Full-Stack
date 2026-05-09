import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Alert, Card } from 'react-bootstrap';
import { departmentAPI } from '@/services/api';
import { useConfirm } from '@/components/common/ConfirmModal';

const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const { confirm, ConfirmDialog } = useConfirm();

  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaData, setQuotaData] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, limit: '' });
  const [quotaHistory, setQuotaHistory] = useState([]);

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await departmentAPI.getAll();
      setDepartments(res.data.data || []);
    } catch (err) {
      setMsg({ type: 'danger', text: 'Không thể tải danh sách phòng ban' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const handleShowModal = (item = null) => {
    if (item) {
      setEditItem(item);
      setFormData({ name: item.name, description: item.description || '' });
    } else {
      setEditItem(null);
      setFormData({ name: '', description: '' });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editItem) {
        await departmentAPI.update(editItem.id, formData);
        setMsg({ type: 'success', text: `Đã cập nhật phòng ban "${formData.name}"` });
      } else {
        await departmentAPI.create(formData);
        setMsg({ type: 'success', text: `Đã tạo phòng ban "${formData.name}"` });
      }
      setShowModal(false);
      loadDepartments();
    } catch (err) {
      setMsg({ type: 'danger', text: err.response?.data?.message || 'Lưu thất bại' });
    }
  };

  const handleDelete = async (item) => {
    if (await confirm({ 
      title: 'Xác nhận xóa', 
      message: `Xóa phòng ban "${item.name}"? Hành động này có thể ảnh hưởng đến các người dùng thuộc phòng ban này.`, 
      variant: 'danger' 
    })) {
      try {
        await departmentAPI.delete(item.id);
        setMsg({ type: 'success', text: `Đã xóa phòng ban "${item.name}"` });
        loadDepartments();
      } catch (err) {
        setMsg({ type: 'danger', text: err.response?.data?.message || 'Xóa thất bại' });
      }
    }
  };

  const handleShowQuota = async (item) => {
    setEditItem(item);
    setQuotaData({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, limit: '' });
    try {
      const res = await departmentAPI.getQuotas(item.id);
      setQuotaHistory(res.data.data || []);
    } catch (err) {
      setMsg({ type: 'danger', text: 'Không thể tải hạn mức ngân sách' });
    }
    setShowQuotaModal(true);
  };

  const handleSaveQuota = async (e) => {
    e.preventDefault();
    try {
      await departmentAPI.setQuota(editItem.id, {
        year: parseInt(quotaData.year),
        month: parseInt(quotaData.month),
        limit: parseFloat(quotaData.limit)
      });
      setMsg({ type: 'success', text: `Đã cập nhật hạn mức cho phòng ${editItem.name}` });
      setShowQuotaModal(false);
    } catch (err) {
      setMsg({ type: 'danger', text: err.response?.data?.message || 'Cập nhật hạn mức thất bại' });
    }
  };

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Quản lý phòng ban</h2>
        <Button variant="primary" onClick={() => handleShowModal()}>
          + Thêm phòng ban
        </Button>
      </div>

      {msg.text && (
        <Alert variant={msg.type} dismissible onClose={() => setMsg({ type: '', text: '' })}>
          {msg.text}
        </Alert>
      )}

      <Card className="shadow-sm">
        <Table hover responsive className="mb-0">
          <thead className="bg-light">
            <tr>
              <th>ID</th>
              <th>Tên phòng ban</th>
              <th>Mô tả</th>
              <th className="text-end">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr key="loading"><td colSpan="4" className="text-center py-4">Đang tải...</td></tr>
            ) : departments.length === 0 ? (
              <tr key="empty"><td colSpan="4" className="text-center py-4">Chưa có phòng ban nào</td></tr>
            ) : (
              departments.map(dept => (
                <tr key={dept.id}>
                  <td>{dept.id}</td>
                  <td><strong>{dept.name}</strong></td>
                  <td>{dept.description}</td>
                  <td className="text-end">
                    <Button variant="outline-info" size="sm" className="me-2" onClick={() => handleShowQuota(dept)}>
                      Ngân sách
                    </Button>
                    <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handleShowModal(dept)}>
                      Sửa
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => handleDelete(dept)}>
                      Xóa
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      {/* Modal Phòng ban */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editItem ? 'Chỉnh sửa phòng ban' : 'Thêm phòng ban mới'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSave}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Tên phòng ban <span className="text-danger">*</span></Form.Label>
              <Form.Control
                required
                type="text"
                placeholder="VD: Phòng Hành chính, Kho trung tâm..."
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mô tả</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Mô tả chức năng hoặc vị trí..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button variant="primary" type="submit">Lưu lại</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modal Quota */}
      <Modal show={showQuotaModal} onHide={() => setShowQuotaModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Quản lý hạn mức: {editItem?.name}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSaveQuota}>
          <Modal.Body>
            <div className="row g-3 mb-4">
              <div className="col-md-3">
                <Form.Label>Năm</Form.Label>
                <Form.Control type="number" value={quotaData.year} onChange={e => setQuotaData({...quotaData, year: e.target.value})} />
              </div>
              <div className="col-md-3">
                <Form.Label>Tháng</Form.Label>
                <Form.Control type="number" min="1" max="12" value={quotaData.month} onChange={e => setQuotaData({...quotaData, month: e.target.value})} />
              </div>
              <div className="col-md-4">
                <Form.Label>Hạn mức (VNĐ)</Form.Label>
                <Form.Control type="number" step="1000" required value={quotaData.limit} onChange={e => setQuotaData({...quotaData, limit: e.target.value})} />
              </div>
              <div className="col-md-2 d-flex align-items-end">
                <Button variant="success" type="submit" className="w-100">Set</Button>
              </div>
            </div>

            <h6>Lịch sử hạn mức</h6>
            <Table size="sm" bordered hover>
              <thead className="table-light">
                <tr>
                  <th>Tháng/Năm</th>
                  <th>Hạn mức</th>
                  <th>Đã dùng</th>
                  <th>Còn lại</th>
                </tr>
              </thead>
              <tbody>
                {quotaHistory.length === 0 ? (
                  <tr><td colSpan="4" className="text-center text-muted">Chưa có dữ liệu</td></tr>
                ) : quotaHistory.map((q, idx) => (
                  <tr key={`${q.year}-${q.month}-${idx}`}>
                    <td>{q.month}/{q.year}</td>
                    <td>{Number(q.monthly_limit).toLocaleString()}</td>
                    <td className="text-danger">{Number(q.spent_amount).toLocaleString()}</td>
                    <td className="text-success font-weight-bold">{(q.monthly_limit - q.spent_amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Modal.Body>
        </Form>
      </Modal>

      <ConfirmDialog />
    </div>
  );
};

export default Departments;
