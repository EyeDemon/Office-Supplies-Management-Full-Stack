import React, { useState, useCallback } from 'react';
import AlertMessage from '@/components/common/AlertMessage.jsx';

// Refactored components
import PRTab from '../components/PRTab';
import POTab from '../components/POTab';
import AutoPRTab from '../components/AutoPRTab';
import PriceHistoryTab from '../components/PriceHistoryTab';

export default function Purchases() {
  const [tab, setTab]   = useState('pr');
  const [alert, setAlertState] = useState(null);

  const setAlert = useCallback((type, message) => {
    setAlertState({ type, message });
    if (type === 'success') setTimeout(() => setAlertState(null), 4000);
  }, []);

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý mua hàng</h1>
          <p className="page-subtitle">Quản lý yêu cầu mua hàng (PR) và đơn mua hàng (PO) · Theo dõi quy trình thu mua chuyên nghiệp</p>
        </div>
      </div>

      {alert && <AlertMessage type={alert.type} message={alert.message} />}

      <div className="data-card mb-4">
        <div style={{ display:'flex', gap:'1.5rem', padding: '0 1.5rem', borderBottom:'1px solid #e5e7eb' }}>
          {[
            ['pr','Yêu cầu mua hàng (PR)'],
            ['po','Đơn mua hàng (PO)'],
            ['autopr','Tự động (Auto PR)'],
            ['pricehistory','Lịch sử giá'],
          ].map(([k,v]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding:'1rem 0.25rem', border:'none', background:'transparent', cursor:'pointer',
              fontWeight: tab===k ? 700 : 500,
              color: tab===k ? 'var(--brand-primary)' : 'var(--text-muted)',
              borderBottom: tab===k ? '3px solid var(--brand-primary)' : '3px solid transparent',
              fontSize:'0.875rem', transition:'all 0.2s',
              marginBottom: '-1px'
            }}>{v}</button>
          ))}
        </div>
      </div>

      <div className="animate-fade-in">
        {tab === 'pr'           && <PRTab setAlert={setAlert} />}
        {tab === 'po'           && <POTab setAlert={setAlert} />}
        {tab === 'autopr'       && <AutoPRTab setAlert={setAlert} />}
        {tab === 'pricehistory' && <PriceHistoryTab setAlert={setAlert} />}
      </div>
    </div>
  );
}