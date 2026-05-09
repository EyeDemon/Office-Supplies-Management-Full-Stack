import React from 'react';

const LoadingSpinner = ({ fullPage, message = 'Đang tải...' }) => {
  if (fullPage) return (
    <div className="loading-page">
      <div style={{ textAlign:'center' }}>
        <div className="spinner-border" role="status"><span className="visually-hidden">Loading...</span></div>
        <p style={{ marginTop:'.75rem', fontSize:'.875rem', color:'var(--text-secondary)' }}>{message}</p>
      </div>
    </div>
  );
  return (
    <div style={{ textAlign:'center', padding:'2rem' }}>
      <div className="spinner-border spinner-border-sm" role="status" style={{ color:'var(--brand-primary)' }}/>
    </div>
  );
};
export default LoadingSpinner;
