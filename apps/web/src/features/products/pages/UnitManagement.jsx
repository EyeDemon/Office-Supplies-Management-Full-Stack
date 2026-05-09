// pages/UnitManagement.jsx — BUG 4: Đơn vị tính & Quy đổi
import { useState, useEffect, useCallback } from 'react';
import EmptyState from '@/components/common/EmptyState.jsx'; // [FE-06]
import { unitAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useConfirm } from '@/components/common/ConfirmModal'; // [N22-FIX-1]

export default function UnitManagement() {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { user } = useAuth();
  const isAdmin   = user?.role === 'ADMIN';
  const isManager = isAdmin || user?.role === 'MANAGER';

  const [tab, setTab]                 = useState('units'); // units | conversions
  const [units, setUnits]             = useState([]);
  const [conversions, setConversions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [alert, setAlert]             = useState(null);
  const [showUnitForm, setShowUnitForm]     = useState(false);
  const [editUnit, setEditUnit]             = useState(null);
  const [showConvForm, setShowConvForm]     = useState(false);
  const [editConv, setEditConv]             = useState(null);
  const [search, setSearch]           = useState('');

  const showMsg = (msg, type = 'success') => {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadUnits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await unitAPI.getAll(search);
      setUnits(res.data.data || []);
    } catch { showMsg('Không thể tải đơn vị', 'error'); }
    finally { setLoading(false); }
  }, [search]);

  const loadConversions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await unitAPI.getAllConversions();
      setConversions(res.data.data || []);
    } catch { showMsg('Không thể tải quy đổi', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'units') loadUnits(); else loadConversions(); }, [tab, loadUnits, loadConversions]);

  const handleDeleteUnit = async (u) => {
    if (!await confirmDlg({ title: 'Xóa đơn vị', message: `Xóa đơn vị "${u.name}"?`, variant: 'danger' })) return;
    try {
      await unitAPI.delete(u.id);
      showMsg('Đã xóa đơn vị');
      loadUnits();
    } catch (e) { showMsg(e.response?.data?.message || 'Xóa thất bại', 'error'); }
  };

  const handleDeleteConv = async (c) => {
    if (!await confirmDlg({ title: 'Xóa quy đổi', message: `Xóa quy đổi "${c.display}"?`, variant: 'danger' })) return;
    try {
      await unitAPI.deleteConversion(c.id);
      showMsg('Đã xóa quy đổi');
      loadConversions();
    } catch (e) { showMsg(e.response?.data?.message || 'Xóa thất bại', 'error'); }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">📐 Đơn vị tính & Quy đổi</h1>
          <p className="page-subtitle">Quản lý đơn vị tính và tỷ lệ quy đổi giữa các đơn vị</p>
        </div>
        {isManager && tab === 'units' && (
          <button className="btn btn-primary" onClick={() => { setEditUnit(null); setShowUnitForm(true); }}>
            + Thêm đơn vị
          </button>
        )}
        {isManager && tab === 'conversions' && (
          <button className="btn btn-primary" onClick={() => { setEditConv(null); setShowConvForm(true); }}>
            + Thêm quy đổi
          </button>
        )}
      </div>

      {alert && (
        <div className={`alert alert-${alert.type === 'error' ? 'danger' : 'success'}`}>{alert.msg}</div>
      )}

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab ${tab === 'units' ? 'active' : ''}`} onClick={() => setTab('units')}>
          📏 Đơn vị tính ({units.length})
        </button>
        <button className={`tab ${tab === 'conversions' ? 'active' : ''}`} onClick={() => setTab('conversions')}>
          🔄 Quy đổi ({conversions.length})
        </button>
      </div>

      {/* ── UNITS TAB ── */}
      {tab === 'units' && (
        <>
          <div className="filter-bar">
            <input
              className="form-control" style={{ maxWidth: 260 }}
              placeholder="Tìm đơn vị..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="card">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tên đơn vị</th>
                  <th>Ký hiệu</th>
                  <th>Đơn vị gốc</th>
                  {isManager && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-4">⏳ Đang tải...</td></tr>
                ) : units.length === 0 ? (
                  <tr><td colSpan={5} className="p-0">
                    <EmptyState icon="📐" message="Chưa có đơn vị nào" cta={isManager ? '+ Thêm đơn vị' : undefined} onCta={isManager ? () => setShowUnitForm(true) : undefined} style={{ padding: '1.5rem' }} />
                  </td></tr>
                ) : units.map(u => (
                  <tr key={u.id}>
                    <td className="text-muted">{u.id}</td>
                    <td><strong>{u.name}</strong></td>
                    <td><code>{u.symbol || '—'}</code></td>
                    <td>
                      {u.isBase
                        ? <span className="badge badge-success">✓ Gốc</span>
                        : <span className="badge badge-secondary">—</span>
                      }
                    </td>
                    {isManager && (
                      <td>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => { setEditUnit(u); setShowUnitForm(true); }}>✏️</button>
                        {isAdmin && (
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteUnit(u)}>🗑️</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── CONVERSIONS TAB ── */}
      {tab === 'conversions' && (
        <>
          <div className="card" style={{ marginBottom: 12, padding: '12px 16px', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
            <strong>📌 Quy tắc:</strong> Không chain conversion. Mỗi quy đổi phải trực tiếp từ đơn vị A sang B.
            Tỷ lệ: <code>số lượng_B = số lượng_A × ratio</code>
          </div>

          <div className="card">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Từ đơn vị</th>
                  <th>Sang đơn vị</th>
                  <th>Tỷ lệ</th>
                  <th>Diễn giải</th>
                  <th>Ghi chú</th>
                  {isManager && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-4">⏳ Đang tải...</td></tr>
                ) : conversions.length === 0 ? (
                  <tr><td colSpan={6} className="p-0">
                    <EmptyState icon="transfer" message="Chưa có quy đổi nào" cta={isManager ? '+ Thêm quy đổi' : undefined} onCta={isManager ? () => setShowConvForm(true) : undefined} style={{ padding: '1.5rem' }} />
                  </td></tr>
                ) : conversions.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.fromUnitName}</strong></td>
                    <td><strong>{c.toUnitName}</strong></td>
                    <td><code>×{c.ratio}</code></td>
                    <td className="text-muted">{c.display}</td>
                    <td className="text-muted small">{c.note || '—'}</td>
                    {isManager && (
                      <td>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => { setEditConv(c); setShowConvForm(true); }}>✏️</button>
                        {isAdmin && (
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteConv(c)}>🗑️</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Unit Form Modal */}
      {showUnitForm && (
        <UnitForm
          unit={editUnit}
          onClose={() => setShowUnitForm(false)}
          onSaved={() => {
            setShowUnitForm(false);
            loadUnits();
            showMsg(editUnit ? 'Cập nhật đơn vị thành công' : 'Tạo đơn vị thành công');
          }}
        />
      )}

      {/* Conversion Form Modal */}
      {showConvForm && (
        <ConversionForm
          conv={editConv}
          units={units}
          onClose={() => setShowConvForm(false)}
          onSaved={() => {
            setShowConvForm(false);
            loadConversions();
            showMsg(editConv ? 'Cập nhật quy đổi thành công' : 'Tạo quy đổi thành công');
          }}
        />
      )}
      {/* [N22-FIX-1] Render ConfirmDialog — thiếu → await confirmDlg() never resolves */}
      <ConfirmDialog />
    </div>
  );
}
function UnitForm({ unit, onClose, onSaved }) {
  const isEdit = Boolean(unit);
  const [form, setForm]   = useState({ name: unit?.name || '', symbol: unit?.symbol || '', isBase: unit?.isBase || false });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Tên đơn vị là bắt buộc');
    setSaving(true);
    try {
      if (isEdit) await unitAPI.update(unit.id, form);
      else        await unitAPI.create(form);
      onSaved();
    } catch (e) {
      setError(e.response?.data?.message || 'Có lỗi xảy ra');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3>{isEdit ? '✏️ Sửa đơn vị' : '+ Thêm đơn vị mới'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-group">
            <label>Tên đơn vị <span className="text-danger">*</span></label>
            <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Cái, Hộp, Ream..." required />
          </div>
          <div className="form-group">
            <label>Ký hiệu (tùy chọn)</label>
            <input className="form-control" value={form.symbol} onChange={e => set('symbol', e.target.value)} placeholder="pcs, box, rm..." />
          </div>
          <div className="form-check">
            <input type="checkbox" className="form-check-input" id="isBase" checked={form.isBase} onChange={e => set('isBase', e.target.checked)} />
            <label className="form-check-label" htmlFor="isBase">Đây là đơn vị gốc (base unit)</label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '⏳...' : isEdit ? '💾 Lưu' : '+ Tạo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Conversion Form ───────────────────────────────────────────────
function ConversionForm({ conv, units, onClose, onSaved }) {
  const isEdit = Boolean(conv);
  const [form, setForm] = useState({
    fromUnitId: conv?.fromUnitId || '',
    toUnitId:   conv?.toUnitId   || '',
    ratio:      conv?.ratio       || '',
    note:       conv?.note        || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [preview, setPreview] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const from = units.find(u => u.id === Number(form.fromUnitId));
    const to   = units.find(u => u.id === Number(form.toUnitId));
    if (from && to && form.ratio > 0) {
      setPreview(`1 ${from.name} = ${form.ratio} ${to.name}`);
    } else {
      setPreview('');
    }
  }, [form.fromUnitId, form.toUnitId, form.ratio, units]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.fromUnitId || !form.toUnitId) return setError('Chọn cả 2 đơn vị');
    if (Number(form.fromUnitId) === Number(form.toUnitId)) return setError('2 đơn vị không thể giống nhau');
    if (!form.ratio || Number(form.ratio) <= 0) return setError('Tỷ lệ phải > 0');
    setSaving(true);
    try {
      if (isEdit) {
        await unitAPI.updateConversion(conv.id, { ratio: Number(form.ratio), note: form.note });
      } else {
        await unitAPI.createConversion({ fromUnitId: Number(form.fromUnitId), toUnitId: Number(form.toUnitId), ratio: Number(form.ratio), note: form.note });
      }
      onSaved();
    } catch (e) {
      setError(e.response?.data?.message || 'Có lỗi xảy ra');
    } finally { setSaving(false); }
  };

  const activeUnits = units.filter(u => !u.deleted);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>{isEdit ? '✏️ Sửa quy đổi' : '+ Thêm quy đổi mới'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label>Từ đơn vị <span className="text-danger">*</span></label>
              <select className="form-control" value={form.fromUnitId} onChange={e => set('fromUnitId', e.target.value)} disabled={isEdit} required>
                <option value="">— Chọn —</option>
                {activeUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', fontSize: 24, paddingTop: 28 }}>→</div>
            <div className="form-group">
              <label>Sang đơn vị <span className="text-danger">*</span></label>
              <select className="form-control" value={form.toUnitId} onChange={e => set('toUnitId', e.target.value)} disabled={isEdit} required>
                <option value="">— Chọn —</option>
                {activeUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Tỷ lệ quy đổi <span className="text-danger">*</span></label>
            <input className="form-control" type="number" step="0.000001" min="0.000001" value={form.ratio} onChange={e => set('ratio', e.target.value)} placeholder="Ví dụ: 12 (1 Hộp = 12 Cái)" required />
            {preview && <div className="text-info mt-1"><strong>📐 {preview}</strong></div>}
          </div>

          <div className="form-group">
            <label>Ghi chú</label>
            <input className="form-control" value={form.note} onChange={e => set('note', e.target.value)} placeholder="Mô tả thêm..." />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '⏳...' : isEdit ? '💾 Lưu' : '+ Tạo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}