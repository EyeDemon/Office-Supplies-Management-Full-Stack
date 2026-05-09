import React from 'react';
import { IcoWarehouse } from '@/components/common/Icons.jsx';

const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="auth-layout-v2">
      {/* Background decorative elements */}
      <div className="auth-bg-decoration">
        <div className="auth-blob auth-blob-1"></div>
        <div className="auth-blob auth-blob-2"></div>
        <div className="auth-blob auth-blob-3"></div>
      </div>

      <div className="auth-container-v2">
        {/* Left Side: Brand Panel */}
        <div className="auth-brand-side">
          <div className="auth-brand-content">
            <div className="auth-logo-wrapper">
              <div className="auth-logo-box">
                <IcoWarehouse size={28} />
              </div>
              <div className="auth-logo-text">
                <span className="logo-main">QLVPP</span>
                <span className="logo-sub">Enterprise System</span>
              </div>
            </div>

            <div className="auth-hero-text">
              <h1 className="hero-title">
                Quản trị kho <br />
                <span className="text-highlight">thông minh & tối ưu</span>
              </h1>
              <p className="hero-desc">
                Giải pháp toàn diện cho quản lý văn phòng phẩm. 
                Tăng hiệu quả công việc, giảm thiểu lãng phí và kiểm soát tồn kho chính xác.
              </p>
            </div>

            <div className="auth-stats-grid">
              <div className="stat-item">
                <div className="stat-val">99.9%</div>
                <div className="stat-lab">Chính xác</div>
              </div>
              <div className="stat-item">
                <div className="stat-val">Real-time</div>
                <div className="stat-lab">Cập nhật</div>
              </div>
              <div className="stat-item">
                <div className="stat-val">Easy</div>
                <div className="stat-lab">Sử dụng</div>
              </div>
            </div>
          </div>
          
          <div className="auth-brand-footer">
            © 2024 QLVPP Enterprise • Phiên bản 4.0
          </div>
        </div>

        {/* Right Side: Form Panel */}
        <div className="auth-form-side">
          <div className="auth-card-premium">
            <div className="auth-card-header">
              <h2 className="auth-form-title">{title}</h2>
              <p className="auth-form-subtitle">{subtitle}</p>
            </div>
            
            <div className="auth-card-body">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
