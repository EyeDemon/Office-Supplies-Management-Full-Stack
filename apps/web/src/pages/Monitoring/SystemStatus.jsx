import React, { useState, useEffect } from 'react';
import axios from 'axios';

const SystemStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/health');
      setStatus(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data || { status: 'DOWN', message: err.message });
      setStatus(err.response?.data || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (s) => {
    if (s === 'UP') return '#10b981'; // Green
    if (s === 'DOWN') return '#ef4444'; // Red
    return '#f59e0b'; // Amber
  };

  return (
    <div className="system-status-container" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div className="card shadow-sm border-0" style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div className="card-header bg-white border-bottom-0 pt-4 px-4 d-flex justify-content-between align-items-center">
          <h4 className="mb-0 fw-bold text-dark">Trạng thái Hệ thống</h4>
          <button 
            className="btn btn-sm btn-outline-primary" 
            onClick={fetchStatus}
            disabled={loading}
          >
            {loading ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>
        
        <div className="card-body p-4">
          <div className="d-flex align-items-center mb-4 p-3 rounded" style={{ backgroundColor: '#f8fafc' }}>
            <div 
              style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                backgroundColor: getStatusColor(status?.status || 'DOWN'),
                marginRight: '12px',
                boxShadow: `0 0 8px ${getStatusColor(status?.status || 'DOWN')}`
              }} 
            />
            <span className="fw-bold text-uppercase" style={{ color: getStatusColor(status?.status || 'DOWN') }}>
              Backend API: {status?.status || 'DOWN'}
            </span>
            <span className="ms-auto text-muted small">
              Cập nhật lúc: {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : 'N/A'}
            </span>
          </div>

          <div className="row g-3">
            <div className="col-md-6">
              <div className="p-3 border rounded">
                <div className="text-muted small mb-1">Phiên bản</div>
                <div className="fw-bold">{status?.version || '4.1.0'}</div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="p-3 border rounded">
                <div className="text-muted small mb-1">Môi trường</div>
                <div className="fw-bold text-capitalize">Production</div>
              </div>
            </div>
            {error && (
              <div className="col-12">
                <div className="alert alert-danger mb-0">
                  <h6 className="alert-heading fw-bold">Chi tiết lỗi:</h6>
                  <p className="mb-0 small">{error.message || 'Không thể kết nối đến máy chủ API.'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="card-footer bg-light border-0 py-3 px-4">
          <small className="text-muted">
            <i className="bi bi-info-circle me-1"></i>
            Trang này hiển thị trạng thái vận hành của các dịch vụ cốt lõi. Nếu API hiển thị "DOWN", vui lòng kiểm tra Docker logs.
          </small>
        </div>
      </div>
    </div>
  );
};

export default SystemStatus;
