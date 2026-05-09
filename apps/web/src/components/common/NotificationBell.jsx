// NotificationBell.js — v34
import { useConfirm } from './ConfirmModal.jsx';
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { notificationAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { IcoAlertTriangle, IcoBox, IcoCheck, IcoBell } from './Icons.jsx';

const NotificationBell = () => {
  const { isManagerOrAdmin } = useAuth();
  // [BUG-N23-1 FIX] useConfirm() was imported but NEVER called → confirmDlg undefined → ReferenceError on click
  const { confirm: confirmDlg, ConfirmDialog } = useConfirm();
  const [data,        setData]        = useState({ items: [], unreadCount: 0 });
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [cleaning,    setCleaning]    = useState(false);
  const [cleanMsg,    setCleanMsg]    = useState('');   // feedback message
  const dropRef = useRef(null);
  const lastSyncRef = useRef(0);

  const load = async () => {
    // sync chỉ gọi cho manager/admin (tránh 403 cho user thường)
    const now = Date.now();
    if (isManagerOrAdmin && (now - lastSyncRef.current > 300000)) { // 5 mins
      try { 
        await notificationAPI.sync(); 
        lastSyncRef.current = now;
      } catch { /* bỏ qua */ }
    }
    try {
      const r = await notificationAPI.getAll(false);
      setData(r.data?.data || { items: [], unreadCount: 0 });
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setOpen(false);
        setCleanMsg('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkAllRead = async () => {
    await notificationAPI.markAllRead();
    setData(prev => ({ ...prev, unreadCount: 0, items: prev.items.map(n => ({ ...n, isRead: true })) }));
  };

  const handleMarkRead = async (id) => {
    await notificationAPI.markRead(id);
    setData(prev => ({
      unreadCount: Math.max(0, prev.unreadCount - 1),
      items: prev.items.map(n => n.id === id ? { ...n, isRead: true } : n),
    }));
  };

  // F3: Dọn dẹp thông báo đã đọc cũ hơn 30 ngày
  const handleClearRead = async () => {
    if (!await confirmDlg({ title: 'Xoá thông báo cũ', message: 'Xoá tất cả thông báo đã đọc cũ hơn 30 ngày?', variant: 'danger' })) return;
    setCleaning(true);
    setCleanMsg('');
    try {
      const r = await notificationAPI.clearRead(30);
      const msg = r.data?.message || 'Đã dọn dẹp xong';
      setCleanMsg(msg);
      // Reload danh sách sau khi xoá
      await load();
      // Tự ẩn message sau 4 giây
      setTimeout(() => setCleanMsg(''), 4000);
    } catch {
      setCleanMsg('Dọn dẹp thất bại. Thử lại sau.');
    } finally {
      setCleaning(false);
    }
  };

  const typeIcon = (type) => {
    if (type === 'OUT_OF_STOCK')         return <IcoBox size={13} style={{ color: 'var(--color-danger)' }} />;
    if (type === 'REQUISITION_APPROVED') return <IcoCheck size={13} style={{ color: '#10b981' }} />;
    if (type === 'REQUISITION_REJECTED') return <IcoAlertTriangle size={13} style={{ color: '#ef4444' }} />;
    if (type === 'REQUISITION_CREATED')  return <IcoCheck size={13} style={{ color: '#3b82f6' }} />;
    return <IcoAlertTriangle size={13} style={{ color: 'var(--color-warning)' }} />;
  };

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(o => !o); setCleanMsg(''); }}
        style={{
          position: 'relative', background: 'none', border: '1px solid var(--card-border)',
          borderRadius: 8, padding: '0.35rem 0.6rem', cursor: 'pointer',
          color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
          transition: 'all 0.15s',
        }}
        title="Thông báo"
      >
        <IcoBell size={18} />
        {data.unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            background: 'var(--color-danger)', color: '#fff',
            borderRadius: '50%', width: 18, height: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 700, lineHeight: 1,
          }}>
            {data.unreadCount > 9 ? '9+' : data.unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 340, background: '#fff',
          border: '1px solid var(--card-border)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.12)',
          zIndex: 1000, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 1rem', borderBottom: '1px solid var(--card-border)',
          }}>
            <span style={{ fontWeight: 600, fontSize: '.875rem' }}>
              Thông báo{data.unreadCount > 0 && (
                <span style={{ background: 'var(--color-danger)', color: '#fff', borderRadius: 20, padding: '0 6px', fontSize: '.68rem', marginLeft: 4 }}>
                  {data.unreadCount}
                </span>
              )}
            </span>
            {data.unreadCount > 0 && (
              <button onClick={handleMarkAllRead}
                style={{ background: 'none', border: 'none', fontSize: '.75rem', color: 'var(--brand-primary)', cursor: 'pointer', padding: 0 }}>
                Đọc tất cả
              </button>
            )}
          </div>

          {/* Items */}
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {data.items.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                Không có thông báo mới
              </div>
            ) : data.items.map(n => (
              <div key={n.id}
                onClick={() => !n.isRead && handleMarkRead(n.id)}
                style={{
                  padding: '.75rem 1rem',
                  borderBottom: '1px solid var(--table-border)',
                  background: n.isRead ? 'transparent' : 'rgba(99,102,241,.04)',
                  cursor: n.isRead ? 'default' : 'pointer',
                  display: 'flex', gap: '.65rem', alignItems: 'flex-start',
                }}
              >
                <div style={{ marginTop: 2, flexShrink: 0 }}>{typeIcon(n.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.82rem', fontWeight: n.isRead ? 400 : 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: '.74rem', color: 'var(--text-secondary)', marginTop: '.2rem' }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: '.25rem' }}>
                    {new Date(n.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {!n.isRead && (
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--brand-primary)', flexShrink: 0, marginTop: 5 }} />
                )}
              </div>
            ))}
          </div>

          {/* Footer — F3: nút Dọn dẹp */}
          <div style={{
            padding: '.6rem 1rem', borderTop: '1px solid var(--card-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <Link to="/reports" onClick={() => setOpen(false)}
              style={{ fontSize: '.78rem', color: 'var(--brand-primary)' }}>
              Xem báo cáo tồn kho →
            </Link>

            {/* F3: Cleanup button — ngăn bảng phình vô hạn */}
            <button
              onClick={handleClearRead}
              disabled={cleaning}
              title="Xoá thông báo đã đọc cũ hơn 30 ngày"
              style={{
                background: 'none', border: '1px solid var(--border-color)',
                borderRadius: 5, padding: '0.2rem 0.55rem',
                fontSize: '.72rem', cursor: cleaning ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 4,
                opacity: cleaning ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              {cleaning ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Đang xoá...
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  Dọn dẹp
                </>
              )}
            </button>
          </div>

          {/* Feedback message sau khi cleanup */}
          {cleanMsg && (
            <div style={{
              padding: '.45rem 1rem',
              background: cleanMsg.includes('thất bại') ? 'rgba(239,68,68,.08)' : 'rgba(16,185,129,.08)',
              borderTop: '1px solid var(--card-border)',
              fontSize: '.75rem',
              color: cleanMsg.includes('thất bại') ? 'var(--color-danger)' : 'var(--color-success)',
            }}>
              {cleanMsg}
            </div>
          )}
        </div>
      )}
      {/* [BUG-N23-1 FIX] Render ConfirmDialog — thiếu → await confirmDlg() never resolves */}
      <ConfirmDialog />
    </div>
  );
};

export default NotificationBell;
