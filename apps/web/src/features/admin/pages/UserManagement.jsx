import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Alert, Button, Tabs, Tab } from 'react-bootstrap';
import { useConfirm } from '@/components/common/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { userAPI } from '@/services/api';

// Refactored components
import UserFormModal from '../components/UserFormModal';
import ActiveUserTab from '../components/ActiveUserTab';
import DeletedUserTab from '../components/DeletedUserTab';

const UserManagement = () => {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();

  // Active users list
  const [users,      setUsers]      = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [page,       setPage]       = useState(0);
  const [size,       setSize]       = useState(20);
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [searchInput,setSearchInput]= useState('');

  // Deleted users
  const [deletedUsers,  setDeletedUsers]  = useState([]);
  const [deletedLoading,setDeletedLoading]= useState(false);
  const [activeTab,     setActiveTab]     = useState('active');

  // Modal state
  const [showModal,    setShowModal]    = useState(false);
  const [editUser,     setEditUser]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [msg,          setMsg]          = useState({ type: '', text: '' });
  const [departments,  setDepartments]  = useState([]);

  useEffect(() => {
    userAPI.getDepartments().then(r => setDepartments(r.data?.data || [])).catch(() => {});
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userAPI.getAllUsers({ page, size, search, role: roleFilter, department: deptFilter });
      const data = res.data.data;
      setUsers(data.users || []);
      setTotalCount(data.totalCount || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      setMsg({ type: 'danger', text: err.response?.data?.message || 'Không thể tải danh sách người dùng' });
    } finally { setLoading(false); }
  }, [page, size, search, roleFilter, deptFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadDeleted = useCallback(async () => {
    setDeletedLoading(true);
    try {
      const res = await userAPI.getDeletedUsers();
      setDeletedUsers(res.data.data || []);
    } catch {
      setMsg({ type: 'danger', text: 'Không thể tải danh sách người dùng đã xóa' });
    } finally { setDeletedLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'deleted') loadDeleted();
  }, [activeTab, loadDeleted]);

  const handleRestore = async (u) => {
    if (!await confirmDlg({ title: 'Khôi phục tài khoản', message: `Khôi phục tài khoản "${u.username}"?`, variant: 'warning' })) return;
    try {
      await userAPI.restoreUser(u.id);
      setMsg({ type: 'success', text: `Đã khôi phục "${u.username}" thành công` });
      loadDeleted(); loadUsers();
    } catch (err) { setMsg({ type: 'danger', text: err.response?.data?.message || 'Khôi phục thất bại' }); }
  };

  const handleSaveSuccess = (text) => {
    setMsg({ type: 'success', text });
    setShowModal(false); loadUsers();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await userAPI.deleteUser(deleteTarget.id);
      setMsg({ type: 'success', text: `Đã xóa người dùng "${deleteTarget.username}"` });
      setDeleteTarget(null);
      if (users.length === 1 && page > 0) setPage(p => p - 1);
      else loadUsers();
    } catch (err) { setMsg({ type: 'danger', text: err.response?.data?.message || 'Xóa thất bại' }); setDeleteTarget(null); }
  };

  return (
    <div className="p-3">
      {msg.text && (
        <Alert variant={msg.type} dismissible onClose={() => setMsg({ type: '', text: '' })}>
          {msg.text}
        </Alert>
      )}

      <Tabs activeKey={activeTab} onSelect={k => setActiveTab(k)} className="mb-3">
        <Tab eventKey="active" title={`Đang hoạt động (${totalCount})`}>
          <ActiveUserTab
            users={users} totalCount={totalCount} totalPages={totalPages} loading={loading}
            page={page} size={size} searchInput={searchInput} setSearchInput={setSearchInput}
            roleFilter={roleFilter} setRoleFilter={setRoleFilter}
            deptFilter={deptFilter} setDeptFilter={setDeptFilter}
            setSize={setSize} setPage={setPage}
            onAdd={() => { setEditUser(null); setShowModal(true); }}
            onEdit={(u) => { setEditUser(u); setShowModal(true); }}
            onDelete={setDeleteTarget}
            departments={departments}
          />
        </Tab>
        <Tab eventKey="deleted" title={`Đã xóa (${deletedUsers.length})`}>
          <DeletedUserTab users={deletedUsers} loading={deletedLoading} onRestore={handleRestore} />
        </Tab>
      </Tabs>

      <UserFormModal
        show={showModal} editUser={editUser} departments={departments}
        onClose={() => setShowModal(false)} onSaved={handleSaveSuccess}
      />

      <Modal show={!!deleteTarget} onHide={() => setDeleteTarget(null)} centered size="sm">
        <Modal.Header closeButton><Modal.Title>Xác nhận xóa</Modal.Title></Modal.Header>
        <Modal.Body>Xóa người dùng <strong>{deleteTarget?.username}</strong>?<br /><small className="text-muted">Hành động này dùng soft-delete — có thể khôi phục từ tab "Đã xóa".</small></Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>Hủy</Button>
          <Button variant="danger" size="sm" onClick={handleDelete}>Xóa</Button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog />
    </div>
  );
};

export default UserManagement;