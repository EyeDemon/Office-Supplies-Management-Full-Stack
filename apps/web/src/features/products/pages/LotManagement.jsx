// pages/LotManagement.jsx — BUG 3: Lot/Batch Tracking UI
import { useState, useEffect, useCallback } from 'react';
import EmptyState from '@/components/common/EmptyState.jsx'; // [FE-06]
import { lotAPI, productAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useConfirm } from '@/components/common/ConfirmModal'; // [N22-FIX-2]

const FMT = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
const TODAY = new Date();

function expiryBadge(lot) {
  if (!lot.expiryDate) return <span className="badge badge-secondary">Không HSD</span>;
  const days = lot.daysToExpiry;
  if (lot.isExpired) return <span className="badge badge-danger">Hết hạn ({Math.abs(days)}ng)</span>;
  if (days <= 7)     return <span className="badge badge-danger">Sắp hết hạn ({days}ng)</span>;
  if (days <= 30)    return <span className="badge badge-warning">Còn {days} ngày</span>;
  return <span className="badge badge-success">Còn {days} ngày</span>;
}

export default function LotManagement() {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { user } = useAuth();
  const isManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [lots, setLots]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all'); // all | expiring | expired
  const [showForm, setShowForm] = useState(false);
  const [editLot, setEditLot]   = useState(null);
  const [products, setProducts] = useState([]);
  const [alert, setAlert]       = useState(null);
  const [expiringCount, setExpiringCount] = useState(0);

  const SIZE = 20;

  const showMsg = (msg, type = 'success') => {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, size: SIZE, search };
      if (filter === 'expiring') params.expiringSoon = true;
      if (filter === 'expired')  params.expired = true;
      const res = await lotAPI.getAll(params);
      setLots(res.data.data.items || []);
      setTotal(res.data.data.totalCount || 0);
    } catch {
      showMsg('Không thể tải dữ liệu lô hàng', 'error');
    } finally { setLoading(false); }
  }, [page, search, filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    lotAPI.getExpiring(30).then(r => setExpiringCount((r.data.data || []).length)).catch(() => {});
  }, []);

  useEffect(() => {
    productAPI.getAll({ size: 200 }).then(r => setProducts(r.data.data?.items || [])).catch(() => {});
  }, []);

  const handleDelete = async (lot) => {
    if (!await confirmDlg({ title: 'Xóa lô hàng', message: `Xóa lô "${lot.batchCode}"?`, variant: 'danger' })) return;
    try {
      await lotAPI.delete(lot.id);
      showMsg('Đã xóa lô hàng');
      load();
    } catch (e) {
      showMsg(e.response?.data?.message || 'Xóa thất bại', 'error');
    }
  };

  const totalPages = Math.ceil(total / SIZE);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🏷️ Quản lý Lô hàng</h1>
          <p className="page-subtitle">Theo dõi lô hàng (batch/lot) theo sản phẩm và hạn sử dụng</p>
        </div>
        {isManager && (
          <button className="btn btn-primary" onClick={() => { setEditLot(null); setShowForm(true); }}>
            + Thêm lô hàng
          </button>
        )}
      </div>

      {/* Expiry alerts */}
      {expiringCount > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚠️ Có <strong>{expiringCount}</strong> lô hàng sắp hết hạn trong 30 ngày.
          <button className="btn btn-sm btn-warning" onClick={() => setFilter('expiring')}>Xem ngay</button>
        </div>
      )}

      {alert && (
        <div className={`alert alert-${alert.type === 'error' ? 'danger' : 'success'}`}>{alert.msg}</div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <input
          className="form-control" style={{ maxWidth: 280 }}
          placeholder="Tìm mã lô, sản phẩm..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
        />
        <div className="btn-group">
          {[['all','Tất cả'], ['expiring','Sắp hết hạn 🟡'], ['expired','Đã hết hạn 🔴']].map(([v, label]) => (
            <button
              key={v}
              className={`btn ${filter === v ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => { setFilter(v); setPage(0); }}
            >{label}</button>
          ))}
        </div>
        <span className="text-muted">{total} lô</span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Mã lô</th>
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th>Số lượng nhập</th>
                <th>Ngày hết hạn</th>
                <th>Trạng thái HSD</th>
                <th>Ghi chú</th>
                {isManager && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-4">
                  <div className="skeleton-row" /><div className="skeleton-row" /><div className="skeleton-row" />
                </td></tr>
              ) : lots.length === 0 ? (
                <tr><td colSpan={8} className="p-0">
                  <EmptyState
                    icon="inventory"
                    message={`📦 Chưa có lô hàng nào${filter !== 'all' ? ' phù hợp bộ lọc' : ''}`}
                    cta={isManager && filter === 'all' ? '+ Tạo lô đầu tiên' : undefined}
                    onCta={isManager && filter === 'all' ? () => setShowForm(true) : undefined}
                  />
                </td></tr>
              ) : lots.map(lot => (
                <tr key={lot.id} className={lot.isExpired ? 'row-danger' : lot.daysToExpiry != null && lot.daysToExpiry <= 7 ? 'row-warning' : ''}>
                  <td><strong>{lot.batchCode}</strong></td>
                  <td>{lot.productName || '—'}</td>
                  <td><code>{lot.productSku || '—'}</code></td>
                  <td>{lot.quantityIn.toLocaleString('vi-VN')}</td>
                  <td>{FMT(lot.expiryDate)}</td>
                  <td>{expiryBadge(lot)}</td>
                  <td className="text-muted small">{lot.note || '—'}</td>
                  {isManager && (
                    <td>
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => { setEditLot(lot); setShowForm(true); }}>✏️</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(lot)}>🗑️</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn btn-sm btn-outline-secondary">← Trước</button>
            <span>Trang {page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn btn-sm btn-outline-secondary">Sau →</button>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <LotForm
          lot={editLot}
          products={products}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); showMsg(editLot ? 'Cập nhật lô thành công' : 'Tạo lô thành công'); }}
        />
      )}
      {/* [N22-FIX-2] Render ConfirmDialog — thiếu → await confirmDlg() never resolves */}
      <ConfirmDialog />
    </div>
  );
}

function LotForm({ lot, products, onClose, onSaved }) {
  const isEdit = Boolean(lot);
  const [form, setForm] = useState({
    productId:   lot?.productId || '',
    batchCode:   lot?.batchCode || '',
    expiryDate:  lot?.expiryDate?.split('T')[0] || '',
    quantityIn:  lot?.quantityIn ?? 0,
    note:        lot?.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.productId) return setError('Vui lòng chọn sản phẩm');
    if (!form.batchCode.trim()) return setError('Mã lô là bắt buộc');
    setSaving(true);
    try {
      if (isEdit) {
        await lotAPI.update(lot.id, { expiryDate: form.expiryDate || null, note: form.note });
      } else {
        await lotAPI.create({
          productId:  Number(form.productId),
          batchCode:  form.batchCode.trim(),
          expiryDate: form.expiryDate || null,
          quantityIn: Number(form.quantityIn) || 0,
          note:       form.note || null,
        });
      }
      onSaved();
    } catch (e) {
      setError(e.response?.data?.message || 'Có lỗi xảy ra');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>{isEdit ? '✏️ Chỉnh sửa lô hàng' : '+ Thêm lô hàng mới'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-group">
            <label>Sản phẩm <span className="text-danger">*</span></label>
            <select
              className="form-control" value={form.productId}
              onChange={e => set('productId', e.target.value)}
              disabled={isEdit}
              required
            >
              <option value="">— Chọn sản phẩm —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Mã lô (batch code) <span className="text-danger">*</span></label>
            <input
              className="form-control" type="text"
              placeholder="VD: LOT-2024-001, BATCH-A..."
              value={form.batchCode}
              onChange={e => set('batchCode', e.target.value)}
              disabled={isEdit}
              required
            />
            {isEdit && <small className="text-muted">Không thể thay đổi mã lô sau khi tạo</small>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Ngày hết hạn</label>
              <input
                className="form-control" type="date"
                value={form.expiryDate}
                onChange={e => set('expiryDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <small className="text-muted">Để trống nếu không có hạn sử dụng</small>
            </div>

            {!isEdit && (
              <div className="form-group">
                <label>Số lượng nhập</label>
                <input
                  className="form-control" type="number" min="0"
                  value={form.quantityIn}
                  onChange={e => set('quantityIn', e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Ghi chú</label>
            <textarea
              className="form-control" rows={3}
              placeholder="Thông tin thêm về lô hàng..."
              value={form.note}
              onChange={e => set('note', e.target.value)}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '⏳ Đang lưu...' : isEdit ? '💾 Lưu thay đổi' : '+ Tạo lô'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}