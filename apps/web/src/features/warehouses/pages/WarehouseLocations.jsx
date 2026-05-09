// WarehouseLocations.jsx — L-07 FIX
// CRUD UI cho warehouse_locations (Spec I.3)
// Roles: WAREHOUSE xem, MANAGER/ADMIN tạo/sửa/vô hiệu hoá
import { useConfirm } from '@/components/common/ConfirmModal';
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Form, Badge, Table, Button, InputGroup } from 'react-bootstrap';
import { warehouseLocationAPI, warehouseAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import AlertMessage   from '@/components/common/AlertMessage.jsx';
import Modal          from '@/components/common/Modal.jsx';
import { SkeletonTable } from '@/components/common/SkeletonRow.jsx'; // [FE-03]
import EmptyState from '@/components/common/EmptyState.jsx'; // [FE-06]

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

export default function WarehouseLocations() {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { isManagerOrAdmin } = useAuth();

  const [locations,   setLocations]   = useState([]);
  const [warehouses,  setWarehouses]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filterWh,    setFilterWh]    = useState('');
  const [showInactive,setShowInactive]= useState(false);
  const [alert,       setAlert]       = useState(null);
  const [modal,       setModal]       = useState(null); // { mode:'create'|'edit', data }
  const [saving,      setSaving]      = useState(false);
  const [form,        setForm]        = useState({ warehouseId:'', code:'', name:'', description:'', capacity:'' });

  // Fetch
  const load = useCallback(() => {
    setLoading(true);
    warehouseLocationAPI.getAll(filterWh || null, !showInactive)
      .then(r => setLocations(r.data.data || []))
      .catch(() => setAlert({ type:'danger', message:'Không thể tải danh sách vị trí kho' }))
      .finally(() => setLoading(false));
  }, [filterWh, showInactive]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    warehouseAPI.getAll({ page:0, size:100 })
      .then(r => setWarehouses(r.data.data?.items || []))
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setForm({ warehouseId: filterWh || '', code:'', name:'', description:'', capacity:'' });
    setModal({ mode:'create' });
  };
  const openEdit = (loc) => {
    setForm({ warehouseId: loc.warehouseId, code: loc.code, name: loc.name || '', description: loc.description || '', capacity: loc.capacity || '' });
    setModal({ mode:'edit', data: loc });
  };

  const handleSave = async () => {
    if (!form.warehouseId || !form.code.trim())
      return setAlert({ type:'warning', message:'Vui lòng chọn kho và nhập mã vị trí' });
    setSaving(true);
    try {
      const payload = {
        warehouseId: parseInt(form.warehouseId),
        code: form.code.trim(),
        name: form.name.trim() || null,
        description: form.description.trim() || null,
        capacity: form.capacity ? parseInt(form.capacity) : null,
      };
      if (modal.mode === 'create') {
        await warehouseLocationAPI.create(payload);
        setAlert({ type:'success', message:'Tạo vị trí thành công' });
      } else {
        await warehouseLocationAPI.update(modal.data.id, payload);
        setAlert({ type:'success', message:'Cập nhật vị trí thành công' });
      }
      setModal(null);
      load();
    } catch (e) {
      setAlert({ type:'danger', message: e.response?.data?.message || 'Lỗi khi lưu' });
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (loc) => {
    if (!await confirmDlg({ title:'Vô hiệu hoá vị trí', message:`Vô hiệu hoá vị trí "${loc.code}"?`, variant:'warning' })) return;
    try {
      await warehouseLocationAPI.deactivate(loc.id);
      setAlert({ type:'success', message:`Đã vô hiệu hoá vị trí ${loc.code}` });
      load();
    } catch (e) {
      setAlert({ type:'danger', message: e.response?.data?.message || 'Lỗi khi vô hiệu hoá' });
    }
  };

  return (
    <div className="p-3">
      <ConfirmDialog />
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h5 className="mb-0 fw-bold">📍 Vị trí kho</h5>
          <small className="text-muted">Quản lý vị trí / zone trong từng kho (Spec I.3)</small>
        </div>
        {isManagerOrAdmin && (
          <Button variant="primary" size="sm" onClick={openCreate}>+ Thêm vị trí</Button>
        )}
      </div>

      {alert && <AlertMessage type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      {/* Filters */}
      <Row className="g-2 mb-3">
        <Col xs={12} md={5}>
          <Form.Select size="sm" value={filterWh} onChange={e => setFilterWh(e.target.value)}>
            <option value="">— Tất cả kho —</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Form.Select>
        </Col>
        <Col xs="auto">
          <Form.Check label="Hiện vô hiệu hoá" checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)} />
        </Col>
      </Row>

      {/* Table */}
      {loading ? (
        <SkeletonTable headers={['Kho','Mã vị trí','Tên','Sức chứa','Trạng thái','Tạo lúc','']} rows={5} />
      ) : (
        locations.length === 0 ? (
          <EmptyState
            icon="warehouse"
            message={`Chưa có vị trí kho nào${filterWh ? ' cho kho này' : ''}`}
            sub="Tạo vị trí để quản lý chỗ lưu hàng trong kho"
            cta={isManagerOrAdmin ? '+ Tạo vị trí đầu tiên' : undefined}
            onCta={isManagerOrAdmin ? openCreate : undefined}
          />
        ) : (
          <div className="table-responsive">
            <Table hover size="sm" className="align-middle">
              <thead className="table-light">
                <tr>
                  <th>Kho</th>
                  <th>Mã vị trí</th>
                  <th>Tên</th>
                  <th className="text-center">Sức chứa</th>
                  <th className="text-center">Trạng thái</th>
                  <th className="text-end">Tạo lúc</th>
                  {isManagerOrAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id} className={!loc.isActive ? 'table-secondary' : ''}>
                    <td><small className="text-muted">{loc.warehouseName}</small></td>
                    <td><code className="fw-bold">{loc.code}</code></td>
                    <td>{loc.name || <span className="text-muted">—</span>}</td>
                    <td className="text-center">{loc.capacity ? loc.capacity.toLocaleString() : <span className="text-muted">—</span>}</td>
                    <td className="text-center">
                      <Badge bg={loc.isActive ? 'success' : 'secondary'} pill>
                        {loc.isActive ? 'Hoạt động' : 'Vô hiệu'}
                      </Badge>
                    </td>
                    <td className="text-end"><small className="text-muted">{fmtDate(loc.createdAt)}</small></td>
                    {isManagerOrAdmin && (
                      <td className="text-end">
                        <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => openEdit(loc)}>Sửa</Button>
                        {loc.isActive && (
                          <Button size="sm" variant="outline-danger" onClick={() => handleDeactivate(loc)}>Vô hiệu</Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )
      )}

      {/* Create / Edit Modal */}
      {modal && (
        <Modal title={modal.mode === 'create' ? 'Thêm vị trí kho' : 'Sửa vị trí kho'}
          onClose={() => setModal(null)}
          footer={
            <>
              <Button variant="outline-secondary" onClick={() => setModal(null)}>Huỷ</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu…' : 'Lưu'}
              </Button>
            </>
          }
        >
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Kho <span className="text-danger">*</span></Form.Label>
              <Form.Select value={form.warehouseId}
                onChange={e => setForm(f => ({...f, warehouseId: e.target.value}))}
                disabled={modal.mode === 'edit'}>
                <option value="">— Chọn kho —</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mã vị trí <span className="text-danger">*</span></Form.Label>
              <Form.Control value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value}))}
                placeholder="VD: A1, B2-3, RACK-01" disabled={modal.mode === 'edit'} />
              <Form.Text className="text-muted">Unique trong kho, không thể sửa sau khi tạo</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Tên / Mô tả ngắn</Form.Label>
              <Form.Control value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                placeholder="VD: Khu A - Hàng 1" />
            </Form.Group>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Sức chứa tối đa</Form.Label>
                  <Form.Control type="number" min="0" value={form.capacity}
                    onChange={e => setForm(f => ({...f, capacity: e.target.value}))}
                    placeholder="Để trống nếu không giới hạn" />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group>
              <Form.Label>Ghi chú</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.description}
                onChange={e => setForm(f => ({...f, description: e.target.value}))} />
            </Form.Group>
          </Form>
        </Modal>
      )}
    </div>
  );
}