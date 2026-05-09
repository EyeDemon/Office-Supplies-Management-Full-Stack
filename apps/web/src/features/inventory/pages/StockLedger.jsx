// src/pages/StockLedger.jsx — v1.0.0 [GAP-01 UI]
// Sổ cái tồn kho — hiển thị toàn bộ audit trail từ bảng stock_ledger
// Spec III.3: StockLedger = Audit Core — mỗi giao dịch để lại 1 dòng bất biến
import React, { useState, useCallback, useEffect } from 'react';
import { stockLedgerAPI, warehouseAPI, productAPI } from '@/services/api.js';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import EmptyState       from '@/components/common/EmptyState.jsx';
import AlertMessage     from '@/components/common/AlertMessage.jsx';
import { IcoClipboard, IcoFilter, IcoSearch, IcoRefresh, IcoX, IcoArrowRight } from '@/components/common/Icons.jsx';

// ── Helpers ────────────────────────────────────────────────────────
const TX_LABELS = {
  IMPORT:       { label: 'Nhập kho',        color: '#16a34a', bg: '#dcfce7' },
  EXPORT:       { label: 'Xuất kho',        color: '#dc2626', bg: '#fee2e2' },
  ADJUST:       { label: 'Điều chỉnh',      color: '#d97706', bg: '#fef3c7' },
  TRANSFER_IN:  { label: 'Chuyển đến',      color: '#2563eb', bg: '#dbeafe' },
  TRANSFER_OUT: { label: 'Chuyển đi',       color: '#7c3aed', bg: '#ede9fe' },
  RETURN_IN:    { label: 'Nhận hàng trả',   color: '#0891b2', bg: '#cffafe' },
  RETURN_OUT:   { label: 'Trả nhà cung cấp',color: '#be185d', bg: '#fce7f3' },
  STOCKTAKE:    { label: 'Kiểm kê',         color: '#065f46', bg: '#d1fae5' },
};

const REF_LABELS = {
  import_order:    'Phiếu nhập',
  export_order:    'Phiếu xuất',
  requisition:     'Yêu cầu',
  transfer:        'Chuyển kho',
  return:          'Trả hàng',
  adjustment:      'Điều chỉnh',
  stocktaking_session: 'Kiểm kê',
  purchase_order:  'Đơn mua hàng',
};

function TxBadge({ type }) {
  const meta = TX_LABELS[type] || { label: type, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: '.72rem', fontWeight: 600, letterSpacing: '.3px',
      color: meta.color, background: meta.bg, border: `1px solid ${meta.color}30`,
      whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  );
}

function QtyCell({ value }) {
  const n = Number(value);
  const color = n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : '#6b7280';
  return (
    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color }}>
      {n > 0 ? `+${n.toLocaleString('vi-VN')}` : n.toLocaleString('vi-VN')}
    </td>
  );
}

// ── Summary Strip ──────────────────────────────────────────────────
function SummaryStrip({ warehouseId, productId, dateFrom, dateTo }) {
  const [summary, setSummary] = useState([]);

  useEffect(() => {
    stockLedgerAPI.getSummary({ warehouseId, productId, dateFrom, dateTo })
      .then(r => setSummary(r.data?.data || []))
      .catch(() => setSummary([]));
  }, [warehouseId, productId, dateFrom, dateTo]);

  if (!summary.length) return null;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {summary.map(s => {
        const meta = TX_LABELS[s.transaction_type] || { label: s.transaction_type, color: '#6b7280', bg: '#f3f4f6' };
        return (
          <div key={s.transaction_type} style={{
            padding: '6px 14px', borderRadius: 8,
            background: meta.bg, border: `1px solid ${meta.color}40`,
            fontSize: '.8rem',
          }}>
            <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
            <span style={{ marginLeft: 8, color: '#374151' }}>
              {Number(s.tx_count).toLocaleString('vi-VN')} giao dịch ·{' '}
              <strong>{Number(s.total_qty).toLocaleString('vi-VN')}</strong> đơn vị
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
const PAGE_SIZE = 50;

export default function StockLedger() {
  // Data
  const [rows,       setRows]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  // Filter state
  const [warehouseId,     setWarehouseId]     = useState('');
  const [productSearch,   setProductSearch]   = useState('');
  const [txType,          setTxType]          = useState('');
  const [dateFrom,        setDateFrom]        = useState('');
  const [dateTo,          setDateTo]          = useState('');
  const [search,          setSearch]          = useState('');

  // Dropdown data
  const [warehouses, setWarehouses] = useState([]);

  // Load warehouse list for filter dropdown
  useEffect(() => {
    warehouseAPI?.getAllList?.()
      .then(r => setWarehouses(r.data?.data || []))
      .catch(() => setWarehouses([]));
  }, []);

  // Main data fetch
  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    setError(null);
    try {
      const r = await stockLedgerAPI.getAll({
        page:    pg,
        size:    PAGE_SIZE,
        warehouseId:     warehouseId   || undefined,
        transactionType: txType        || undefined,
        dateFrom:        dateFrom      || undefined,
        dateTo:          dateTo        || undefined,
        search:          (productSearch || search) || undefined,
      });
      const d = r.data?.data;
      setRows(d?.items || []);
      setTotal(d?.totalCount || 0);
      setPage(pg);
    } catch (e) {
      setError(e.response?.data?.message || 'Không thể tải dữ liệu sổ cái');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, txType, dateFrom, dateTo, productSearch, search]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const fmt = v => Number(v || 0).toLocaleString('vi-VN');
  const fmtCurrency = v => Number(v || 0).toLocaleString('vi-VN', { minimumFractionDigits: 0 });
  const fmtDate = iso => iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <IcoClipboard size={24} className="text-primary" />
        <div>
          <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem' }}>Sổ cái tồn kho</h4>
          <p style={{ margin: 0, fontSize: '.8rem', color: '#6b7280' }}>
            Audit trail bất biến — mọi giao dịch nhập / xuất / điều chỉnh tồn kho
          </p>
        </div>
        <span style={{
          marginLeft: 'auto', background: '#f0fdf4', color: '#16a34a',
          border: '1px solid #86efac', borderRadius: 20, padding: '3px 12px',
          fontSize: '.75rem', fontWeight: 600,
        }}>
          {fmt(total)} bản ghi
        </span>
      </div>

      {/* Filters */}
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
        padding: '12px 14px', marginBottom: 14,
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        {/* Warehouse filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: '.74rem', color: '#6b7280', fontWeight: 600 }}>Kho</label>
          <select
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '.85rem', minWidth: 140 }}
          >
            <option value=''>Tất cả kho</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        {/* Transaction type filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: '.74rem', color: '#6b7280', fontWeight: 600 }}>Loại giao dịch</label>
          <select
            value={txType}
            onChange={e => setTxType(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '.85rem', minWidth: 150 }}
          >
            <option value=''>Tất cả loại</option>
            {Object.entries(TX_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: '.74rem', color: '#6b7280', fontWeight: 600 }}>Từ ngày</label>
          <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '.85rem' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: '.74rem', color: '#6b7280', fontWeight: 600 }}>Đến ngày</label>
          <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '.85rem' }} />
        </div>

        {/* Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: '.74rem', color: '#6b7280', fontWeight: 600 }}>Tìm sản phẩm / ghi chú</label>
          <input
            type='text' placeholder='Nhập tên, SKU, ghi chú...'
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(0)}
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '.85rem' }}
          />
        </div>

        <button
          onClick={() => load(0)}
          style={{
            padding: '6px 18px', borderRadius: 6, border: 'none',
            background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <IcoFilter size={14} /> Lọc
        </button>
        <button
          onClick={() => {
            setWarehouseId(''); setTxType(''); setDateFrom(''); setDateTo(''); setSearch('');
          }}
          style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
            background: '#fff', color: '#374151', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <IcoX size={14} /> Reset
        </button>
      </div>

      {/* Summary strip */}
      <SummaryStrip
        warehouseId={warehouseId || undefined}
        dateFrom={dateFrom || undefined}
        dateTo={dateTo || undefined}
      />

      {error && <AlertMessage type='danger' message={error} onClose={() => setError(null)} />}

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
              {['#ID', 'Thời gian', 'Kho', 'Sản phẩm', 'Loại GD', 'Thay đổi', 'Số dư', 'Giá vốn/ĐV', 'Tác động CV', 'Nguồn', 'Ghi chú', 'Người thực hiện'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Thay đổi' || h === 'Số dư' || h === 'Giá vốn/ĐV' || h === 'Tác động CV' ? 'right' : 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [1,2,3,4,5,6,7,8].map(i => <SkeletonRow key={i} cols={12} />)
              : rows.length === 0
                ? (
                  <tr>
                    <td colSpan={12} style={{ padding: 0 }}>
                      <EmptyState
                        icon='search'
                        message='Chưa có bản ghi sổ cái'
                        sub='Thực hiện nhập/xuất kho để dữ liệu được ghi vào đây, hoặc điều chỉnh bộ lọc'
                      />
                    </td>
                  </tr>
                )
                : rows.map((r, idx) => (
                  <tr
                    key={r.id}
                    style={{
                      background: idx % 2 === 0 ? '#fff' : '#f9fafb',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <td style={{ padding: '7px 10px', color: '#9ca3af', fontFamily: 'monospace', fontSize: '.75rem' }}>
                      #{r.id}
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#4b5563', fontSize: '.75rem' }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>
                      {r.warehouse_name || `#${r.warehouse_id}`}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{r.product_name}</div>
                      <div style={{ fontSize: '.72rem', color: '#9ca3af' }}>{r.sku} · {r.product_unit}</div>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <TxBadge type={r.transaction_type} />
                    </td>
                    <QtyCell value={r.quantity_change} />
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>
                      {fmt(r.running_balance)}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#6b7280', fontSize: '.78rem' }}>
                      {fmtCurrency(r.cost_per_unit)}₫
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: Number(r.cost_impact) >= 0 ? '#16a34a' : '#dc2626', fontSize: '.78rem' }}>
                      {fmtCurrency(r.cost_impact)}₫
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontSize: '.75rem' }}>
                      {r.reference_type
                        ? <span style={{ color: '#4b5563' }}>{REF_LABELS[r.reference_type] || r.reference_type} #{r.reference_id}</span>
                        : <span style={{ color: '#d1d5db' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '7px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7280', fontSize: '.75rem' }}
                      title={r.note || ''}>
                      {r.note || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontSize: '.75rem', color: '#4b5563' }}>
                      {r.created_by_name || `#${r.created_by_id || '—'}`}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <button
            disabled={page === 1}
            onClick={() => load(page - 1)}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #d1d5db', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? .4 : 1, background: '#fff', fontWeight: 600 }}
          >‹ Trước</button>
          <span style={{ fontSize: '.83rem', color: '#6b7280' }}>
            Trang {page} / {totalPages} · {fmt(total)} bản ghi
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => load(page + 1)}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #d1d5db', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? .4 : 1, background: '#fff', fontWeight: 600 }}
          >Sau ›</button>
        </div>
      )}

      {/* Footer note */}
      <p style={{ marginTop: 12, fontSize: '.73rem', color: '#9ca3af', textAlign: 'center' }}>
        📌 Sổ cái là nguồn audit trail bất biến — mỗi dòng tương ứng 1 giao dịch trong stock_transactions.
        Dữ liệu chỉ đọc, không thể chỉnh sửa.
      </p>
    </div>
  );
}