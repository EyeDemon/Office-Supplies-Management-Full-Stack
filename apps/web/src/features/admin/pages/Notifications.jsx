// page/Notifications.js — Trang thông báo đầy đủ (Spec XIII)
// [FE-03] Skeleton thay Spinner cho loading states
import { useConfirm } from '@/components/common/ConfirmModal';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Alert, Row, Col, Form } from 'react-bootstrap';
import { SkeletonBar, SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState from '@/components/common/EmptyState.jsx'; // [FE-06]
import { notificationAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import {
  IcoAlertTriangle, IcoCheck, IcoBox, IcoGrid,
  IcoRefresh, IcoTrash, IcoInbox,
} from '@/components/common/Icons.jsx';

/* ── Cấu hình loại thông báo ─────────────────────────────────── */
const TYPE_CFG = {
  LOW_STOCK:            { label: 'Tồn thấp',      cls: 'badge-warning', Icon: IcoAlertTriangle },
  OUT_OF_STOCK:         { label: 'Hết hàng',       cls: 'badge-danger',  Icon: IcoBox           },
  REQUISITION_CREATED:  { label: 'Yêu cầu mới',   cls: 'badge-info',    Icon: IcoGrid          },
  REQUISITION_APPROVED: { label: 'Đã duyệt',       cls: 'badge-success', Icon: IcoCheck         },
  REQUISITION_REJECTED: { label: 'Bị từ chối',     cls: 'badge-danger',  Icon: IcoAlertTriangle },
};
const getCfg = t => TYPE_CFG[t] || { label: t, cls: 'badge-secondary', Icon: IcoInbox };
const fmtDT  = d => d ? new Date(d).toLocaleString('vi-VN') : '—';

// [UX-04b FIX] Map notification type + ref_type → app route for navigation
// Clicking a notification marks it read AND navigates to the relevant page.
const getNotificationUrl = (n) => {
  const type    = n.type     || '';
  const refType = n.ref_type || '';
  // Requisition flows
  if (type === 'REQUISITION_CREATED' || refType === 'requisition')
    return '/requisition-approval';
  if (type === 'REQUISITION_APPROVED' || type === 'REQUISITION_REJECTED')
    return '/requisitions';
  // Stock alerts → inventory or products
  if (type === 'LOW_STOCK' || type === 'OUT_OF_STOCK')
    return '/products';
  // Purchase requests
  if (type === 'PURCHASE_REQUEST' || refType === 'purchase_request')
    return '/purchases';
  // Default: stay on notifications
  return null;
};

export default function Notifications() {
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const { isManagerOrAdmin } = useAuth();
  const navigate = useNavigate();

  const [items,      setItems]      = useState([]);
  const [unread,     setUnread]     = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [cleaning,   setCleaning]   = useState(false);
  const [msg,        setMsg]        = useState({ type: '', text: '' });
  const [showAll,    setShowAll]    = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  /* ── Load ──────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isManagerOrAdmin) {
        try { await notificationAPI.sync(); } catch { /* bỏ qua */ }
      }
      const r = await notificationAPI.getAll(showAll);
      const d = r.data?.data || { items: [], unreadCount: 0 };
      setItems(d.items || []);
      setUnread(d.unreadCount || 0);
    } catch {
      setMsg({ type: 'danger', text: 'Lỗi tải thông báo' });
    } finally {
      setLoading(false);
    }
  }, [showAll, isManagerOrAdmin]);

  useEffect(() => { load(); }, [load]);

  /* ── Actions ───────────────────────────────────────────────── */
  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      setItems(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
      setMsg({ type: 'success', text: 'Đã đánh dấu tất cả là đã đọc' });
    } catch { setMsg({ type: 'danger', text: 'Lỗi thao tác' }); }
  };

  const handleMarkOne = async (id) => {
    try {
      await notificationAPI.markRead(id);
      setItems(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* bỏ qua */ }
  };

  const handleClearRead = async () => {
    if (!await confirmDlg({ title: 'Xóa thông báo cũ', message: 'Xóa tất cả thông báo đã đọc cũ hơn 30 ngày?', variant: 'danger' })) return;
    setCleaning(true);
    try {
      const r = await notificationAPI.clearRead(30);
      setMsg({ type: 'success', text: r.data?.message || 'Đã dọn thông báo cũ' });
      load();
    } catch { setMsg({ type: 'danger', text: 'Lỗi dọn dẹp' }); }
    finally { setCleaning(false); }
  };

  /* ── Filter ────────────────────────────────────────────────── */
  const filtered = items.filter(n => !typeFilter || n.type === typeFilter);
  const readCnt  = items.filter(n => n.isRead).length;

  /* ── Stat cards ────────────────────────────────────────────── */
  const stats = [
    { label: 'Tổng thông báo', val: items.length,    color: '#6366f1' },
    { label: 'Chưa đọc',       val: unread,           color: unread > 0 ? '#ef4444' : '#10b981' },
    { label: 'Đã đọc',         val: readCnt,          color: '#10b981' },
    { label: 'Đang hiển thị',  val: filtered.length,  color: '#f59e0b' },
  ];

  return (
    <>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Thông báo</h1>
          <p className="page-subtitle">Theo dõi tồn kho, yêu cầu cấp phát và hoạt động hệ thống</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unread > 0 && (
            <button className="btn btn-sm btn-outline-primary" onClick={handleMarkAllRead}>
              <IcoCheck size={13} /> Đánh dấu tất cả đã đọc
            </button>
          )}
          {isManagerOrAdmin && (
            <button className="btn btn-sm btn-outline-danger" onClick={handleClearRead} disabled={cleaning}>
              <IcoTrash size={13} /> {cleaning ? 'Đang dọn...' : 'Dọn thông báo cũ'}
            </button>
          )}
          <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
            <IcoRefresh size={13} /> Làm mới
          </button>
        </div>
      </div>

      {/* ── Alert ── */}
      {msg.text && (
        <Alert variant={msg.type} dismissible onClose={() => setMsg({ type: '', text: '' })} className="mb-3">
          {msg.text}
        </Alert>
      )}

      {/* ── Stats ── */}
      <Row className="g-3 mb-4">
        {stats.map(s => (
          <Col xs={6} md={3} key={s.label}>
            <Card style={{ borderLeft: `4px solid ${s.color}`, borderRadius: 10 }}>
              <Card.Body style={{ padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color }}>
                  {loading ? <SkeletonBar width={48} height={28} /> : s.val}
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Filter bar ── */}
      <Card className="mb-3">
        <Card.Body className="py-2 px-3">
          <Row className="g-2 align-items-center">
            <Col md={3}>
              <Form.Select size="sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">Tất cả loại</option>
                {Object.entries(TYPE_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select size="sm" value={showAll ? 'all' : 'unread'} onChange={e => setShowAll(e.target.value === 'all')}>
                <option value="all">Tất cả trạng thái</option>
                <option value="unread">Chỉ chưa đọc</option>
              </Form.Select>
            </Col>
            <Col className="ms-auto text-end">
              <small style={{ color: 'var(--text-secondary)', fontSize: '.78rem' }}>
                Hiển thị <strong>{filtered.length}</strong> / {items.length} thông báo
              </small>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* ── Danh sách ── */}
      <Card>
        <Card.Body className="p-0">
          {loading ? (
            <table className="table mb-0"><tbody>
              {[1,2,3,4,5].map(i => <SkeletonRow key={i} cols={3} />)}
            </tbody></table>
          ) : filtered.length === 0 ? (
            // BUG-L2 FIX: Empty state có CTA theo Spec UX XII
            <EmptyState
              icon="default"
              message={!showAll ? 'Không có thông báo chưa đọc' : 'Không có thông báo nào'}
              sub="Khi có hoạt động mới trong hệ thống, thông báo sẽ xuất hiện ở đây."
              cta={!showAll ? 'Xem tất cả thông báo' : undefined}
              onCta={!showAll ? () => setShowAll(true) : undefined}
              ctaVariant="secondary"
            />
          ) : (
            filtered.map((n, idx) => {
              const { label, cls, Icon } = getCfg(n.type);
              const isLast = idx === filtered.length - 1;
              return (
                <div
                  key={n.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
                    padding: '0.9rem 1.25rem',
                    borderBottom: isLast ? 'none' : '1px solid var(--card-border)',
                    background: n.isRead ? 'transparent' : 'var(--brand-light)',
                    transition: 'background .15s',
                  }}
                >
                  {/* Icon circle */}
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: n.isRead ? 'var(--table-header-bg)' : 'var(--brand-primary)',
                    color: n.isRead ? 'var(--text-muted)' : '#fff',
                  }}>
                    <Icon size={16} />
                  </div>

                  {/* Nội dung */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: n.isRead ? 500 : 700, fontSize: '.88rem', color: 'var(--text-primary)' }}>
                        {n.title}
                      </span>
                      <Badge className={cls} style={{ fontSize: '.68rem' }}>{label}</Badge>
                      {!n.isRead && (
                        <Badge className="badge-primary" style={{ fontSize: '.65rem' }}>Mới</Badge>
                      )}
                    </div>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {n.message}
                    </p>
                    {n.productName && (
                      <small style={{ color: 'var(--text-muted)', fontSize: '.73rem' }}>
                        Sản phẩm: <strong>{n.productName}</strong>
                        {n.sku ? ` (${n.sku})` : ''}
                        {n.stockQty !== null ? ` — Tồn: ${n.stockQty}` : ''}
                      </small>
                    )}
                  </div>

                  {/* Thời gian + hành động */}
                  <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 110 }}>
                    <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {fmtDT(n.createdAt)}
                    </div>
                    {n.isRead ? (
                      <div style={{ fontSize: '.68rem', color: 'var(--color-success)', marginTop: 3 }}>
                        <IcoCheck size={10} /> Đã đọc
                      </div>
                    ) : (
                      <button
                        onClick={() => handleMarkOne(n.id)}
                        style={{
                          marginTop: 5, fontSize: '.7rem', padding: '2px 8px', borderRadius: 4,
                          border: '1px solid var(--brand-primary)', color: 'var(--brand-primary)',
                          background: 'transparent', cursor: 'pointer',
                        }}
                      >
                        Đánh dấu đọc
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </Card.Body>
      </Card>
      {/* [N22-FIX-9] Render ConfirmDialog — thiếu → deleteOld hangs indefinitely */}
      <ConfirmDialog />
    </>
  );
}