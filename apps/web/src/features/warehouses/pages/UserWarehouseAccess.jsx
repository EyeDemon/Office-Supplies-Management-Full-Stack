// pages/UserWarehouseAccess.jsx — BUG 7: Data-level RBAC UI
// Admin gán / thu hồi quyền truy cập kho cho từng user
import { useState, useEffect, useCallback } from 'react';
import { userAPI, userWarehouseAPI, warehouseAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';

const ROLE_LABEL = { ADMIN: '🔴 Admin', MANAGER: '🟡 Manager', USER: '🟢 User' };
const ROLE_COLOR = { ADMIN: '#ef4444', MANAGER: '#f59e0b', USER: '#10b981' };

export default function UserWarehouseAccess() {
  const { user: me } = useAuth();
  if (me?.role !== 'ADMIN') {
    return (
      <div className="page-container">
        <div className="empty-state">🔒 Chỉ Admin mới có thể quản lý phân quyền kho</div>
      </div>
    );
  }

  const [users, setUsers]               = useState([]);
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail]     = useState(null);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [search, setSearch]             = useState('');
  const [alert, setAlert]               = useState(null);
  // Track pending checkbox changes
  const [pendingIds, setPendingIds]     = useState(new Set());

  const showMsg = (msg, type = 'success') => {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userAPI.getAllUsers({ page: 0, size: 100, search });
      setUsers(res.data.data.users || []);
    } catch { showMsg('Không thể tải danh sách user', 'error'); }
    finally { setLoading(false); }
  }, [search]);

  const loadAllWarehouses = useCallback(async () => {
    try {
      const res = await warehouseAPI.getAllList();
      setAllWarehouses(res.data.data || []);
    } catch {}
  }, []);

  useEffect(() => { loadUsers(); loadAllWarehouses(); }, [loadUsers, loadAllWarehouses]);

  const selectUser = async (u) => {
    setSelectedUser(u);
    setUserDetail(null);
    setPendingIds(new Set());
    try {
      const res = await userWarehouseAPI.getByUser(u.id);
      const detail = res.data.data;
      setUserDetail(detail);
      // Initialize pending ids from current assigned
      const ids = new Set(detail.assignedWarehouses.map(w => w.id));
      setPendingIds(ids);
    } catch { showMsg('Không thể tải quyền kho của user', 'error'); }
  };

  const toggleWarehouse = (whId) => {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (next.has(whId)) next.delete(whId);
      else next.add(whId);
      return next;
    });
  };

  const saveAssignments = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await userWarehouseAPI.bulkAssign(selectedUser.id, [...pendingIds]);
      showMsg(`Đã cập nhật quyền kho cho "${selectedUser.fullName}"`);
      // Reload detail
      const res = await userWarehouseAPI.getByUser(selectedUser.id);
      setUserDetail(res.data.data);
    } catch (e) {
      showMsg(e.response?.data?.message || 'Lưu thất bại', 'error');
    } finally { setSaving(false); }
  };

  const assignAllWarehouses = () => {
    const allIds = allWarehouses.map(w => w.id);
    setPendingIds(new Set(allIds));
  };

  const revokeAllWarehouses = () => {
    setPendingIds(new Set());
  };

  const hasChanges = userDetail
    ? JSON.stringify([...pendingIds].sort()) !== JSON.stringify(userDetail.assignedWarehouses.map(w => w.id).sort())
    : false;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔐 Phân quyền Kho hàng</h1>
          <p className="page-subtitle">Gán / thu hồi quyền truy cập kho cho từng user (Data-level RBAC)</p>
        </div>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type === 'error' ? 'danger' : 'success'}`}>{alert.msg}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Left panel: user list ── */}
        <div className="card">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
            <input
              className="form-control" placeholder="Tìm user..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {loading ? (
              <div className="text-center py-4">⏳ Đang tải...</div>
            ) : users.length === 0 ? (
              <div className="empty-state">Không tìm thấy user</div>
            ) : users.map(u => (
              <div
                key={u.id}
                className={`user-item ${selectedUser?.id === u.id ? 'active' : ''}`}
                onClick={() => selectUser(u)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  background: selectedUser?.id === u.id ? '#eff6ff' : 'white',
                  borderLeft: selectedUser?.id === u.id ? '3px solid #3b82f6' : '3px solid transparent',
                }}
              >
                <div style={{ fontWeight: 600 }}>{u.fullName}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>@{u.username}</div>
                <span style={{
                  display: 'inline-block', marginTop: 4,
                  fontSize: 11, fontWeight: 600,
                  color: ROLE_COLOR[u.role] || '#6b7280',
                }}>{ROLE_LABEL[u.role] || u.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel: warehouse assignment ── */}
        <div>
          {!selectedUser ? (
            <div className="card empty-state">
              ← Chọn một user để quản lý quyền kho
            </div>
          ) : (
            <div className="card">
              {/* User info header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{selectedUser.fullName}</h3>
                    <div style={{ color: '#6b7280', fontSize: 14 }}>
                      @{selectedUser.username} · {selectedUser.department || 'Chưa có phòng ban'}
                    </div>
                    <span style={{ color: ROLE_COLOR[selectedUser.role], fontWeight: 600, fontSize: 13 }}>
                      {ROLE_LABEL[selectedUser.role]}
                    </span>
                    {selectedUser.role === 'ADMIN' && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
                        (Admin thấy tất cả kho — không cần gán)
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-outline-secondary" onClick={assignAllWarehouses}>
                      ✅ Tất cả
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={revokeAllWarehouses}>
                      ❌ Bỏ hết
                    </button>
                  </div>
                </div>
              </div>

              {/* Warehouse checkboxes */}
              <div style={{ padding: '20px' }}>
                {!userDetail ? (
                  <div className="text-center py-4">⏳ Đang tải quyền kho...</div>
                ) : allWarehouses.length === 0 ? (
                  <div className="empty-state">Chưa có kho nào trong hệ thống</div>
                ) : (
                  <>
                    <div style={{ marginBottom: 16, color: '#6b7280', fontSize: 14 }}>
                      Đã chọn <strong>{pendingIds.size}</strong> / {allWarehouses.length} kho
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                      {allWarehouses.map(wh => {
                        const checked = pendingIds.has(wh.id);
                        return (
                          <label
                            key={wh.id}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 12,
                              padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                              border: `2px solid ${checked ? '#3b82f6' : '#e5e7eb'}`,
                              background: checked ? '#eff6ff' : 'white',
                              transition: 'all 0.15s',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleWarehouse(wh.id)}
                              style={{ marginTop: 2, width: 18, height: 18 }}
                            />
                            <div>
                              <div style={{ fontWeight: 600, color: checked ? '#1d4ed8' : '#111827' }}>
                                {wh.name}
                              </div>
                              <div style={{ fontSize: 12, color: '#6b7280' }}>
                                {wh.code} {wh.location ? `· ${wh.location}` : ''}
                              </div>
                              {!wh.isActive && (
                                <span style={{ fontSize: 11, color: '#ef4444' }}>⚠️ Không hoạt động</span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* Save button */}
                    <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                      {hasChanges && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => setPendingIds(new Set(userDetail.assignedWarehouses.map(w => w.id)))}
                        >
                          ↩ Hoàn tác
                        </button>
                      )}
                      <button
                        className="btn btn-primary"
                        onClick={saveAssignments}
                        disabled={saving || !hasChanges}
                      >
                        {saving ? '⏳ Đang lưu...' : hasChanges ? '💾 Lưu phân quyền' : '✓ Đã cập nhật'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
