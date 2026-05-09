// apps/web/src/features/inventory/pages/StockTransfer.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { transferAPI } from '@/services/api';
import AlertMessage  from '@/components/common/AlertMessage.jsx';
import Modal         from '@/components/common/Modal.jsx';
import { SkeletonTable, SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx';
import { useConfirm } from '@/components/common/ConfirmModal';
import useAutoAlert  from '@/hooks/useAutoAlert';
import { IcoPlus, IcoCheck, IcoX, IcoTruck, IcoPackage, IcoDownload, IcoArrowRight, IcoArrowLeft, IcoEye, IcoEdit } from '@/components/common/Icons.jsx';
import TransferForm from '../components/TransferForm';

const STATUS_LABEL = { DRAFT:'Bản nháp', PENDING:'Chờ duyệt', APPROVED:'Đã duyệt', IN_TRANSIT:'Đang vận chuyển', COMPLETED:'Hoàn tất', CANCELLED:'Đã huỷ' };
const STATUS_COLOR = { DRAFT:'#6b7280', PENDING:'#f59e0b', APPROVED:'#3b82f6', IN_TRANSIT:'#8b5cf6', COMPLETED:'#10b981', CANCELLED:'#ef4444' };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
const fmtNum  = (n) => Number(n || 0).toLocaleString('vi-VN');

export default function StockTransfer() {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const [list, setList]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [statusFilter, setStatus] = useState('');
  const [search, setSearch]     = useState('');
  const [alert, setAlert]       = useAutoAlert();

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [detailLoading, setDL]  = useState(false);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const limit = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await transferAPI.getAll({ page, limit, status: statusFilter || undefined, search: search || undefined });
      setList(r.data?.data?.items || []);
      setTotal(r.data?.data?.total || 0);
    } catch { setAlert('error', 'Lỗi tải danh sách phiếu điều chuyển'); }
    finally { setLoading(false); }
  }, [page, statusFilter, search, setAlert]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    setDL(true); setDetail(null);
    try {
      const r = await transferAPI.getById(id);
      setDetail(r.data?.data);
    } catch { setAlert('error', 'Lỗi tải chi tiết'); }
    finally { setDL(false); }
  };

  const doAction = async (fn, msg) => {
    try {
      const r = await fn();
      setAlert('success', r.data?.message || msg);
      setDetail(null); load();
    } catch (e) { setAlert('error', e.response?.data?.message || 'Lỗi thao tác'); }
  };

  const handleExport = async () => {
    try {
      const r = await transferAPI.exportCsv({ status: statusFilter });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'dieu_chuyen_kho.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { setAlert('error', 'Lỗi xuất CSV'); }
  };

  const totalPages = Math.ceil(total / limit);

  const StatusBadge = ({ s }) => (
    <span style={{ background: STATUS_COLOR[s]+'22', color: STATUS_COLOR[s], border: `1px solid ${STATUS_COLOR[s]}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {STATUS_LABEL[s] || s}
    </span>
  );

  return (
    <div className="app-content p-4">
      <div className="page-header mb-4">
        <div>
          <h2 className="page-title h4 fw-bold mb-1">Điều chuyển kho</h2>
          <p className="page-subtitle text-muted small mb-0">Điều phối vật phẩm giữa các kho / bộ phận</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-success btn-sm" onClick={handleExport}><IcoDownload size={14} className="me-1" /> Xuất CSV</button>
          <button className="btn btn-premium btn-sm" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <IcoPlus size={14} className="me-1" /> Tạo phiếu
          </button>
        </div>
      </div>

      {alert && <AlertMessage type={alert.type} message={alert.message} />}

      <div className="data-card p-3 mb-4 shadow-sm border-0 bg-white rounded">
        <div className="row g-3">
          <div className="col-md-4">
            <input className="form-control form-control-sm" placeholder="Tìm mã phiếu, kho..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="col-md-3">
            <select className="form-select form-select-sm" value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1); }}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="data-card shadow-sm border-0 bg-white rounded overflow-hidden">
        {loading ? (
          <SkeletonTable headers={['Mã phiếu','Trạng thái','Kho nguồn','Kho đích','Tổng SL','Ngày tạo','Thao tác']} rows={5} />
        ) : list.length === 0 ? (
          <EmptyState icon="transfer" message="Chưa có phiếu điều chuyển nào" sub="Tạo phiếu để chuyển hàng giữa các kho" />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="bg-light">
                <tr className="small text-muted text-uppercase fw-bold">
                  <th className="ps-4">Mã phiếu</th><th>Trạng thái</th><th>Kho nguồn</th><th>Kho đích</th>
                  <th className="text-end">Tổng SL</th><th>Ngày tạo</th><th className="text-end pe-4">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {list.map(t => (
                  <tr key={t.id}>
                    <td className="ps-4 fw-bold text-primary">{t.transfer_code}</td>
                    <td><StatusBadge s={t.status} /></td>
                    <td className="small">{t.from_location}</td>
                    <td className="small">{t.to_location}</td>
                    <td className="text-end fw-bold">{fmtNum(t.total_qty)}</td>
                    <td className="small">{fmtDate(t.created_at)}</td>
                    <td className="text-end pe-4">
                      <div className="d-flex gap-1 justify-content-end">
                        <button className="btn btn-link btn-sm text-decoration-none" onClick={() => openDetail(t.id)}><IcoEye size={14} /> Chi tiết</button>
                        {t.status === 'DRAFT' && (
                          <button className="btn btn-link btn-sm text-decoration-none text-warning" onClick={() => { setEditItem(t); setShowForm(true); }}><IcoEdit size={14} /> Sửa</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="d-flex justify-content-center p-3 border-top bg-light">
            <div className="btn-group btn-group-sm shadow-sm">
              <button className="btn btn-white" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}><IcoArrowLeft size={12} /></button>
              <button className="btn btn-white disabled px-3">Trang {page} / {totalPages}</button>
              <button className="btn btn-white" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}><IcoArrowRight size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <Modal title={detail ? `Chi tiết: ${detail.transfer_code}` : 'Đang tải...'} onClose={() => setDetail(null)} size="lg">
          {detailLoading ? (
            <div className="p-5 text-center"><SkeletonRow cols={1} /></div>
          ) : detail && (
            <div>
              <div className="row g-2 mb-4">
                {[
                  ['Mã phiếu', detail.transfer_code],
                  ['Trạng thái', <StatusBadge s={detail.status} />],
                  ['Kho nguồn', detail.from_location],
                  ['Kho đích', detail.to_location],
                  ['Người tạo', detail.created_by_name],
                  ['Ngày tạo', fmtDate(detail.created_at)],
                ].map(([k, v]) => (
                  <div key={k} className="col-6 col-md-4">
                    <div className="p-2 bg-light rounded">
                      <div className="small text-muted mb-1">{k}</div>
                      <div className="fw-bold small">{v}</div>
                    </div>
                  </div>
                ))}
              </div>

              {detail.note && (
                <div className="p-2 bg-light rounded mb-4">
                  <div className="small text-muted mb-1">Ghi chú</div>
                  <div className="small">{detail.note}</div>
                </div>
              )}

              <div className="fw-bold small mb-2 text-uppercase text-muted">Sản phẩm ({detail.items?.length || 0})</div>
              <div className="table-responsive border rounded">
                <table className="table table-sm table-hover mb-0 small">
                  <thead className="bg-light"><tr><th className="ps-3">Sản phẩm</th><th>SKU</th><th className="text-end">Tồn kho</th><th className="text-end pe-3">SL điều chuyển</th></tr></thead>
                  <tbody>
                    {(detail.items || []).map(item => (
                      <tr key={item.id}>
                        <td className="ps-3">{item.product_name}</td>
                        <td className="text-muted">{item.sku}</td>
                        <td className="text-end">{fmtNum(item.stock_quantity)}</td>
                        <td className="text-end pe-3 fw-bold">{fmtNum(item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="d-flex gap-2 justify-content-end mt-4 pt-3 border-top">
                {detail.status === 'DRAFT' && (
                  <>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => confirmDlg({ title: 'Huỷ phiếu', message: 'Huỷ phiếu điều chuyển này?', variant: 'danger' }).then(ok => ok && doAction(() => transferAPI.cancel(detail.id), 'Đã huỷ'))}>Huỷ phiếu</button>
                    <button className="btn btn-primary btn-sm px-4" onClick={() => doAction(() => transferAPI.submit(detail.id), 'Đã gửi phiếu chờ duyệt')}><IcoArrowRight size={14} /> Gửi duyệt</button>
                  </>
                )}
                {detail.status === 'PENDING' && (
                  <>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => { setRejectModal(detail.id); setRejectReason(''); }}>Từ chối</button>
                    <button className="btn btn-success btn-sm px-4" onClick={() => doAction(() => transferAPI.approve(detail.id), 'Đã phê duyệt')}><IcoCheck size={14} /> Phê duyệt</button>
                  </>
                )}
                {detail.status === 'APPROVED' && (
                  <button className="btn btn-warning btn-sm text-white px-4" onClick={() => confirmDlg({ title: 'Xuất kho', message: 'Xác nhận xuất kho nguồn?' }).then(ok => ok && doAction(() => transferAPI.dispatch(detail.id), 'Đã xuất kho nguồn'))}><IcoTruck size={14} /> Xuất kho nguồn</button>
                )}
                {detail.status === 'IN_TRANSIT' && (
                  <button className="btn btn-success btn-sm px-4" onClick={() => confirmDlg({ title: 'Nhận hàng', message: 'Xác nhận nhận hàng tại kho đích?' }).then(ok => ok && doAction(() => transferAPI.complete(detail.id), 'Đã hoàn tất nhập kho đích'))}><IcoPackage size={14} /> Nhận vào kho</button>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {rejectModal && (
        <Modal title="Từ chối điều chuyển" onClose={() => setRejectModal(null)} size="sm">
          <div className="mb-3">
            <label className="form-label small fw-bold">Lý do từ chối *</label>
            <textarea className="form-control form-control-sm" rows={3} value={rejectReason}
              onChange={e => setRejectReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <div className="d-flex gap-2 justify-content-end">
            <button className="btn btn-light btn-sm" onClick={() => setRejectModal(null)}>Đóng</button>
            <button className="btn btn-danger btn-sm px-3" onClick={() => {
              if (!rejectReason.trim()) return setAlert('error', 'Vui lòng nhập lý do');
              doAction(() => transferAPI.reject(rejectModal, { reason: rejectReason }), 'Đã từ chối');
              setRejectModal(null);
            }}>Xác nhận</button>
          </div>
        </Modal>
      )}

      {showForm && (
        <TransferForm
          editItem={editItem}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSaved={() => { setShowForm(false); setEditItem(null); load(); }}
          setAlert={setAlert}
        />
      )}
      <ConfirmDialog />
    </div>
  );
}